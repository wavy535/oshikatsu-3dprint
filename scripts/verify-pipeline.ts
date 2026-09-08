// 解析結果が実スキーマにそのまま入るかを、ローカルPostgresに対して確かめる。
// validateAndPersistAsset と同じ順序・同じ値で INSERT/UPDATE を組み立て、
// トリガー（代行費・バッチ数・印刷可否）まで通す。
//   node scripts/verify-pipeline.js <model> > /tmp/pipeline.sql && psql -f /tmp/pipeline.sql
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { analyzeModelFile } from "../src/lib/print/index.ts";

const path = process.argv[2];
const buf = readFileSync(path);
const r = analyzeModelFile(buf, { fileName: basename(path) });

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const j = (o: unknown) => q(JSON.stringify(o));
const n = (v: number | null, d: number) =>
  v === null ? "null" : String(Math.round(v * 10 ** d) / 10 ** d);

const WORK = "'aaaaaaaa-0000-0000-0000-0000000000aa'";
const ASSET = "'bbbbbbbb-0000-0000-0000-0000000000bb'";
const CREATOR = "'11111111-1111-1111-1111-111111111111'";

const out: string[] = [];
out.push("\\set ON_ERROR_STOP on");
out.push("begin;");
out.push(`insert into auth.users (id,email) values (${CREATOR},'c@example.com') on conflict do nothing;`);
out.push(`insert into public.profiles (id,role,display_name) values (${CREATOR},'creator','pipeline_test') on conflict (id) do update set role='creator';`);
out.push(`insert into public.works (id,creator_id,title,status) values (${WORK},${CREATOR},'パイプライン検証','draft');`);
out.push(`insert into public.work_assets (id,work_id,storage_path,file_name,file_format,file_size_bytes)
  values (${ASSET},${WORK},'works/x/${basename(path)}',${q(basename(path))},${q(r.format)},${buf.byteLength});`);

// 4. アセット更新
out.push(`update public.work_assets set
  unit='mm', object_count=${r.objectCount}, triangle_count=${r.triangleCount}, vertex_count=${r.vertexCount},
  total_volume_cm3=${n(r.totalVolumeCm3, 2)}, total_surface_area_cm2=${n(r.totalSurfaceAreaCm2, 2)},
  bbox_x_mm=${n(r.assembledBboxMm[0], 2)}, bbox_y_mm=${n(r.assembledBboxMm[1], 2)}, bbox_z_mm=${n(r.assembledBboxMm[2], 2)},
  validation_status=${q(r.status)}, validated_at=now()
  where id=${ASSET};`);

// 5. オブジェクト
for (const o of r.objects) {
  out.push(`insert into public.work_asset_objects
   (asset_id,object_index,name,triangle_count,bbox_x_mm,bbox_y_mm,bbox_z_mm,volume_cm3,surface_area_cm2,
    is_manifold,open_edge_count,flipped_normal_count,self_intersection_count,min_wall_thickness_mm)
   values (${ASSET},${o.objectIndex},${q(o.name)},${o.triangleCount},
    ${n(o.bboxMm[0], 2)},${n(o.bboxMm[1], 2)},${n(o.bboxMm[2], 2)},${n(o.volumeCm3, 2)},${n(o.surfaceAreaCm2, 2)},
    ${o.isManifold},${o.openEdgeCount},${o.flippedNormalCount},${o.selfIntersectionCount},${n(o.minWallThicknessMm, 2)});`);
}

// 6. 検証結果
for (const i of r.issues) {
  out.push(`insert into public.work_validation_issues (asset_id,code,severity,message,detail)
   values (${ASSET},${q(i.code)},${q(i.severity)},${q(i.message)},${j(i.detail)}::jsonb);`);
}

// 7. 色スロット
for (const c of r.colorSlots) {
  out.push(`insert into public.work_color_slots (work_id,asset_id,slot_index,source_name,source_hex,face_count)
   values (${WORK},${ASSET},${c.slotIndex},${q(c.sourceName)},${q(c.sourceHex)},${c.faceCount});`);
}

