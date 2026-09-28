import { compositeFootprint } from "./composite.ts";
import { checkDesign, furnitureIds, furnitureLabels, type Design, type Furniture } from "./document.ts";

/** Find a free floor position without moving existing parts or changing the house. */
export function newFurniture(d: Design, kind: Furniture["kind"]): Furniture {
  const id = furnitureIds.find((id) => !d.furniture.some((f) => f.id === id));
  if (!id) throw new Error("追加家具は6個までです。不要な家具を削除してください。");
  const occupied = [...d.furniture, ...d.custom.map(compositeFootprint), ...(d.shelf.enabled ? [d.shelf] : [])];
  const left = d.house.leftWall ? d.house.thickness : 0;
  const size = Math.max(40, d.house.thickness * 2 + 5);
  for (const y of [5, ...occupied.map((f) => f.y + f.depth + 5)]) {
    for (const x of [left + 5, ...occupied.map((f) => f.x + f.width + 5)]) {
      const f: Furniture = { id, kind, name: `${furnitureLabels[kind]} ${id.split("-")[1]}`, width: size, depth: size, height: kind === "box" || kind === "cylinder" ? 15 : size, x, y, color: "#D7BD99" };
      const errors = checkDesign({ ...d, furniture: [...d.furniture, f] });
      if (!errors.some((issue) => issue.level === "error" && issue.code.includes(id))) return f;
    }
  }
  throw new Error("家具を置く空き場所がありません。既存の家具を移動・縮小してから追加してください。");
}
