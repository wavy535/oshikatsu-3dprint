import { programIds, programSchema } from "./program.ts";
import { z } from "zod";
import { compositeSchema, compositeIds } from "./composite.ts";
import { referenceImageSchema, MAX_REFERENCE_IMAGES } from "./reference-images.ts";
import { checkDesign, designSchema, parseDesign, type Design, furnitureSchema, furnitureIds, furnitureLabels } from "./document.ts";
import { designParts, type Vector } from "./parts.ts";
import { rotatePoint } from "./geometry.ts";

export const numericPaths = ["house.width", "house.depth", "house.height", "house.thickness", "house.roofRise", "window.width", "window.height", "shelf.width", "shelf.depth", "shelf.height", "shelf.x", "shelf.y", "nui.width", "nui.depth", "nui.height"] as const;
export const booleanPaths = ["house.leftWall", "house.rightWall", "house.roof", "window.enabled", "shelf.enabled"] as const;
export const stringPaths = ["name", "house.wallColor", "house.floorColor", "house.roofColor", "shelf.color"] as const;
export const windowShapeLabels = { rectangle: "四角", ellipse: "丸・楕円" } as const;
export const changeSchema = z.union([
  z.object({ path: z.literal("scene"), value: z.enum(["house", "object"]) }).strict(),
  z.object({ path: z.literal("program.upsert"), value: programSchema }).strict(),
  z.object({ path: z.literal("program.remove"), value: z.enum(programIds) }).strict(),
  z.object({ path: z.literal("custom.upsert"), value: compositeSchema }).strict(),
  z.object({ path: z.literal("custom.remove"), value: z.enum(compositeIds) }).strict(),
  z.object({ path: z.literal("window.shape"), value: z.enum(["rectangle", "ellipse"]) }).strict(),
  z.object({ path: z.literal("furniture.upsert"), value: furnitureSchema }).strict(),
  z.object({ path: z.literal("furniture.remove"), value: z.enum(furnitureIds) }).strict(),
  z.object({ path: z.enum(numericPaths), value: z.number().finite() }).strict(),
  z.object({ path: z.enum(booleanPaths), value: z.boolean() }).strict(),
  z.object({ path: z.enum(stringPaths), value: z.string().max(80) }).strict(),
]);
export const proposalSchema = z.object({ message: z.string().min(1).max(1200), changes: z.array(changeSchema).max(30) }).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const chatRequestSchema = z.object({
  design: designSchema,
  images: z.array(referenceImageSchema).max(MAX_REFERENCE_IMAGES).optional(),
  geometryFeedback: z.object({ proposal: proposalSchema, error: z.string().min(1).max(1000) }).strict().optional(),
  message: z.string().trim().min(1).max(1000),
  selected: z.enum(["floor", "back", "left", "right", "roof", "roof-left", "roof-right", "shelf", ...furnitureIds, ...compositeIds, ...programIds]),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }).strict()).max(8),
}).strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export const chatReplySchema = proposalSchema.extend({ design: designSchema, attempts: z.number().int().min(1).max(2) }).strict();
export type ChatReply = z.infer<typeof chatReplySchema>;

/** Exact bounds for templates; conservative additive bounds for custom CSG parts. */
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
    const identity = (change.path === "furniture.upsert" || change.path === "custom.upsert" || change.path === "program.upsert") ? change.value.id : (change.path === "furniture.remove" || change.path === "custom.remove" || change.path === "program.remove") ? change.value : change.path;
    if (seen.has(identity)) throw new Error("同じ項目への変更を重複させないでください。");
    seen.add(identity);
    if (change.path === "program.upsert") {
      const i = candidate.programs.findIndex((p) => p.id === change.value.id);
      if (i < 0) candidate.programs.push(change.value); else candidate.programs[i] = change.value;
      continue;
    }
    if (change.path === "program.remove") {
      if (!candidate.programs.some((p) => p.id === change.value)) throw new Error("削除対象の自由形状がありません。");
      candidate.programs = candidate.programs.filter((p) => p.id !== change.value);
      continue;
    }
    if (change.path === "custom.upsert") {
      const i = candidate.custom.findIndex((p) => p.id === change.value.id);
      if (i < 0) candidate.custom.push(change.value); else candidate.custom[i] = change.value;
      continue;
    }
    if (change.path === "custom.remove") {
      if (!candidate.custom.some((p) => p.id === change.value)) throw new Error("削除対象の複合部品がありません。");
      candidate.custom = candidate.custom.filter((p) => p.id !== change.value);
      continue;
    }
    if (change.path === "furniture.upsert") {
      const index = candidate.furniture.findIndex((f) => f.id === change.value.id);
      if (index < 0) candidate.furniture.push(change.value);
      else candidate.furniture[index] = change.value;
      continue;
    }
    if (change.path === "furniture.remove") {
      if (!candidate.furniture.some((f) => f.id === change.value)) throw new Error("削除対象の家具がありません。現在のIDを確認してください。");
      candidate.furniture = candidate.furniture.filter((f) => f.id !== change.value);
      continue;
    }
    if (change.path === "scene") { candidate.scene = change.value; continue; }
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
    const errors = [...checkDesign(design).filter((i) => i.level === "error").map((i) => `[${i.code}] ${i.message}`), ...printBoundsErrors(design)];
    if (errors.length) throw new Error(errors.join(" "));
  }
  return { proposal, design };
}

