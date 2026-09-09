import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
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

/**
 * スレッド一覧。相手（自分以外の参加者）ごとに束ねて、最新の1件と未読数を出す。
 * 件数は運営規模なら数百件なので、取ってからまとめる。
 */
export async function listThreads() {
  const { db, user } = await requireUser("/mypage/messages");
  const { data: rows } = await queryResult(
    db
      .selectFrom("messages")
      .select([
        "id",
        "sender_id",
        "recipient_id",
        "body",
        "read_at",
        "created_at",
      ])
      .where((eb) =>
        eb.or([
          eb("sender_id", "=", user.id),
          eb("recipient_id", "=", user.id),
        ]),
      )
      .orderBy("created_at", "desc")
      .limit(500)
      .execute(),
  );

  const byCounterpart = new Map<string, Thread>();
  for (const m of rows ?? []) {
    const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
    const t = byCounterpart.get(other) ?? {
      counterpartId: other,
      name: "",
      avatarUrl: null,
      role: "",
      lastBody: m.body,
      lastAt: m.created_at,
      unread: 0,
    };
    if (m.recipient_id === user.id && !m.read_at) t.unread += 1;
    byCounterpart.set(other, t);
  }

  const ids = [...byCounterpart.keys()];
  if (ids.length) {
    const { data: profiles } = await queryResult(
      db
        .selectFrom("profiles")
        .select([
          "profiles.id",
          "profiles.display_name",
          "profiles.avatar_url",
          "profiles.role",
        ])
        .where(sql<boolean>`${sql.ref("profiles.id")} = any(${ids})`)
        .execute(),
    );
    for (const p of profiles ?? []) {
      const t = byCounterpart.get(p.id);
      if (t) {
        t.name = p.display_name;
        t.avatarUrl = p.avatar_url;
        t.role = p.role;
      }
    }
  }
  return [...byCounterpart.values()];
}

/**
 * 相手とのやりとり。開いたときに自分あての未読を既読にする
 * （表示と同時に行う副作用だが、「開いた＝読んだ」の意味なのでここでやる）。
 */
export async function getThread(counterpartId: string) {
  const { db, user } = await requireUser("/mypage/messages");

  const [{ data: counterpart }, { data: messages }] = await Promise.all([
    queryResult(
      db
        .selectFrom("profiles")
        .select([
          "profiles.id",
          "profiles.display_name",
          "profiles.avatar_url",
          "profiles.role",
          "profiles.bio",
        ])
        .where("profiles.id", "=", counterpartId)
        .executeTakeFirst(),
    ),
    queryResult(
      db
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
        )
        .orderBy("created_at", "asc")
        .limit(500)
        .execute(),
    ),
  ]);
  if (!counterpart) return null;

  const unreadIds = (messages ?? [])
    .filter((m) => m.recipient_id === user.id && !m.read_at)
    .map((m) => m.id);
  if (unreadIds.length) {
    await queryResult(
      db
        .updateTable("messages")
        .set({ read_at: new Date().toISOString() })
        .where(sql<boolean>`${sql.ref("messages.id")} = any(${unreadIds})`)
        .returning(["id"])
        .execute(),
    );
  }

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
    messages: messages ?? [],
    orders: new Map((orders ?? []).map((o) => [o.id, o])),
  };
}

/** `with=admin` を運営のユーザーIDに解く（運営が複数いれば最初の1人）。 */
export async function resolveCounterpart(param: string | undefined) {
  if (!param) return null;
  if (param !== "admin") return param;
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
