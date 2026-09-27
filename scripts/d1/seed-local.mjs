/** Disposable local fixtures only. getPlatformProxy never uses remote bindings. */
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { hashPassword } from "better-auth/crypto";
const config = parse(readFileSync("wrangler.jsonc", "utf8"));
const temp = mkdtempSync(join(tmpdir(), "oshinest-local-seed-"));
const path = join(temp, "wrangler.json");
writeFileSync(
  path,
  JSON.stringify({
    name: "oshinest-local-seed",
    compatibility_date: config.compatibility_date,
    d1_databases: config.d1_databases.map(
      ({ binding, database_name, database_id }) => ({
        binding,
        database_name,
        database_id,
      }),
    ),
    r2_buckets: config.r2_buckets.map(({ binding, bucket_name }) => ({
      binding,
      bucket_name,
    })),
  }),
);
const proxy = await getPlatformProxy({
  configPath: path,
  persist: { path: resolve(".wrangler/state/v3") },
});
const { DATABASE: db, FILES: files } = proxy.env;
try {
  if (!process.argv.includes("--storage-only")) {
    const { count } = await db
      .prepare("SELECT count(*) AS count FROM app_users")
      .first();
    if (count)
      throw new Error(
        "Local seed requires an empty D1 database; existing accounts were preserved.",
      );
    const statements = [];
    const add = (sql, ...values) =>
      statements.push(db.prepare(sql).bind(...values));
    add("UPDATE _request_context SET role='app_service' WHERE id=1");
    const users = [
      [
        "11111111-1111-1111-1111-111111111111",
        "buyer",
        "ぬい活マニア",
        "buyer",
      ],
      [
        "22222222-2222-2222-2222-222222222222",
        "creator",
        "みるく工房",
        "creator",
      ],
      [
        "33333333-3333-3333-3333-333333333333",
        "creator2",
        "ぷち家具店",
        "creator",
      ],
      [
        "44444444-4444-4444-4444-444444444444",
        "admin",
        "OshiNest運営",
        "admin",
      ],
    ];
    const password = await hashPassword("password123");
    for (const [id, email, name, role] of users) {
      add(
        "INSERT INTO app_users(id,email,name,email_verified) VALUES(?,?,?,1)",
        id,
        `${email}@example.com`,
        name,
      );
      add(
        "INSERT INTO auth_accounts(id,user_id,account_id,provider_id,password) VALUES(?,?,?,'credential',?)",
        crypto.randomUUID(),
        id,
        id,
        password,
      );
      add("UPDATE profiles SET role=? WHERE id=?", role, id);
    }
    for (const [index, title] of [
      "ふわもこ台座（丸型）",
      "ミニチュアソファ",
    ].entries()) {
      const work = crypto.randomUUID();
      add(
        "INSERT INTO works(id,creator_id,title,description,status,accepts_color_change) VALUES(?,?,?,?,'published',1)",
        work,
        users[1][0],
        title,
        "ローカル開発用のサンプル作品です。",
      );
      for (const [size, ratio] of [
        [10, 0.7],
        [15, 1],
        [20, 1.35],
      ]) {
        add(
          "INSERT INTO work_variants(work_id,size_label,nui_size_cm,scale_ratio,is_base,price_jpy,stock,is_listed,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,fit_width_mm,fit_height_mm,fit_depth_mm,est_filament_grams,est_print_hours,part_count) VALUES(?,?,?,?,?,3000,12,1,90,90,90,?,?,?,?,?,2)",
          work,
          `${size}cm`,
          size,
          ratio,
          Number(size === 15),
          124 * ratio,
          162 * ratio,
          105 * ratio,
          55 * ratio,
          2.4 * ratio,
        );
      }
      add(
        "INSERT INTO work_tags(work_id,tag_id) SELECT ?,id FROM tags WHERE slug IN (?,?)",
        work,
        index ? "kagu" : "daiza",
        "retro",
      );
      add(
        "INSERT INTO work_images(work_id,storage_path,sort_order) VALUES(?,?,0)",
        work,
        `demo/${work}.png`,
      );
    }
    add(
      "INSERT INTO addresses(user_id,recipient_name,postal_code,prefecture,city,address_line,phone,is_default) VALUES(?,'開発用会員','1500001','東京都','渋谷区','サンプル0-0-0','09000000000',1)",
      users[0][0],
    );
    add(
      "INSERT INTO nui_profiles(user_id,name,height_mm) VALUES(?,'みるく',108)",
      users[0][0],
    );
    add(
      "UPDATE _request_context SET role='app_guest',user_id=NULL,internal_depth=0 WHERE id=1",
    );
    await db.batch(statements);
    console.log(
      "Created local test accounts and sample works. Nothing was written remotely.",
    );
  }
  const { results } = await db
    .prepare("SELECT storage_path FROM work_images")
    .all();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
    "base64",
  );
  for (const row of results)
    await files.put(`work-images/${row.storage_path}`, png, {
      httpMetadata: { contentType: "image/png" },
    });
  console.log(`Created ${results.length} local R2 images.`);
} finally {
  await proxy.dispose();
  rmSync(temp, { recursive: true, force: true });
}
