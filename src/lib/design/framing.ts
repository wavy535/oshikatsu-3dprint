import type { Design } from "./document.ts";
import type { DesignBuild } from "./geometry.ts";
/** Shared centering for the viewport and metre-based AR exports. */
export function designFrame(design: Design, build: DesignBuild) {
  if (design.scene !== "object" || !build.parts.length) return { x: design.house.width / 2, y: design.house.depth / 2, height: design.house.height + design.house.roofRise, size: Math.max(design.house.width, design.house.depth, design.house.height + design.house.roofRise) };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of build.parts) for (let i = 0; i < p.positions.length; i++) {
    const axis = i % 3, v = p.positions[i] + p.position[axis];
    min[axis] = Math.min(min[axis], v); max[axis] = Math.max(max[axis], v);
  }
  return { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, height: max[2], size: Math.max(30, ...max.map((v, i) => v - min[i])) };
}