export const pathLabels: Record<string, string> = {
  name: "設計名", "house.width": "幅", "house.depth": "奥行き", "house.height": "壁の高さ", "house.thickness": "板厚", "house.roofRise": "屋根の立ち上がり",
  "house.leftWall": "左の壁", "house.rightWall": "右の壁", "house.roof": "屋根", "house.wallColor": "壁の色", "house.floorColor": "床の色", "house.roofColor": "屋根の色",
  "window.shape": "窓の形", "window.enabled": "窓", "window.width": "窓の幅", "window.height": "窓の高さ", "shelf.enabled": "棚", "shelf.width": "棚の幅", "shelf.depth": "棚の奥行き", "shelf.height": "棚の高さ", "shelf.x": "棚の左右位置", "shelf.y": "棚の前後位置", "shelf.color": "棚の色", "nui.width": "ぬいの幅", "nui.depth": "ぬいの奥行き", "nui.height": "ぬいの高さ",
};
export function changeSummary(base: Design, changes: Proposal["changes"]): string[] {
  return changes.flatMap(({ path, value }) => {
    if (path === "program.remove") return [`${base.programs.find((p) => p.id === value)?.name ?? "自由形状"}：削除`];
    if (path === "program.upsert") return [`${value.name}：${base.programs.some((p) => p.id === value.id) ? "更新" : "追加"}（自由形状、外寸上限${value.size.join("×")}mm）`];
    if (path === "custom.remove") return [`${base.custom.find((p) => p.id === value)?.name ?? "複合部品"}：削除`];
    if (path === "custom.upsert") {
      const old = base.custom.find((p) => p.id === value.id);
      return JSON.stringify(old) === JSON.stringify(value) ? [] : [`${value.name}：${old ? "更新" : "追加"}（形の操作${value.steps.length}個、左${value.x}/手前${value.y}mm、${value.color}）`];
    }
    if (path === "furniture.remove") {
      const old = base.furniture.find((f) => f.id === value);
      return old ? [`${old.name}：削除`] : [];
    }
    if (path === "furniture.upsert") {
      const old = base.furniture.find((f) => f.id === value.id);
      if (JSON.stringify(old) === JSON.stringify(value)) return [];
      const describe = (f: typeof value) => `${f.name}・${furnitureLabels[f.kind]}、幅${f.width}/奥行${f.depth}/高さ${f.height}mm、左${f.x}/手前${f.y}mm、${f.color}`;
      return [`${value.name}：${old ? describe(old) : "なし"} → ${describe(value)}`];
    }
    if (path === "scene") return base.scene === value ? [] : [`制作対象：${value === "object" ? "単体の家具・装備" : "おうち"}`];
    const [group, field] = path.split(".");
    const before = field ? (base[group as keyof Design] as Record<string, unknown>)[field] : base.name;
    const format = (v: unknown) => path === "window.shape" ? windowShapeLabels[v as keyof typeof windowShapeLabels] : typeof v === "boolean" ? v ? "あり" : "なし" : `${v}${typeof v === "number" ? "mm" : ""}`;
    return before === value ? [] : [`${pathLabels[path]}：${format(before)} → ${format(value)}`];
  });
}
