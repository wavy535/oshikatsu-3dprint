import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import { Kysely, PostgresDialect, type PostgresPoolClient } from "kysely";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireAdmin: vi.fn(),
  getOptionalUser: vi.fn(),
}));
vi.mock("@/lib/files/s3", () => ({
  readModel: vi.fn(),
  checkStoredFile: vi.fn(),
}));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  serviceDatabase: vi.fn(),
}));
import { scopedPool, serviceDatabase } from "@/lib/db/client";
import { requireAdmin, getOptionalUser } from "@/lib/auth/guards";
import { readModel } from "@/lib/files/s3";
import { advanceBatchAction, finishPrintJobAction, submitQcAction } from "@/lib/ops/printing-actions";
import { registerAssetAction, saveWorkInfoAction } from "@/lib/works/step-actions";
import { validateAndPersistAsset } from "@/lib/works/asset-validation";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.TEST_DATABASE === "true";
const owner = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
const runtime = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
});
let failQuery: string | undefined;
function actor(userId?: string) {
  const pool = scopedPool(runtime, {
    role: userId ? "app_user" : "app_service",
    userId,
  });
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: {
        ...pool,
        async connect() {
          const client = await pool.connect();
          return {
            ...client,
            query: (async (sql: string, values: readonly unknown[]) => {
              // Use real PostgreSQL before and after the failing statement, including rollback.
              if (failQuery && sql.includes(failQuery))
                throw new Error("injected database failure");
              return client.query(sql, values);
            }) as PostgresPoolClient["query"],
          };
        },
      },
    }),
  });
}
let adminId: string,
  creatorId: string,
  workId: string,
  variantId: string,
  orderId: string,
  jobId: string,
  filamentId: string;
let creatorDb: ReturnType<typeof actor>;
function form(values: Record<string, string>) {
  const result = new FormData();
  Object.entries(values).forEach(([key, value]) => result.set(key, value));
  return result;
}
function workInput(
  variants = [{ id: variantId, priceJpy: 1000, stock: 10, isListed: true }],
) {
  return form({
    payload: JSON.stringify({
      workId,
      title: "保存後",
      description: "更新",
      tagIds: [],
      variants,
      accepts: {
        colorChange: false,
        mirror: false,
        standHole: false,
        customSize: false,
        otherRequest: false,
      },
      fit: { widthMm: 80, heightMm: 60, depthMm: 40 },
    }),
  });
}
async function qcInput() {
  const result = form({ jobId });
  const definitions = await owner.query(
    "select code from qc_check_definitions where is_active",
  );
  definitions.rows.forEach((row) => result.set(`check_${row.code}`, "pass"));
  return result;
}

