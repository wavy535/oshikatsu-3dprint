import { z } from "zod";

export const compositeIds = ["custom-1", "custom-2", "custom-3"] as const;
const vector = (min: number, max: number) => z.object({
  x: z.number().finite().min(min).max(max), y: z.number().finite().min(min).max(max), z: z.number().finite().min(min).max(max),
}).strict();
export const solidStepSchema = z.object({
  operation: z.enum(["add", "subtract"]), primitive: z.enum(["box", "cylinder", "sphere"]),
  size: vector(2, 200), center: vector(-200, 200), rotation: vector(-180, 180),
}).strict();
export const compositeSchema = z.object({
  id: z.enum(compositeIds), name: z.string().trim().min(1).max(40),
  x: z.number().finite().min(0).max(400), y: z.number().finite().min(0).max(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), steps: z.array(solidStepSchema).min(1).max(12),
}).strict();
export type Composite = z.infer<typeof compositeSchema>;
export type SolidStep = z.infer<typeof solidStepSchema>;
export class CompositeGeometryError extends Error {}

/** Conservative bounds of additive solids. Cuts cannot expand this envelope. */
export function compositeSize(steps: SolidStep[]): [number, number, number] {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const step of steps.filter((s) => s.operation === "add")) {
    for (const x0 of [-step.size.x / 2, step.size.x / 2]) for (const y0 of [-step.size.y / 2, step.size.y / 2]) for (const z0 of [-step.size.z / 2, step.size.z / 2]) {
      let x = x0, y = y0, z = z0;
      for (const [axis, degrees] of [step.rotation.x, step.rotation.y, step.rotation.z].entries()) {
        const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        if (axis === 0) [y, z] = [c * y - s * z, s * y + c * z];
        if (axis === 1) [x, z] = [c * x + s * z, -s * x + c * z];
        if (axis === 2) [x, y] = [c * x - s * y, s * x + c * y];
      }
      [x + step.center.x, y + step.center.y, z + step.center.z].forEach((n, axis) => { min[axis] = Math.min(min[axis], n); max[axis] = Math.max(max[axis], n); });
    }
  }
  return max.map((n, i) => n - min[i]) as [number, number, number];
}

export function compositeFootprint(part: Composite) {
  const [width, depth, height] = compositeSize(part.steps);
  return { ...part, width, depth, height };
}
