import type { Design } from "./document.ts";

export type Vector = [number, number, number];
export type Shape =
  | { kind: "box"; size: Vector }
  | { kind: "wall"; size: Vector; opening: [number, number] }
  | { kind: "roof"; width: number; depth: number; rise: number; thickness: number; side: "left" | "right" }
  | { kind: "shelf"; size: Vector; thickness: number };
export type PartSpec = { id: string; label: string; color: string; position: Vector; shape: Shape; printRotation: Vector };

/** Z-up, +Y toward the back. Each part remains a separate glue-assembled solid. */
export function designParts(d: Design): PartSpec[] {
  const h = d.house, t = h.thickness;
  const parts: PartSpec[] = [
    { id: "floor", label: "床", color: h.floorColor, position: [0, 0, 0], shape: { kind: "box", size: [h.width, h.depth, t] }, printRotation: [0, 0, 0] },
    { id: "back", label: "奥の壁", color: h.wallColor, position: [0, h.depth - t, t],
      shape: d.window.enabled ? { kind: "wall", size: [h.width, t, h.height], opening: [d.window.width, d.window.height] } : { kind: "box", size: [h.width, t, h.height] }, printRotation: [90, 0, 0] },
  ];
  for (const side of ["left", "right"] as const) {
    if (side === "left" ? h.leftWall : h.rightWall) parts.push({ id: side, label: side === "left" ? "左の壁" : "右の壁", color: h.wallColor,
      position: [side === "left" ? 0 : h.width - t, 0, t], shape: { kind: "box", size: [t, h.depth - t, h.height] }, printRotation: [0, 90, 0] });
  }
  if (h.roof) {
    if (h.roofRise === 0) parts.push({ id: "roof", label: "平らな屋根", color: h.roofColor, position: [0, 0, t + h.height], shape: { kind: "box", size: [h.width, h.depth, t] }, printRotation: [0, 0, 0] });
    else for (const side of ["left", "right"] as const) {
      const angle = Math.atan2(h.roofRise, h.width / 2) * 180 / Math.PI;
      parts.push({ id: `roof-${side}`, label: side === "left" ? "屋根・左" : "屋根・右", color: h.roofColor,
        position: [side === "left" ? 0 : h.width / 2, 0, t + h.height],
        shape: { kind: "roof", width: h.width / 2, depth: h.depth, rise: h.roofRise, thickness: t, side },
        printRotation: [0, side === "left" ? angle : -angle, 0] });
    }
  }
  if (d.shelf.enabled) parts.push({ id: "shelf", label: "棚", color: d.shelf.color,
    position: [d.shelf.x, d.shelf.y, t], shape: { kind: "shelf", size: [d.shelf.width, d.shelf.depth, d.shelf.height], thickness: t }, printRotation: [90, 0, 0] });
  return parts;
}
