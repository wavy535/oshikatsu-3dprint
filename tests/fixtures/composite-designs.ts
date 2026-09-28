import type { Composite, SolidStep } from "../../src/lib/design/composite.ts";

export const box = (x: number, y: number, z: number, cx = x / 2, cy = y / 2, cz = z / 2): SolidStep => ({ operation: "add", primitive: "box", size: { x, y, z }, center: { x: cx, y: cy, z: cz }, rotation: { x: 0, y: 0, z: 0 } });
export const arch: Composite = { id: "custom-1", name: "アーチの家具", x: 10, y: 10, color: "#AA8844", steps: [
  box(80, 12, 90),
  { ...box(48, 16, 50, 40, 6, 25), operation: "subtract" },
  { operation: "subtract", primitive: "cylinder", size: { x: 48, y: 48, z: 16 }, center: { x: 40, y: 6, z: 50 }, rotation: { x: 90, y: 0, z: 0 } },
] };
export const stepped: Composite = { ...arch, name: "段差台座", steps: [box(70, 50, 10), box(45, 50, 20), box(20, 50, 30)] };
export const separated: Composite = { ...arch, name: "分離した部品", steps: [box(20, 20, 20), box(20, 20, 20, 60, 10, 10)] };
