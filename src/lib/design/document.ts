import { programSchema, programFootprint } from "./program.ts";
import { parseModelScript } from "./model-script.ts";
import { z } from "zod";
import { compositeSchema, compositeSize, compositeFootprint } from "./composite.ts";

/** Versioned, millimetre-based source of truth. No DOM, renderer or storage dependencies. */
export const DESIGN_VERSION = 1;
export const DESIGN_FILE_LIMIT = 131_072;
const dimension = (min: number, max: number) => z.number().finite().min(min).max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const furnitureIds = ["furniture-1", "furniture-2", "furniture-3", "furniture-4", "furniture-5", "furniture-6"] as const;
export const furnitureSchema = z.object({
  id: z.enum(furnitureIds), name: z.string().trim().min(1).max(40),
  kind: z.enum(["shelf", "table", "box", "cylinder"]),
  width: dimension(20, 200), depth: dimension(20, 200), height: dimension(10, 200),
  x: dimension(0, 400), y: dimension(0, 400), color,
}).strict();
export type Furniture = z.infer<typeof furnitureSchema>;
export const furnitureLabels: Record<Furniture["kind"], string> = { shelf: "棚", table: "テーブル", box: "四角い台座", cylinder: "丸い台座" };
export const designSchema = z.object({
  version: z.literal(DESIGN_VERSION),
  name: z.string().trim().min(1).max(80),
  house: z.object({
    width: dimension(80, 400), depth: dimension(80, 400), height: dimension(80, 350),
    thickness: dimension(1, 8), roofRise: dimension(0, 100),
    leftWall: z.boolean(), rightWall: z.boolean(), roof: z.boolean(),
    wallColor: color, floorColor: color, roofColor: color,
  }).strict(),
  window: z.object({ shape: z.enum(["rectangle", "ellipse"]).default("rectangle"), enabled: z.boolean(), width: dimension(10, 200), height: dimension(10, 200) }).strict(),
  shelf: z.object({
    enabled: z.boolean(), width: dimension(20, 200), depth: dimension(15, 150), height: dimension(20, 200),
    x: dimension(0, 350), y: dimension(0, 350), color,
  }).strict(),
  scene: z.enum(["house", "object"]).default("house"),
  programs: z.array(programSchema).max(3).default([]),
  custom: z.array(compositeSchema).max(3).default([]),
  furniture: z.array(furnitureSchema).max(6).default([]),
  nui: z.object({ width: dimension(10, 300), depth: dimension(10, 300), height: dimension(10, 300) }).strict(),
  bed: z.object({ width: dimension(80, 500), depth: dimension(80, 500), height: dimension(80, 500) }).strict(),
}).strict();
export type Design = z.infer<typeof designSchema>;

export function defaultDesign(): Design {
  return {
    version: 1, name: "15cmぬいのおうち",
    house: { width: 190, depth: 160, height: 175, thickness: 3, roofRise: 40,
      leftWall: true, rightWall: true, roof: true,
      wallColor: "#F5F1E8", floorColor: "#D7BD99", roofColor: "#2563EB" },
    window: { shape: "rectangle", enabled: true, width: 55, height: 60 },
    shelf: { enabled: false, width: 55, depth: 35, height: 65, x: 125, y: 90, color: "#D7BD99" },
    furniture: [], custom: [], programs: [], scene: "house",
    nui: { width: 90, depth: 80, height: 150 },
    bed: { width: 256, depth: 256, height: 256 },
  };
}

export function parseDesign(value: unknown): Design {
  const result = designSchema.safeParse(value);
  if (!result.success) throw new Error("設計ファイルの形式・版・寸法が対応範囲外です。");
  const d = result.data;
  const t = d.house.thickness;
  if (d.window.enabled && (d.window.width > d.house.width - 4 * t || d.window.height > d.house.height - 4 * t))
    throw new Error("窓の周囲に壁厚の2倍以上の余白を残してください。");
  if (d.shelf.enabled && (d.shelf.width <= 2 * t || d.shelf.height <= 2 * t))
    throw new Error("棚の幅と高さは板厚の2倍より大きくしてください。");
  if (new Set(d.furniture.map((f) => f.id)).size !== d.furniture.length)
    throw new Error("家具のIDを重複させないでください。");
  for (const f of d.furniture) {
    if ((f.kind === "shelf" || f.kind === "table") && (f.width <= 2 * t || f.height <= 2 * t || f.depth <= 2 * t))
      throw new Error(`${f.name}の幅・奥行き・高さは板厚の2倍より大きくしてください。`);
  }
  if (new Set(d.custom.map((p) => p.id)).size !== d.custom.length) throw new Error("複合部品のIDが重複しています。");
  for (const part of d.custom) {
    if (part.steps[0].operation !== "add") throw new Error("複合部品は形を加える操作から始めてください。");
    if (compositeSize(part.steps).some((n) => !Number.isFinite(n) || n < 2 || n > 200.001)) throw new Error("複合部品の外寸は各方向2〜200mmに収めてください。");
  }
  if (new Set(d.programs.map((p) => p.id)).size !== d.programs.length) throw new Error("自由形状のIDが重複しています。");
  for (const p of d.programs) parseModelScript(p.source);
  return d;
}

