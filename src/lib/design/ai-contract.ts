import { z } from "zod";
import { checkDesign, designSchema, parseDesign, type Design } from "./document.ts";
import { designParts, type Vector } from "./parts.ts";
import { rotatePoint } from "./geometry.ts";

export const numericPaths = ["house.width", "house.depth", "house.height", "house.thickness", "house.roofRise", "window.width", "window.height", "shelf.width", "shelf.depth", "shelf.height", "shelf.x", "shelf.y", "nui.width", "nui.depth", "nui.height"] as const;
export const booleanPaths = ["house.leftWall", "house.rightWall", "house.roof", "window.enabled", "shelf.enabled"] as const;
export const stringPaths = ["name", "house.wallColor", "house.floorColor", "house.roofColor", "shelf.color"] as const;
export const changeSchema = z.union([
  z.object({ path: z.enum(numericPaths), value: z.number().finite() }).strict(),
  z.object({ path: z.enum(booleanPaths), value: z.boolean() }).strict(),
  z.object({ path: z.enum(stringPaths), value: z.string().max(80) }).strict(),
]);
export const proposalSchema = z.object({ message: z.string().min(1).max(1200), changes: z.array(changeSchema).max(30) }).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const chatRequestSchema = z.object({
  design: designSchema,
  message: z.string().trim().min(1).max(1000),
  selected: z.enum(["floor", "back", "left", "right", "roof", "roof-left", "roof-right", "shelf"]),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }).strict()).max(8),
}).strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export const chatReplySchema = proposalSchema.extend({ design: designSchema, attempts: z.number().int().min(1).max(2) }).strict();
export type ChatReply = z.infer<typeof chatReplySchema>;

/** Exact convex outer bounds of the current parametric parts, without loading WASM. */
export function printBoundsErrors(d: Design): string[] {
  return designParts(d).flatMap((part) => {
    const s = part.shape;
    let points: Vector[];
    if (s.kind === "roof") {
      const dz = s.thickness * Math.hypot(s.width, s.rise) / s.width;
      points = [0, s.width].flatMap((x) => [0, s.depth].flatMap((y) => [0, dz].map((offset): Vector => [x, y, (s.side === "left" ? x / s.width : 1 - x / s.width) * s.rise + offset])));
    } else points = [0, s.size[0]].flatMap((x) => [0, s.size[1]].flatMap((y) => [0, s.size[2]].map((z): Vector => [x, y, z])));
    const rotated = points.map((p) => rotatePoint(p, part.printRotation));
    const [x, y, z] = [0, 1, 2].map((i) => Math.max(...rotated.map((p) => p[i])) - Math.min(...rotated.map((p) => p[i])));
    const b = d.bed, epsilon = 0.001;
    return ((x <= b.width + epsilon && y <= b.depth + epsilon) || (y <= b.width + epsilon && x <= b.depth + epsilon)) && z <= b.height + epsilon ? [] : [`${part.label}がプリンタの造形範囲を超えます。プリンタ寸法を変更せず、部品を小さくしてください。`];
  });
}

export function applyProposal(base: Design, value: unknown): { proposal: Proposal; design: Design } {
  const proposal = proposalSchema.parse(value);
  const candidate = structuredClone(parseDesign(base));
  const seen = new Set<string>();
  for (const change of proposal.changes) {
    if (seen.has(change.path)) throw new Error("同じ項目への変更を重複させないでください。");
    seen.add(change.path);
    const [section, key] = change.path.split(".");
    if (section === "name") candidate.name = String(change.value);
    else {
      // Paths are allowlisted above. No prototype access or arbitrary property writes.
      const target = candidate[section as "house" | "window" | "shelf" | "nui"];
      Object.assign(target, { [key]: change.value });
    }
  }
  const design = parseDesign(candidate);
  if (proposal.changes.length) {
    const errors = [...checkDesign(design).filter((i) => i.level === "error").map((i) => i.message), ...printBoundsErrors(design)];
    if (errors.length) throw new Error(errors.join(" "));
  }
  return { proposal, design };
}

export const pathLabels: Record<string, string> = {
  name: "設計名", "house.width": "幅", "house.depth": "奥行き", "house.height": "壁の高さ", "house.thickness": "板厚", "house.roofRise": "屋根の立ち上がり",
  "house.leftWall": "左の壁", "house.rightWall": "右の壁", "house.roof": "屋根", "house.wallColor": "壁の色", "house.floorColor": "床の色", "house.roofColor": "屋根の色",
  "window.enabled": "窓", "window.width": "窓の幅", "window.height": "窓の高さ", "shelf.enabled": "棚", "shelf.width": "棚の幅", "shelf.depth": "棚の奥行き", "shelf.height": "棚の高さ", "shelf.x": "棚の左右位置", "shelf.y": "棚の前後位置", "shelf.color": "棚の色", "nui.width": "ぬいの幅", "nui.depth": "ぬいの奥行き", "nui.height": "ぬいの高さ",
};
export function changeSummary(base: Design, changes: Proposal["changes"]): string[] {
  return changes.flatMap(({ path, value }) => {
    const [group, field] = path.split(".");
    const before = field ? (base[group as keyof Design] as Record<string, unknown>)[field] : base.name;
    const format = (v: unknown) => typeof v === "boolean" ? v ? "あり" : "なし" : `${v}${typeof v === "number" ? "mm" : ""}`;
    return before === value ? [] : [`${pathLabels[path]}：${format(before)} → ${format(value)}`];
  });
}