// 8. パーツごとの印刷指示（既定値ロジックはライブラリ側と同じ）
for (const o of r.objects) {
  const s = [...o.bboxMm].sort((a, b) => a - b);
  const flat = s[0] / Math.max(s[2], 1e-6) < 0.2;
  const tall = s[2] / Math.max(s[1], 1e-6) > 1.8;
  const orientation = flat ? "flat" : tall ? "upright" : "as_is";
  const support = flat ? "none" : "auto";
  out.push(`insert into public.work_part_instructions (work_id,object_id,orientation,no_rotate,support)
   select ${WORK}, id, ${q(orientation)}, ${flat}, ${q(support)} from public.work_asset_objects
    where asset_id=${ASSET} and object_index=${o.objectIndex};`);
}

// 9. サイズ展開
for (const v of r.variants) {
  out.push(`insert into public.work_variants
   (work_id,size_label,nui_size_cm,scale_ratio,is_base,asset_id,bbox_x_mm,bbox_y_mm,bbox_z_mm,
    max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,oversized_parts,
    est_filament_grams,est_print_hours,part_count,is_listed)
   values (${WORK},${q(v.sizeLabel)},${v.nuiSizeCm},${n(v.scaleRatio, 4)},${v.scaleRatio === 1},${ASSET},
    ${n(v.bboxMm[0], 2)},${n(v.bboxMm[1], 2)},${n(v.bboxMm[2], 2)},
    ${n(v.maxPartBboxMm[0], 2)},${n(v.maxPartBboxMm[1], 2)},${n(v.maxPartBboxMm[2], 2)},
    ${v.oversizedParts.length === 0 ? "'{}'" : "array[" + v.oversizedParts.map(q).join(",") + "]"},
    ${n(v.grams, 1)},${n(v.hours, 2)},${v.partCount},false);`);
}

out.push("\\echo '--- work_assets ---'");
out.push(`select object_count,triangle_count,total_volume_cm3,bbox_x_mm,bbox_y_mm,bbox_z_mm,validation_status from public.work_assets where id=${ASSET};`);
out.push("\\echo '--- objects ---'");
out.push(`select object_index,name,triangle_count,bbox_x_mm||'x'||bbox_y_mm||'x'||bbox_z_mm as bbox,volume_cm3,is_manifold,min_wall_thickness_mm from public.work_asset_objects where asset_id=${ASSET} order by object_index;`);
out.push("\\echo '--- issues ---'");
out.push(`select severity,code,message from public.work_validation_issues where asset_id=${ASSET} order by created_at;`);
out.push("\\echo '--- color slots ---'");
out.push(`select slot_index,source_name,source_hex,face_count,filament_id is null as unassigned from public.work_color_slots where asset_id=${ASSET} order by slot_index;`);
out.push("\\echo '--- part instructions ---'");
out.push(`select o.name,i.orientation,i.no_rotate,i.support from public.work_part_instructions i join public.work_asset_objects o on o.id=i.object_id where o.asset_id=${ASSET} order by o.object_index;`);
out.push("\\echo '--- variants (trigger computed) ---'");
out.push(`select size_label,bbox_x_mm||'x'||bbox_y_mm as assembled, max_part_bbox_x_mm||'x'||max_part_bbox_y_mm as max_part, est_filament_grams,est_print_hours,batch_count,print_fee_jpy,is_printable,coalesce(unprintable_reason,'-') as reason from public.work_variants where work_id=${WORK} order by nui_size_cm;`);
out.push("\\echo '--- pricing view ---'");
out.push(`select size_label,print_fee_jpy,min_price_jpy,fee_billing from public.work_variant_pricing where work_id=${WORK} order by nui_size_cm;`);
out.push("rollback;");

// JS側が出した代行費（DBのトリガー計算と一致するはず）
out.push("\\echo '--- JS estimate (should match DB) ---'");
for (const v of r.variants) {
  out.push(`\\echo '  ${v.sizeLabel}: fee=${v.printFeeJpy} batch=${v.batchCount} printable=${v.isPrintable}'`);
}
console.log(out.join("\n"));
