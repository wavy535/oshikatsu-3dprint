// Synthetic closed torus; each invocation is a fresh process for peak RSS.
// npm run benchmark:print -- 160 (51,200 faces), 316 (199,712), 500 (500,000)
import { analyzeModelFile } from "../src/lib/print/index.ts";
const segments = Number(process.argv[2] ?? 160);
if (!Number.isInteger(segments) || segments < 4 || segments > 500)
  throw new Error("segments must be an integer from 4 to 500");
const point = (u: number, v: number) => {
  const a = (u / segments) * 2 * Math.PI,
    b = (v / segments) * 2 * Math.PI;
  return [
    (30 + 10 * Math.cos(b)) * Math.cos(a),
    (30 + 10 * Math.cos(b)) * Math.sin(a),
    10 * Math.sin(b),
  ];
};
const count = segments * segments * 2;
const buffer = Buffer.alloc(84 + count * 50);
buffer.writeUInt32LE(count, 80);
let offset = 84;
for (let u = 0; u < segments; u++)
  for (let v = 0; v < segments; v++) {
    const a = point(u, v),
      b = point(u + 1, v),
      c = point(u + 1, v + 1),
      d = point(u, v + 1);
    for (const triangle of [
      [a, b, c],
      [a, c, d],
    ]) {
      offset += 12;
      for (const vertex of triangle)
        for (const value of vertex) {
          buffer.writeFloatLE(value, offset);
          offset += 4;
        }
      offset += 2;
    }
  }
const start = performance.now();
const result = analyzeModelFile(buffer, { fileName: "torus.stl" });
console.log(
  JSON.stringify({
    triangles: result.triangleCount,
    ms: Math.round(performance.now() - start),
    maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
    volume: result.totalVolumeCm3,
    manifold: result.objects[0].isManifold,
    thicknessSamples: result.objects[0].analysis.thickness.sampleCount,
    selfIntersectionSamples:
      result.objects[0].analysis.selfIntersection.sampleCount,
  }),
);
