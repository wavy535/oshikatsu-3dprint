import type { Design, Furniture } from "../src/lib/design/document.ts";
import type { ChatRequest } from "../src/lib/design/ai-contract.ts";

type Case = { name: string; text: string; check: (d: Design, changes: number) => boolean; reset?: boolean; selected?: ChatRequest["selected"]; setup?: (d: Design) => void };
const item = (id: Furniture["id"], x: number): Furniture => ({ id, name: id === "furniture-1" ? "左の棚" : "右の棚", kind: "shelf", width: 40, depth: 30, height: 50, x, y: 110, color: "#D7BD99" });
export const partsCases: Case[] = [
  { name: "round-window", reset: true, text: "窓を直径60mmの丸窓にして。他は維持して", check: (d) => d.window.enabled && d.window.shape === "ellipse" && d.window.width === 60 && d.window.height === 60 && d.house.width === 190 },
  { name: "two-shelves", reset: true, text: "奥に幅40mm・奥行30mm・高さ50mmの棚を2つ並べて。家の寸法はそのままで", check: (d) => d.furniture.filter((f) => f.kind === "shelf" && f.width === 40 && f.depth === 30 && f.height === 50).length === 2 && d.house.width === 190 && d.house.depth === 160 && !d.shelf.enabled },
  { name: "table", reset: true, text: "幅60mm、奥行40mm、高さ50mmの四脚テーブルを中央に置いて", check: (d) => d.furniture.some((f) => f.kind === "table" && f.width === 60 && f.depth === 40 && f.height === 50) },
  { name: "round-plinth", reset: true, text: "直径50mm・高さ15mmの丸い台座を左手前に置いて", check: (d) => d.furniture.some((f) => f.kind === "cylinder" && f.width === 50 && f.depth === 50 && f.height === 15) },
  { name: "selected-furniture", reset: true, selected: "furniture-2", setup: (d) => { d.furniture = [item("furniture-1", 10), item("furniture-2", 70)]; }, text: "選んでいるこれだけを赤色 #ff0000 にして", check: (d) => d.furniture.length === 2 && d.furniture.find((f) => f.id === "furniture-2")?.color.toLowerCase() === "#ff0000" && JSON.stringify(d.furniture.find((f) => f.id === "furniture-1")) === JSON.stringify(item("furniture-1", 10)) },
  { name: "delete-one", reset: true, setup: (d) => { d.furniture = [item("furniture-1", 10), item("furniture-2", 70)]; }, text: "左の棚だけ削除して。右の棚は変えないで", check: (d) => d.furniture.length === 1 && JSON.stringify(d.furniture[0]) === JSON.stringify(item("furniture-2", 70)) },
  { name: "repair-overlap", reset: true, setup: (d) => { d.furniture = [item("furniture-1", 10), item("furniture-2", 20)]; }, text: "重なっている棚を直して。左の棚と家具のサイズは維持し、右の棚だけ動かして", check: (d) => d.furniture.length === 2 && JSON.stringify(d.furniture.find((f) => f.id === "furniture-1")) === JSON.stringify(item("furniture-1", 10)) && d.furniture.every((f) => f.width === 40 && f.depth === 30 && f.height === 50) },
  { name: "unsupported-mechanism", reset: true, text: "印刷後に必ず動く時計の脱進機を精密な歯車で作って。動作保証もして", check: (_d, changes) => changes === 0 },
];
