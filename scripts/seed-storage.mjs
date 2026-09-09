import { connectionOptions } from "../src/lib/db/connection.mjs";
/** Create sample images in the local S3 emulator. No AWS resources are modified. */
import { deflateSync } from "node:zlib";
import pg from "pg";
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { requiredEnv } from "./env.mjs";
const endpoint = requiredEnv("S3_ENDPOINT");
if (endpoint !== "http://127.0.0.1:59000")
  throw new Error("Storage fixtures require the local compose S3 endpoint");
const s3 = new S3Client({
  endpoint,
  forcePathStyle: true,
  region: requiredEnv("AWS_REGION"),
  credentials: {
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
  },
});
const Bucket = requiredEnv("S3_BUCKET");
const db = new pg.Client(connectionOptions(requiredEnv("MIGRATION_DATABASE_URL")));
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
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

function placeholder(seed, variant) {
  const hue = (hueOf(seed) + variant * 25) % 360;
  const base = hslToRgb(hue, 0.32, 0.86);
  const band = hslToRgb(hue, 0.42, 0.72);
  return png(640, 640, (x, y) =>
    (((x + y) / 64) | 0) % 2 === 0 ? base : band,
  );
}

await db.connect();
try {
  try {
    await s3.send(new CreateBucketCommand({ Bucket }));
  } catch (error) {
    if (
      !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)
    )
      throw error;
  }
  // MinIO supplies CORS itself; AWS CORS is configured by the bucket owner.
  const { rows } = await db.query(
    "select work_id, storage_path, sort_order from work_images",
  );
  for (const row of rows)
    await s3.send(
      new PutObjectCommand({
        Bucket,
        Key: `work-images/${row.storage_path}`,
        Body: placeholder(row.work_id, row.sort_order ?? 0),
        ContentType: "image/png",
      }),
    );
  console.log(`Created ${rows.length} local sample images`);
} finally {
  await db.end();
  s3.destroy();
}
