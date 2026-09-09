import { idSchema } from "@/lib/validation";
import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult, readPage } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";

import { requireUser } from "@/lib/auth/guards";

export type Thread = {
  counterpartId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

/** Aggregate complete conversations in SQL; the response contains one preview per person. */
export async function listThreads(requestedPage?: unknown, unreadOnly = false) {
  const { db, user } = await requireUser("/mypage/messages");
  const scoped = db
    .with("conversation_messages", (qb) =>
      qb
        .selectFrom("messages")
        .select(["id", "body", "created_at", "recipient_id", "read_at"])
        .select((eb) =>
          eb
            .case()
            .when("sender_id", "=", user.id)
            .then(eb.ref("recipient_id"))
            .else(eb.ref("sender_id"))
            .end()
            .as("counterpart_id"),
        )
        .where((eb) =>
          eb.or([
            eb("sender_id", "=", user.id),
            eb("recipient_id", "=", user.id),
          ]),
        ),
    )
    .with("ranked", (qb) =>
      qb
        .selectFrom("conversation_messages")
        .selectAll()
        .select([
          sql<number>`row_number() over (partition by counterpart_id order by created_at desc, id desc)`.as(
            "rank",
          ),
          sql<number>`count(*) filter (where recipient_id = ${user.id}::uuid and read_at is null) over (partition by counterpart_id)`.as(
            "unread",
          ),
        ]),
    );
  let query = scoped
    .selectFrom("ranked")
    .innerJoin("profiles", "profiles.id", "ranked.counterpart_id")
    .select([
      "ranked.counterpart_id as counterpartId",
      "profiles.display_name as name",
      "profiles.avatar_url as avatarUrl",
      "profiles.role",
      "ranked.created_at as lastAt",
      "ranked.unread",
      sql<string>`left(ranked.body, 120)`.as("lastBody"),
    ])
    .where("ranked.rank", "=", 1);
  if (unreadOnly) query = query.where("ranked.unread", ">", 0);
  const [page, count] = await Promise.all([
    readPage(
      query.orderBy("ranked.created_at", "desc").orderBy("ranked.id", "desc"),
      requestedPage,
    ),
    db
      .selectFrom("messages")
      .select((eb) => eb.fn.countAll<number>().as("unread"))
      .where("recipient_id", "=", user.id)
      .where("read_at", "is", null)
      .executeTakeFirstOrThrow(),
  ]);
  return { ...page, totalUnread: count.unread };
}

/** Read only. Older messages use a timestamp/ID cursor so new arrivals don't shift the page. */
export async function getThread(counterpartId: string, before?: string) {
  const { db, user } = await requireUser("/mypage/messages");
  let query = db
    .selectFrom("messages")
    .select([
      "id",
      "sender_id",
      "recipient_id",
      "body",
      "read_at",
      "created_at",
      "order_id",
    ])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("sender_id", "=", user.id),
          eb("recipient_id", "=", counterpartId),
        ]),
        eb.and([
          eb("sender_id", "=", counterpartId),
          eb("recipient_id", "=", user.id),
        ]),
      ]),
    );
  if (before && idSchema.safeParse(before).success) {
    const anchor = query
      .clearSelect()
      .select(["created_at", "id"])
      .where("id", "=", before);
    query = query.where(
      sql<boolean>`(messages.created_at, messages.id) < (${anchor})`,
    );
  }
  const [counterpart, rows] = await Promise.all([
    db
      .selectFrom("profiles")
      .select(["id", "display_name", "avatar_url", "role", "bio"])
      .where("id", "=", counterpartId)
      .executeTakeFirst(),
    query
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(51)
      .execute(),
  ]);
  if (!counterpart) return null;
  const messages = rows.slice(0, 50).reverse();
  const olderCursor = rows.length > 50 ? messages[0].id : null;

  // 取引に紐づくメッセージがあれば、その注文をチップで出す（自分が買った注文だけ読める）
  const orderIds = [
    ...new Set(
      (messages ?? []).map((m) => m.order_id).filter((v): v is string => !!v),
    ),
  ];
  const { data: orders } = orderIds.length
    ? await queryResult(
        db
          .selectFrom("orders")
          .select((eb) => [
            "orders.id",
            "orders.status",
            "orders.total_amount",
            jsonArrayFrom(
              eb
                .selectFrom("order_items as r0")
                .select((eb) => [
                  jsonObjectFrom(
                    eb
                      .selectFrom("works as r1")
                      .select(["r1.title"])
                      .whereRef("r1.id", "=", "r0.work_id"),
                  ).as("works"),
                ])
                .whereRef("r0.order_id", "=", "orders.id"),
            ).as("order_items"),
          ])
          .where(sql<boolean>`${sql.ref("orders.id")} = any(${orderIds})`)
          .execute(),
      )
    : { data: [] };

  return {
    me: user.id,
    counterpart,
    messages,
    olderCursor,
    orders: new Map((orders ?? []).map((o) => [o.id, o])),
  };
}

/** `with=admin` を運営のユーザーIDに解く（運営が複数いれば最初の1人）。 */
export async function resolveCounterpart(param: string | undefined) {
  if (!param) return null;
  if (param !== "admin")
    return idSchema.safeParse(param).success ? param : null;
  const { db } = await requireUser("/mypage/messages");
  const { data } = await queryResult(
    db
      .selectFrom("profiles")
      .select(["profiles.id"])
      .where("profiles.role", "=", "admin")
      .orderBy("profiles.created_at", "asc")
      .limit(1)
      .executeTakeFirst(),
  );
  return data?.id ?? null;
}