export function readDesign(text: string): Design {
  if (new TextEncoder().encode(text).byteLength > DESIGN_FILE_LIMIT) throw new Error("設計ファイルは128KiBまでです。");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("設計ファイルを読み取れませんでした。"); }
  return parseDesign(value);
}

export type Issue = { code: string; level: "error" | "warning"; message: string };
export function checkDesign(d: Design): Issue[] {
  const { house: h, shelf: s, nui: n } = d;
  const issues: Issue[] = [];
  if (h.thickness < 2) issues.push({ code: "wall", level: "error", message: "板厚を2mm以上にしてください（試作向けの暫定基準）。" });
  const width = h.width - h.thickness * (Number(h.leftWall) + Number(h.rightWall));
  if (d.scene === "house" && (n.width > width || n.depth > h.depth - h.thickness || n.height > h.height))
    issues.push({ code: "nui", level: "warning", message: "登録したぬいの寸法がおうちの内寸を超えています。" });
  if (d.scene === "house" && s.enabled && (s.x < (h.leftWall ? h.thickness : 0) || s.x + s.width > h.width - (h.rightWall ? h.thickness : 0) || s.y + s.depth > h.depth - h.thickness || s.height > h.height))
    issues.push({ code: "shelf", level: "error", message: "棚がおうちの内側に収まっていません。位置・寸法を調整してください。" });
  if (s.enabled) issues.push({ code: "shelf-fit", level: "warning", message: "棚を置いた状態で、ぬいの置き場所が足りるかプレビューで確認してください。" });
  const placed = [...(s.enabled ? [{ ...s, id: "shelf", name: "棚" }] : []), ...d.furniture, ...d.custom.map(compositeFootprint), ...d.programs.map(programFootprint)];
  for (const f of [...d.furniture, ...d.custom.map(compositeFootprint), ...d.programs.map(programFootprint)]) {
    if (d.scene === "house" && (f.x < (h.leftWall ? h.thickness : 0) || f.x + f.width > h.width - (h.rightWall ? h.thickness : 0) || f.y + f.depth > h.depth - h.thickness || f.height > h.height))
      issues.push({ code: `fit-${f.id}`, level: "error", message: `${f.name}がおうちの内側に収まりません。位置・寸法を調整してください。` });
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    // Conservative footprint test: even open shelves/table legs reserve their
    // bounding rectangle. Nesting and vertical stacking are not supported.
    if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.001 &&
        Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y) > 0.001)
      issues.push({ code: `overlap-${a.id}-${b.id}`, level: "error", message: `${a.name}と${b.name}の置き場所が重なっています。床面の外接矩形が重ならないよう移動してください。` });
  }
  if (d.furniture.length) issues.push({ code: "furniture-nui", level: "warning", message: "家具とぬいの置き場所・安定性はプレビューと試し刷りで確認してください。" });
  if (d.custom.length || d.programs.length) issues.push({ code: "custom-print", level: "warning", message: "自由形状・複合部品の細い箇所・接続強度・サポートの要否は自動判定していません。試し刷りで確認してください。" });
  if (d.scene === "object" && !d.programs.length && !d.custom.length && !d.furniture.length && !d.shelf.enabled) issues.push({ code: "empty", level: "error", message: "部品がありません。AIに作りたい形を伝えてください。" });
  return issues;
}

/** Bounded snapshots also make failed imports and undo independent of geometry execution. */
export function createDesignStore(initial = defaultDesign()) {
  type State = { design: Design; past: Design[]; future: Design[]; revision: number };
  const first: State = { design: parseDesign(initial), past: [], future: [], revision: 0 };
  let state = first;
  const listeners = new Set<() => void>();
  const emit = (next: State) => { state = next; listeners.forEach((fn) => fn()); };
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => first,
    replace(value: unknown) {
      const design = parseDesign(value);
      if (JSON.stringify(design) === JSON.stringify(state.design)) return;
      emit({ design, past: [...state.past, state.design].slice(-50), future: [], revision: state.revision + 1 });
    },
    undo() {
      const design = state.past.at(-1);
      if (design) emit({ design, past: state.past.slice(0, -1), future: [state.design, ...state.future], revision: state.revision + 1 });
    },
    redo() {
      const design = state.future[0];
      if (design) emit({ design, past: [...state.past, state.design].slice(-50), future: state.future.slice(1), revision: state.revision + 1 });
    },
  };
}
