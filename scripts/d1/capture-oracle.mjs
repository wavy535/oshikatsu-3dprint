// One-time, local-only reference for the PostgreSQL -> D1 port. Never exports rows.
import pg from "pg";
import { writeFile } from "node:fs/promises";
import { requiredEnv } from "../env.mjs";
import { connectionOptions } from "../../src/lib/db/connection.mjs";

const url = new URL(requiredEnv("MIGRATION_DATABASE_URL"));
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55432")
  throw new Error("The oracle may only read the local reference database");
const db = new pg.Client(connectionOptions(url.toString()));
await db.connect();
try {
  const queries = {
    columns: `select c.relname as "table", c.relkind as kind, a.attname as name,
      format_type(a.atttypid,a.atttypmod) as type, a.attnotnull as required,
      pg_get_expr(d.adbin,d.adrelid) as "default"
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname='public' and c.relkind in ('r','v') and a.attnum>0
      and not a.attisdropped and c.relname<>'app_migrations' order by c.relname,a.attnum`,
    constraints: `select c.relname as "table", k.conname as name, k.contype as type,
      pg_get_constraintdef(k.oid) as definition from pg_constraint k
      join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname<>'app_migrations' order by c.relname,k.conname`,
    indexes: `select tablename as "table",indexname as name,indexdef as definition
      from pg_indexes where schemaname='public' and tablename<>'app_migrations' order by indexname`,
    enums: `select t.typname as name,array_agg(e.enumlabel::text order by e.enumsortorder) as values
      from pg_type t join pg_enum e on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public' group by t.typname order by t.typname`,
    policies: `select tablename as "table",policyname as name,roles,cmd,qual,"with_check" as check
      from pg_policies where schemaname='public' order by tablename,policyname`,
    functions: `select proname as name,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app') and prokind='f' order by proname`,
    views: `select viewname as name,definition from pg_views where schemaname='public' order by viewname`,
    triggers: `select c.relname as "table", t.tgname as name,pg_get_triggerdef(t.oid) as definition
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname`,
    columnPrivileges: `select c.table_name as "table",c.column_name as "column",c.grantee,c.privilege_type as privilege
      from information_schema.role_column_grants c where c.table_schema='public'
      and c.grantee in ('app_guest','app_user','app_service')
      and not exists(select 1 from information_schema.role_table_grants t where t.table_schema=c.table_schema and t.table_name=c.table_name and t.grantee=c.grantee and t.privilege_type=c.privilege_type)
      order by c.table_name,c.column_name,c.grantee,c.privilege_type`,
    privileges: `select table_name as "table",grantee,privilege_type as privilege
      from information_schema.role_table_grants where table_schema='public'
      and grantee in ('app_guest','app_user','app_service') order by table_name,grantee,privilege_type`,
  };
  const catalog = {
    source: "3248d66",
    migrations: (
      await db.query("select name,checksum from app_migrations order by name")
    ).rows,
  };
  for (const [name, query] of Object.entries(queries))
    catalog[name] = (await db.query(query)).rows;
  // Calculation examples are produced by the old implementation, not reimplemented here.
  catalog.calculations = (
    await db.query(`select g as grams,h as hours,p as parts,
    calc_print_fee(g,h,p) as fee,estimate_filament_grams(g,h) as estimated_grams
    from unnest(array[0,0.01,1,50,123.456,1000]::numeric[]) g
    cross join unnest(array[0,0.5,3.141,24]::numeric[]) h
    cross join unnest(array[1,2,20]) p order by g,h,p`)
  ).rows;
  await db.query("begin");
  try {
    const buyer = "10000000-0000-4000-8000-000000000001",
      creator = "10000000-0000-4000-8000-000000000002";
    const work = "10000000-0000-4000-8000-000000000003",
      variant = "10000000-0000-4000-8000-000000000004",
      address = "10000000-0000-4000-8000-000000000005",
      request = "10000000-0000-4000-8000-000000000006";
    catalog.checkout = {
      inputs: { buyer, creator, work, variant, address, request },
    };
    for (const id of [buyer, creator])
      await db.query("insert into app_users(id,email,name) values($1,$2,$3)", [
        id,
        `${id}@oracle.invalid`,
        "oracle",
      ]);
    await db.query("update profiles set role='creator' where id=$1", [creator]);
    await db.query(
      "insert into works(id,creator_id,title,status) values($1,$2,'Oracle','published')",
      [work, creator],
    );
    await db.query(
      "insert into work_variants(id,work_id,size_label,price_jpy,stock,is_listed,is_printable,est_filament_grams,est_print_hours,part_count) values($1,$2,'10cm',1200,1,true,true,50,2,3)",
      [variant, work],
    );
    await db.query(
      "insert into addresses(id,user_id,recipient_name,postal_code,prefecture,city,address_line,phone) values($1,$2,'Oracle','1234567','東京都','千代田区','1','000')",
      [address, buyer],
    );
    await db.query(
      "insert into cart_items(cart_id,variant_id,quantity) select id,$2,1 from carts where user_id=$1",
      [buyer, variant],
    );
    await db.query(
      "select set_config('role','app_user',true),set_config('app.role','app_user',true),set_config('app.user_id',$1,true)",
      [buyer],
    );
    const order = (
      await db.query("select place_demo_order($1,$2) as id", [address, request])
    ).rows[0].id;
    catalog.checkout.order = (
      await db.query(
        "select status,subtotal_amount,platform_fee_amount,print_cost_amount,shipping_fee_amount,total_amount,is_demo from orders where id=$1",
        [order],
      )
    ).rows[0];
    catalog.checkout.item = (
      await db.query(
        "select unit_price,quantity,creator_payout_amount,platform_fee_amount,print_cost_amount,print_fee_snapshot,print_assets_snapshot from order_items where order_id=$1",
        [order],
      )
    ).rows[0];
    catalog.checkout.job = (
      await db.query(
        "select status,quantity,part_count,batch_count,print_fee_snapshot from print_jobs where order_id=$1",
        [order],
      )
    ).rows[0];
    catalog.checkout.stock = (
      await db.query("select stock from work_variants where id=$1", [variant])
    ).rows[0].stock;
  } finally {
    await db.query("rollback");
  }
  await writeFile(
    "db/oracle/postgres.json",
    JSON.stringify(catalog, null, 2) + "\n",
  );
  console.log(
    `Captured ${catalog.columns.filter((c) => c.kind === "r").length} columns, ${catalog.policies.length} policies and ${catalog.calculations.length} calculation fixtures`,
  );
} finally {
  await db.end();
}
