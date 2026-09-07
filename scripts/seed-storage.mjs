/**
 * 開発用のダミー画像を storage の work-images バケットへ置く。
 *
 *   node scripts/seed-storage.mjs
 *
 * `supabase db reset` はDBだけを作り直し、storage の中身は消えない。
 * 逆に work_images の行だけがあって実体が無いと、一覧も詳細も画像が404になって
 * レイアウトの確認ができないので、行に対応するPNGをここで作って上げる。
 *
 * 画像は work_id から決まる色の単色＋斜めの帯だけ。外部依存を足したくないので
 * PNGは自前で組み立てている（zlib は node 標準）。
 */
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "work-images";

// ───────── PNG を組み立てる ─────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, paint) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 文字列から 0-359 の色相を作る（同じ作品なら毎回同じ色になる） */
function hueOf(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

function placeholder(seed, variant) {
  const hue = (hueOf(seed) + variant * 25) % 360;
  const base = hslToRgb(hue, 0.32, 0.86);
  const band = hslToRgb(hue, 0.42, 0.72);
  return png(640, 640, (x, y) => (((x + y) / 64) | 0) % 2 === 0 ? base : band);
}

// ───────── 対象の行を引いて上げる ─────────
async function main() {
  if (!URL_BASE || !KEY) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY がありません");
    process.exit(1);
  }

  const res = await fetch(`${URL_BASE}/rest/v1/work_images?select=work_id,storage_path,sort_order`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    console.error("work_images の取得に失敗:", res.status, await res.text());
    process.exit(1);
  }
  const rows = await res.json();
  if (rows.length === 0) {
    console.log("work_images に行がありません。先に supabase db reset を実行してください。");
    return;
  }

  let ok = 0;
  for (const row of rows) {
    const body = placeholder(row.work_id, row.sort_order ?? 0);
    const up = await fetch(
      `${URL_BASE}/storage/v1/object/${BUCKET}/${row.storage_path}`,
      {
        method: "POST",
        headers: {
          apikey: KEY,
          authorization: `Bearer ${KEY}`,
          "content-type": "image/png",
          "x-upsert": "true",
        },
        body,
      }
    );
    if (up.ok) ok++;
    else console.error(`× ${row.storage_path}: ${up.status} ${await up.text()}`);
  }
  console.log(`${ok}/${rows.length} 件を ${BUCKET} へ置きました`);
}

await main();
