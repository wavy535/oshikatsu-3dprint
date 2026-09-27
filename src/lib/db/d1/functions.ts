import "server-only";
import { sql, type Kysely } from "kysely";
import type { Database, DbFunctions, DbEnums } from "@/types/database";
import { atomicBatch, context } from "./runtime";
import { effectiveNuiSize } from "@/lib/nuis/dimensions";
type Db = Kysely<Database>;
type Args<K extends keyof DbFunctions> = DbFunctions[K]["Args"];
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const admin =
  "EXISTS(SELECT 1 FROM profiles WHERE id=(SELECT user_id FROM _request_context WHERE id=1) AND role='admin')";
const authAdmin = { sql: `INSERT INTO _assert(ok) SELECT ${admin}` };
const command = (name: string, columns: string[], parameters: unknown[]) => ({
  sql: `INSERT INTO _${name}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
  parameters,
});
const requireService = (db: Db) => {
  if (context(db).actor.role !== "app_service")
    throw Object.assign(new Error("permission denied"), { code: "42501" });
};

async function changeCommand(
  db: Db,
  table: string,
  id: string,
  name: string,
  before: string,
) {
  const result = await atomicBatch(db, [
    { sql: `SELECT status FROM visible_${table} WHERE id=?`, parameters: [id] },
    command(
      name,
      [table === "custom_order_quotes" ? "quote_id" : "order_id"],
      [id],
    ),
  ]);
  return result[0].rows[0]?.status === before;
}
const emailTargets = `SELECT n.id,n.user_id,coalesce(ns.email_to,u.email) AS email,coalesce(ns.digest,'instant') AS digest,coalesce(ns.digest_hour,20) AS digest_hour,n.kind,n.title,n.body,n.link_path,n.created_at
FROM notifications n JOIN app_users u ON u.id=n.user_id LEFT JOIN notification_settings ns ON ns.user_id=n.user_id LEFT JOIN notification_preferences np ON np.user_id=n.user_id AND np.kind=n.kind
WHERE n.emailed_at IS NULL AND (n.email_claimed_until IS NULL OR n.email_claimed_until<=${now}) AND coalesce(np.email,1) AND n.created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')
AND coalesce(ns.email_to,u.email) IS NOT NULL AND (coalesce(ns.digest,'instant')='instant' OR coalesce(ns.digest_hour,20)=CAST(strftime('%H','now','+9 hours') AS INTEGER)) ORDER BY n.created_at,n.id LIMIT ?`;

export const handlers = {
  async place_demo_order(db: Db, args: Args<"place_demo_order">) {
    const result = await atomicBatch(db, [
      command(
        "checkout",
        ["order_id", "address_id", "request_id", "note"],
        [
          crypto.randomUUID(),
          args.p_address_id,
          args.p_request_id,
          args.p_note ?? null,
        ],
      ),
      {
        sql: "SELECT id FROM visible_orders WHERE buyer_id=? AND checkout_request_id=?",
        parameters: [context(db).actor.userId, args.p_request_id],
      },
    ]);
    const id = result[1].rows[0]?.id;
    if (typeof id !== "string") throw new Error("注文を保存できませんでした");
    return id;
  },
  confirm_demo_order: (db: Db, args: Args<"confirm_demo_order">) =>
    changeCommand(
      db,
      "orders",
      args.p_order_id,
      "confirm_order",
      "payment_pending",
    ),
  cancel_unpaid_order: (db: Db, args: Args<"cancel_unpaid_order">) =>
    changeCommand(
      db,
      "orders",
      args.p_order_id,
      "cancel_order",
      "payment_pending",
    ),
  async accept_custom_quote(db: Db, args: Args<"accept_custom_quote">) {
    const id = crypto.randomUUID();
    await atomicBatch(db, [
      command(
        "accept_quote",
        ["quote_id", "work_id", "variant_id"],
        [args.p_quote_id, crypto.randomUUID(), id],
      ),
    ]);
    return id;
  },
  decline_custom_quote: (db: Db, args: Args<"decline_custom_quote">) =>
    changeCommand(
      db,
      "custom_order_quotes",
      args.p_quote_id,
      "decline_quote",
      "sent",
    ),
  async calc_print_fee(db: Db, args: Args<"calc_print_fee">) {
    const row = await db
      .selectFrom("print_pricing_rules")
      .select(
        sql<number>`round(coalesce(${args.grams},0)*material_yen_per_gram)+round(coalesce(${args.hours},0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(${args.parts},1),1)`.as(
          "fee",
        ),
      )
      .where("is_active", "=", true)
      .executeTakeFirstOrThrow();
    return row.fee;
  },
  async estimate_filament_grams(db: Db, args: Args<"estimate_filament_grams">) {
    const shell = sql`min(${args.surface_area_cm2}*${args.shell_cm ?? 0.09},${args.volume_cm3})`;
    return (
      await db
        .selectNoFrom(
          sql<number>`round((${shell}+max(${args.volume_cm3}-${shell},0)*${args.infill ?? 0.15})*${args.density ?? 1.24},1)`.as(
            "grams",
          ),
        )
        .executeTakeFirstOrThrow()
    ).grams;
  },
  async grant_admin(db: Db, args: Args<"grant_admin">) {
    const result = await atomicBatch(db, [
      command("grant_admin", ["email"], [args.p_email]),
      {
        sql: "SELECT id FROM app_users WHERE lower(email)=lower(trim(?)) LIMIT 1",
        parameters: [args.p_email],
      },
    ]);
    return result[1].rows[0].id as string;
  },
  async revoke_admin(db: Db, args: Args<"revoke_admin">) {
    await atomicBatch(db, [
      command("revoke_admin", ["user_id"], [args.p_user_id]),
    ]);
  },
  async list_admin_members(db: Db) {
    return (
      await atomicBatch(db, [
        authAdmin,
        {
          sql: "SELECT p.id,p.display_name,u.email,p.created_at FROM profiles p JOIN app_users u ON u.id=p.id WHERE p.role='admin' ORDER BY p.created_at",
        },
      ])
    )[1].rows;
  },
  async expire_custom_quotes(db: Db) {
    const result = await db
      .updateTable("custom_order_quotes")
      .set({ status: "expired" })
      .where("status", "=", "sent")
      .where(
        "expires_at",
        "<",
        sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  },
  async purge_old_notifications(db: Db) {
    // Maintenance is an admin operation; the former SECURITY DEFINER function
    // must not let ordinary members erase other people's notifications.
    const result = await atomicBatch(db, [
      authAdmin,
      { sql: "UPDATE _request_context SET internal_depth=1 WHERE id=1" },
      {
        sql: "DELETE FROM notifications WHERE created_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')",
      },
    ]);
    return Number(result[2].numAffectedRows);
  },
  async mark_all_notifications_read(db: Db) {
    const result = await db
      .updateTable("notifications")
      .set({ read_at: new Date().toISOString() })
      .where("user_id", "=", context(db).actor.userId ?? "")
      .where("read_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  },
  async unread_notification_count(db: Db) {
    return (
      await db
        .selectFrom("notifications")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("user_id", "=", context(db).actor.userId ?? "")
        .where("read_at", "is", null)
        .executeTakeFirstOrThrow()
    ).count;
  },
  async notification_email_targets(
    db: Db,
    args: Args<"notification_email_targets">,
  ) {
    requireService(db);
    return (
      await atomicBatch(db, [
        {
          sql: emailTargets,
          parameters: [Math.max(1, Math.min(args.p_limit ?? 200, 200))],
        },
      ])
    )[0].rows;
  },
  async claim_notification_emails(
    db: Db,
    args: Args<"claim_notification_emails">,
  ) {
    requireService(db);
    if (!args.p_claim_token) throw new Error("claim token is required");
    const result = await atomicBatch(db, [
      {
        sql: `UPDATE notifications SET email_claim_token=?,email_claimed_until=strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes') WHERE id IN (SELECT id FROM (${emailTargets}))`,
        parameters: [
          args.p_claim_token,
          Math.max(1, Math.min(args.p_limit ?? 20, 200)),
        ],
      },
      {
        sql: `SELECT n.id,n.user_id,coalesce(ns.email_to,u.email) AS email,coalesce(ns.digest,'instant') AS digest,coalesce(ns.digest_hour,20) AS digest_hour,n.kind,n.title,n.body,n.link_path,n.created_at FROM notifications n JOIN app_users u ON u.id=n.user_id LEFT JOIN notification_settings ns ON ns.user_id=n.user_id WHERE n.email_claim_token=? AND n.emailed_at IS NULL ORDER BY n.created_at,n.id`,
        parameters: [args.p_claim_token],
      },
    ]);
    return result[1].rows;
  },
  async creator_public_stats(db: Db, args: Args<"creator_public_stats">) {
    // Public aggregates intentionally include sales counts, never buyer/order rows.
    const creator = args.p_creator_id;
    return (
      await atomicBatch(db, [
        {
          sql: `SELECT (SELECT count(*) FROM works WHERE creator_id=? AND status='published') AS works_count,(SELECT count(*) FROM creator_follows WHERE creator_id=?) AS follower_count,(SELECT coalesce(sum(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.creator_id=? AND o.status IN ('paid','printing_queued','printing','packaging','shipped','completed')) AS sold_count,(SELECT count(*) FROM reviews WHERE creator_id=?) AS review_count,(SELECT round(avg(rating),1) FROM reviews WHERE creator_id=?) AS avg_rating`,
          parameters: [creator, creator, creator, creator, creator],
        },
      ])
    )[0].rows;
  },
  async nui_fit_axes(db: Db, args: Args<"nui_fit_axes">) {
    const [v, n] = await Promise.all([
      db
        .selectFrom("work_variants")
        .select(["fit_width_mm", "fit_height_mm", "fit_depth_mm"])
        .where("id", "=", args.p_variant_id)
        .executeTakeFirst(),
      db
        .selectFrom("nui_profiles")
        .select([
          "sit_height_mm",
          "hug_width_mm",
          "shoulder_width_mm",
          "height_mm",
        ])
        .where("id", "=", args.p_nui_id)
        .executeTakeFirst(),
    ]);
    if (!v || !n) return [];
    const { widthMm: width, sitHeightMm: height } = effectiveNuiSize({
      heightMm: n.height_mm,
      sitHeightMm: n.sit_height_mm,
      shoulderWidthMm: n.shoulder_width_mm,
      hugWidthMm: n.hug_width_mm,
    });
    return [
      ["width", v.fit_width_mm, width, 40],
      ["height", v.fit_height_mm, height, 40],
      ["depth", v.fit_depth_mm, width, 60],
    ].map(([axis, slot, nui, loose]) => ({
      axis: axis as string,
      slot_mm: slot as number | null,
      nui_mm: nui as number,
      margin_mm:
        slot === null
          ? null
          : Math.round(((slot as number) - (nui as number)) * 10) / 10,
      verdict: judgeAxis(slot as number | null, nui as number, loose as number),
    }));
  },
  async nui_fit_verdict(db: Db, args: Args<"nui_fit_verdict">) {
    const axes = await handlers.nui_fit_axes(db, args);
    if (!axes.length || axes.every((a) => a.verdict === "unknown"))
      return "unknown";
    if (axes.some((a) => a.axis !== "depth" && a.verdict === "too_small"))
      return "too_small";
    if (axes.filter((a) => a.verdict === "loose").length >= 2) return "loose";
    return axes.some((a) => a.verdict === "tight") ? "tight" : "good";
  },
};
function judgeAxis(
  slot: number | null,
  nui: number | null,
  loose: number,
): DbEnums["fit_verdict"] {
  return slot === null || nui === null
    ? "unknown"
    : slot < nui
      ? "too_small"
      : slot - nui < 5
        ? "tight"
        : slot - nui > loose
          ? "loose"
          : "good";
}
export type DomainFunction = keyof typeof handlers;
export async function runFunction<K extends DomainFunction>(
  db: Db,
  name: K,
  args: Args<K>,
): Promise<DbFunctions[K]["Returns"]> {
  const handler = handlers[name] as (db: Db, args: Args<K>) => Promise<unknown>;
  return (await handler(db, args)) as DbFunctions[K]["Returns"];
}
