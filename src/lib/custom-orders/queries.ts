import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";

import "server-only";

import { requireCreator, requireUser } from "@/lib/auth/guards";

/** 買う人：自分の相談一覧。 */
export async function listMyCustomRequests() {
  const { db, user } = await requireUser("/mypage/custom-orders");
  const { data } = await queryResult(
    db
      .selectFrom("custom_order_requests")
      .select((eb) => [
        "custom_order_requests.id",
        "custom_order_requests.status",
        "custom_order_requests.message",
        "custom_order_requests.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r0")
            .select(["r0.id", "r0.display_name", "r0.avatar_url"])
            .whereRef("r0.id", "=", "custom_order_requests.creator_id"),
        ).as("profiles"),
        jsonObjectFrom(
          eb
            .selectFrom("works as r1")
            .select(["r1.id", "r1.title"])
            .whereRef("r1.id", "=", "custom_order_requests.reference_work_id"),
        ).as("works"),
        jsonArrayFrom(
          eb
            .selectFrom("custom_order_quotes as r2")
            .select([
              "r2.id",
              "r2.quote_no",
              "r2.status",
              "r2.price_jpy",
              "r2.print_fee_jpy",
              "r2.shipping_fee_jpy",
              "r2.expires_at",
              "r2.created_at",
            ])
            .whereRef("r2.request_id", "=", "custom_order_requests.id"),
        ).as("custom_order_quotes"),
      ])
      .where("custom_order_requests.requester_id", "=", user.id)
      .orderBy("custom_order_requests.created_at", "desc")
      .execute(),
  );
  return data ?? [];
}

/** 買う人：相談の詳細（見積りつき）。 */
export async function getMyCustomRequest(id: string) {
  const { db, user } = await requireUser("/mypage/custom-orders");
  const { data } = await queryResult(
    db
      .selectFrom("custom_order_requests")
      .select((eb) => [
        "custom_order_requests.id",
        "custom_order_requests.status",
        "custom_order_requests.message",
        "custom_order_requests.created_at",
        "custom_order_requests.creator_id",
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r0")
            .select(["r0.id", "r0.display_name", "r0.avatar_url"])
            .whereRef("r0.id", "=", "custom_order_requests.creator_id"),
        ).as("profiles"),
        jsonObjectFrom(
          eb
            .selectFrom("works as r1")
            .select(["r1.id", "r1.title"])
            .whereRef("r1.id", "=", "custom_order_requests.reference_work_id"),
        ).as("works"),
        jsonArrayFrom(
          eb
            .selectFrom("custom_order_quotes as r2")
            .select([
              "r2.id",
              "r2.quote_no",
              "r2.status",
              "r2.spec",
              "r2.price_jpy",
              "r2.print_fee_jpy",
              "r2.shipping_fee_jpy",
              "r2.lead_time_days",
              "r2.est_filament_grams",
              "r2.est_print_hours",
              "r2.part_count",
              "r2.note",
              "r2.expires_at",
              "r2.variant_id",
              "r2.accepted_at",
              "r2.ordered_at",
              "r2.created_at",
            ])
            .whereRef("r2.request_id", "=", "custom_order_requests.id"),
        ).as("custom_order_quotes"),
      ])
      .where("custom_order_requests.id", "=", id)
      .where("custom_order_requests.requester_id", "=", user.id)
      .executeTakeFirst(),
  );
  if (!data) return null;
  data.custom_order_quotes.sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return data;
}

/** 相談フォームの相手と参考作品。 */
export async function getCustomRequestTarget(
  creatorId: string,
  workId?: string,
) {
  const { db } = await requireUser("/mypage/custom-orders/new");
  const [{ data: creator }, { data: work }] = await Promise.all([
    queryResult(
      db
        .selectFrom("profiles")
        .select([
          "profiles.id",
          "profiles.display_name",
          "profiles.avatar_url",
          "profiles.bio",
        ])
        .where("profiles.id", "=", creatorId)
        .where("profiles.role", "=", "creator")
        .executeTakeFirst(),
    ),
    workId
      ? queryResult(
          db
            .selectFrom("works")
            .select([
              "works.id",
              "works.title",
              "works.accepts_color_change",
              "works.accepts_mirror",
              "works.accepts_stand_hole",
              "works.accepts_custom_size",
              "works.accepts_other_request",
            ])
            .where("works.id", "=", workId)
            .executeTakeFirst(),
        )
      : Promise.resolve({ data: null }),
  ]);
  return { creator, work };
}