afterAll(async () => {
  await Promise.all([owner.end(), runtime.end()]);
});
describe.skipIf(!enabled)("atomic backend operations", () => {
  beforeEach(async () => {
    const target = new URL(process.env.MIGRATION_DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.port !== "55432" ||
      target.pathname !== "/oshinest"
    ) {
      throw new Error("These fixtures require the local Compose database");
    }
    failQuery = undefined;
    [adminId, creatorId, workId, variantId, orderId, jobId, filamentId] =
      Array.from({ length: 7 }, () => randomUUID());
    await owner.query(
      "insert into app_users (id,email) values ($1,$2),($3,$4)",
      [
        adminId,
        `${adminId}@example.invalid`,
        creatorId,
        `${creatorId}@example.invalid`,
      ],
    );
    await owner.query(
      "update profiles set role = case when id=$1 then 'admin'::user_role else 'creator'::user_role end where id=any($2::uuid[])",
      [adminId, [adminId, creatorId]],
    );
    await owner.query(
      "insert into works (id,creator_id,title,status) values ($1,$2,'保存前','published')",
      [workId, creatorId],
    );
    await owner.query(
      "insert into work_variants (id,work_id,size_label,is_base,scale_ratio,price_jpy,stock,is_listed,bbox_x_mm,bbox_y_mm,bbox_z_mm) values ($1,$2,'10cm',true,1,1000,10,true,10,10,10)",
      [variantId, workId],
    );
    await owner.query(
      "insert into orders (id,buyer_id,status,subtotal_amount,total_amount,is_demo) values ($1,$2,'printing',1000,1000,true)",
      [orderId, adminId],
    );
    const item = await owner.query(
      "insert into order_items (order_id,work_id,creator_id,variant_id,unit_price,quantity,creator_payout_amount,platform_fee_amount,print_cost_amount,stl_storage_path_snapshot,filament_material_snapshot,filament_color_snapshot) values ($1,$2,$3,$4,1000,1,800,200,0,'test.stl','PLA','white') returning id",
      [orderId, workId, creatorId, variantId],
    );
    await owner.query(
      "insert into print_jobs (id,order_id,order_item_id,variant_id,status,batch_count) values ($1,$2,$3,$4,'printing',2)",
      [jobId, orderId, item.rows[0].id, variantId],
    );
    await owner.query(
      "insert into filaments (id,material,color_name,color_hex,stock_grams) values ($1,'PLA',$2,'#FFFFFF',100)",
      [filamentId, filamentId],
    );
    creatorDb = actor(creatorId);
    vi.mocked(requireAdmin).mockResolvedValue({
      db: actor(adminId),
      user: { id: adminId },
    } as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(getOptionalUser).mockResolvedValue({
      db: creatorDb,
      user: { id: creatorId },
    } as Awaited<ReturnType<typeof getOptionalUser>>);
    vi.mocked(serviceDatabase).mockReturnValue(actor());
  });
  afterEach(async () => {
    failQuery = undefined;
    await owner.query("delete from orders where buyer_id=$1", [adminId]);
    await owner.query("delete from works where creator_id=$1", [creatorId]);
    await owner.query("delete from filament_ledger where filament_id=$1", [
      filamentId,
    ]);
    await owner.query("delete from filaments where id=$1", [filamentId]);
    await owner.query("delete from app_users where id=any($1::uuid[])", [
      [adminId, creatorId],
    ]);
  });

  test("failed stock recording rolls back completion, order status and event history", async () => {
    const before = await owner.query(
      "select count(*) from print_job_events where print_job_id=$1",
      [jobId],
    );
    const result = await finishPrintJobAction(
      { error: null },
      form({
        jobId,
        actualGrams: "10",
        actualHours: "1",
        filamentId: randomUUID(),
      }),
    );
    expect(result.error).toBeTruthy();
    expect(
      (
        await owner.query(
          "select status,actual_filament_grams from print_jobs where id=$1",
          [jobId],
        )
      ).rows[0],
    ).toEqual({ status: "printing", actual_filament_grams: null });
    expect(
      (
        await owner.query(
          "select count(*) from print_job_events where print_job_id=$1",
          [jobId],
        )
      ).rows,
    ).toEqual(before.rows);
  });
  test("concurrent completion consumes stock once", async () => {
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        finishPrintJobAction(
          { error: null },
          form({ jobId, actualGrams: "10", actualHours: "1", filamentId }),
        ),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(
      (
        await owner.query("select stock_grams from filaments where id=$1", [
          filamentId,
        ])
      ).rows[0].stock_grams,
    ).toBe(90);
    expect(
      (
        await owner.query(
          "select count(*) from filament_ledger where print_job_id=$1",
          [jobId],
        )
      ).rows[0].count,
    ).toBe("1");
  });
  test("concurrent batches do not overwrite progress or exceed the total", async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        advanceBatchAction({ error: null }, form({ jobId })),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(2);
    expect(
      (
        await owner.query("select batch_done from print_jobs where id=$1", [
          jobId,
        ])
      ).rows[0].batch_done,
    ).toBe(2);
  });
  test("QC details failing to save rolls back the inspection and its status trigger", async () => {
    await owner.query("update print_jobs set status='printed' where id=$1", [
      jobId,
    ]);
    failQuery = 'insert into "qc_check_results"';
    const result = await submitQcAction({ error: null }, await qcInput());
    expect(result.error).toBeTruthy();
    expect(
      (await owner.query("select status from print_jobs where id=$1", [jobId]))
        .rows[0].status,
    ).toBe("printed");
    expect(
      (
        await owner.query(
          "select count(*) from qc_inspections where print_job_id=$1",
          [jobId],
        )
      ).rows[0].count,
    ).toBe("0");
  });
  test("QC cannot pass when definitions cannot be loaded", async () => {
    await owner.query("update print_jobs set status='printed' where id=$1", [
      jobId,
    ]);
    failQuery = 'from "qc_check_definitions"';
    expect(
      (await submitQcAction({ error: null }, form({ jobId }))).error,
    ).toBeTruthy();
    expect(
      (await owner.query("select status from print_jobs where id=$1", [jobId]))
        .rows[0].status,
    ).toBe("printed");
  });
  test("a late price failure rolls back work metadata and dimensions", async () => {
    expect(
      (
        await saveWorkInfoAction(
          { error: null },
          workInput([
            { id: variantId, priceJpy: 1, stock: 10, isListed: true },
          ]),
        )
      ).error,
    ).toBeTruthy();
    expect(
      (await owner.query("select title from works where id=$1", [workId]))
        .rows[0].title,
    ).toBe("保存前");
    expect(
      (
        await owner.query(
          "select price_jpy,fit_width_mm from work_variants where id=$1",
          [variantId],
        )
      ).rows[0],
    ).toEqual({ price_jpy: 1000, fit_width_mm: null });
  });
  test("saving one work cannot change a different work owned by the same creator", async () => {
    const other = await owner.query(
      "insert into works (creator_id,title) values ($1,'別作品') returning id",
      [creatorId],
    );
    const otherVariant = await owner.query(
      "insert into work_variants (work_id,size_label,price_jpy) values ($1,'別サイズ',500) returning id",
      [other.rows[0].id],
    );
    expect(
      (
        await saveWorkInfoAction(
          { error: null },
          workInput([
            {
              id: otherVariant.rows[0].id,
              priceJpy: 1000,
              stock: 10,
              isListed: true,
            },
          ]),
        )
      ).error,
    ).toBeTruthy();
    expect(
      (
        await owner.query("select price_jpy from work_variants where id=$1", [
          otherVariant.rows[0].id,
        ])
      ).rows[0].price_jpy,
    ).toBe(500);
  });
  test("derived dimensions rescale while explicitly entered dimensions are retained", async () => {
    await owner.query(
      "insert into work_variants (work_id,size_label,scale_ratio,fit_width_mm,fit_source) values ($1,'auto',2,20,'auto'),($1,'manual',3,55,'creator')",
      [workId],
    );
    await expect(
      saveWorkInfoAction({ error: null }, workInput()),
    ).rejects.toThrow("redirect:");
    const rows = (
      await owner.query(
        "select size_label,fit_width_mm from work_variants where work_id=$1 order by size_label",
        [workId],
      )
    ).rows;
    expect(rows).toEqual([
      { size_label: "10cm", fit_width_mm: "80.00" },
      { size_label: "auto", fit_width_mm: "160.00" },
      { size_label: "manual", fit_width_mm: "55.00" },
    ]);
  });
  test("failed analysis persistence preserves the previous asset and its parts", async () => {
    const asset = await owner.query(
      "insert into work_assets (work_id,storage_path,file_name,file_format,file_size_bytes,validation_status,triangle_count) values ($1,'test.stl','tetrahedron.stl','stl',100,'passed',99) returning id",
      [workId],
    );
    const assetId = asset.rows[0].id;
    const object = await owner.query(
      "insert into work_asset_objects (asset_id,object_index,name,bbox_x_mm,bbox_y_mm,bbox_z_mm,volume_cm3) values ($1,0,'previous part',1,1,1,1) returning id",
      [assetId],
    );
    vi.mocked(readModel).mockResolvedValue(
      readFileSync("tests/fixtures/tetrahedron.stl"),
    );
    failQuery = 'insert into "work_validation_issues"';
    expect((await validateAndPersistAsset(assetId, workId)).ok).toBe(false);
    expect(
      (
        await owner.query(
          "select triangle_count from work_assets where id=$1",
          [assetId],
        )
      ).rows[0].triangle_count,
    ).toBe(99);
    expect(
      (
        await owner.query(
          "select id from work_asset_objects where asset_id=$1",
          [assetId],
        )
      ).rows[0].id,
    ).toBe(object.rows[0].id);
  });
  const modelFile = readFileSync("tests/fixtures/tetrahedron.stl");
  function registerModel(name: string) {
    return registerAssetAction({ error: null }, form({
      workId, storagePath: `${creatorId}/${workId}/${name}.stl`,
      fileName: "tetrahedron.stl", fileSize: String(modelFile.length),
    }));
  }
  async function assetSnapshot() {
    return (await owner.query(`select jsonb_build_object(
      'assets', (select jsonb_agg(a order by a.id) from work_assets a where a.work_id=$1),
      'objects', (select jsonb_agg(o order by o.id) from work_asset_objects o join work_assets a on a.id=o.asset_id where a.work_id=$1),
      'variants', (select jsonb_agg(v order by v.id) from work_variants v where v.work_id=$1),
      'instructions', (select jsonb_agg(i order by i.id) from work_part_instructions i where i.work_id=$1)
    ) as snapshot`, [workId])).rows[0].snapshot;
  }
  test("replacement keeps asset and variant references, prices and matching part instructions", async () => {
    vi.mocked(readModel).mockResolvedValue(modelFile);
    expect(await registerModel("first")).toEqual({ error: null, ok: true });
    const first = await assetSnapshot();
    await owner.query("update work_part_instructions set note='keep this',no_rotate=true where work_id=$1", [workId]);
    await owner.query("update work_variants set price_jpy=3210,stock=7,is_listed=true where id=$1", [variantId]);
    expect(await registerModel("replacement")).toEqual({ error: null, ok: true });
    const after = await assetSnapshot();
    expect(after.assets).toHaveLength(1);
    expect(after.assets[0]).toMatchObject({ id: first.assets[0].id, storage_path: `${creatorId}/${workId}/replacement.stl` });
    expect(after.variants.find((v: { id: string }) => v.id === variantId)).toMatchObject({ asset_id: first.assets[0].id, price_jpy: 3210, stock: 7, is_listed: true });
    expect(after.instructions[0]).toMatchObject({ note: "keep this", no_rotate: true });
    expect((await owner.query("select variant_id from print_jobs where id=$1", [jobId])).rows[0].variant_id).toBe(variantId);
  });
  test("failed parsing and failed replacement transactions preserve the previous file and derived rows", async () => {
    vi.mocked(readModel).mockResolvedValue(modelFile);
    expect((await registerModel("first")).ok).toBe(true);
    const first = await assetSnapshot();
    // Same uploaded byte count; invalid format must be rejected during analysis.
    vi.mocked(readModel).mockResolvedValueOnce(Buffer.alloc(modelFile.length));
    expect((await registerModel("bad")).error).toBeTruthy();
    expect(await assetSnapshot()).toEqual(first);
    failQuery = 'insert into "work_validation_issues"';
    expect((await registerModel("failed-save")).error).toBeTruthy();
    expect(await assetSnapshot()).toEqual(first);
  });
  test.each([false, true])("stale reanalysis cannot overwrite a replaced asset (parse failure: %s)", async (invalid) => {
    vi.mocked(readModel).mockResolvedValue(modelFile);
    expect((await registerModel("first")).ok).toBe(true);
    const first = await assetSnapshot();
    const id = first.assets[0].id;
    vi.mocked(readModel).mockImplementationOnce(async () => {
      await owner.query("update work_assets set storage_path='newer.stl' where id=$1", [id]);
      return invalid ? Buffer.alloc(modelFile.length) : modelFile;
    });
    expect((await validateAndPersistAsset(id, workId)).ok).toBe(false);
    const after = await assetSnapshot();
    expect(after.assets[0].storage_path).toBe("newer.stl");
    after.assets[0].storage_path = first.assets[0].storage_path;
    expect(after).toEqual(first);
  });

});