/** クリエイター：届いた相談。 */
export async function listCreatorCustomRequests() {
  const { db, user } = await requireCreator();
  const { data } = await queryResult(
    db
      .selectFrom("custom_order_requests")
      .select((eb) => [
        "custom_order_requests.id",
        "custom_order_requests.status",
        "custom_order_requests.message",
        "custom_order_requests.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r3")
            .select(["r3.id", "r3.display_name", "r3.avatar_url"])
            .whereRef("r3.id", "=", "custom_order_requests.requester_id"),
        ).as("profiles"),
        jsonObjectFrom(
          eb
            .selectFrom("works as r4")
            .select(["r4.id", "r4.title"])
            .whereRef("r4.id", "=", "custom_order_requests.reference_work_id"),
        ).as("works"),
        jsonArrayFrom(
          eb
            .selectFrom("custom_order_quotes as r5")
            .select([
              "r5.id",
              "r5.quote_no",
              "r5.status",
              "r5.price_jpy",
              "r5.expires_at",
            ])
            .whereRef("r5.request_id", "=", "custom_order_requests.id"),
        ).as("custom_order_quotes"),
      ])
      .where("custom_order_requests.creator_id", "=", user.id)
      .orderBy("custom_order_requests.created_at", "desc")
      .execute(),
  );
  const rows = data ?? [];
  const rank = (s: string) => (s === "pending" ? 0 : s === "responded" ? 1 : 2);
  return rows.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      b.created_at.localeCompare(a.created_at),
  );
}

/** クリエイター：相談の詳細。見積りを書くための料金表も一緒に返す。 */
export async function getCreatorCustomRequest(id: string) {
  const { db, user } = await requireCreator();
  const [{ data }, { data: rule }] = await Promise.all([
    queryResult(
      db
        .selectFrom("custom_order_requests")
        .select((eb) => [
          "custom_order_requests.id",
          "custom_order_requests.status",
          "custom_order_requests.message",
          "custom_order_requests.created_at",
          "custom_order_requests.requester_id",
          jsonObjectFrom(
            eb
              .selectFrom("profiles as r3")
              .select(["r3.id", "r3.display_name", "r3.avatar_url"])
              .whereRef("r3.id", "=", "custom_order_requests.requester_id"),
          ).as("profiles"),
          jsonObjectFrom(
            eb
              .selectFrom("works as r4")
              .select(["r4.id", "r4.title"])
              .whereRef(
                "r4.id",
                "=",
                "custom_order_requests.reference_work_id",
              ),
          ).as("works"),
          jsonArrayFrom(
            eb
              .selectFrom("custom_order_quotes as r5")
              .select([
                "r5.id",
                "r5.quote_no",
                "r5.status",
                "r5.spec",
                "r5.price_jpy",
                "r5.print_fee_jpy",
                "r5.shipping_fee_jpy",
                "r5.lead_time_days",
                "r5.est_filament_grams",
                "r5.est_print_hours",
                "r5.part_count",
                "r5.note",
                "r5.expires_at",
                "r5.variant_id",
                "r5.accepted_at",
                "r5.ordered_at",
                "r5.created_at",
              ])
              .whereRef("r5.request_id", "=", "custom_order_requests.id"),
          ).as("custom_order_quotes"),
        ])
        .where("custom_order_requests.id", "=", id)
        .where("custom_order_requests.creator_id", "=", user.id)
        .executeTakeFirst(),
    ),
    queryResult(
      db
        .selectFrom("print_pricing_rules")
        .select([
          "print_pricing_rules.material_yen_per_gram",
          "print_pricing_rules.machine_yen_per_hour",
          "print_pricing_rules.handling_base_yen",
          "print_pricing_rules.handling_per_part_yen",
          "print_pricing_rules.shipping_fee_jpy",
          "print_pricing_rules.platform_fee_rate",
        ])
        .where("print_pricing_rules.is_active", "=", true)
        .executeTakeFirst(),
    ),
  ]);
  if (!data) return null;
  data.custom_order_quotes.sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return { request: data, rule };
}
