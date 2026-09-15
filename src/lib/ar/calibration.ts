import { AR_CALIBRATION, AR_MATERIALS } from "./config.ts";
import { boxMesh, type ArMesh } from "./mesh.ts";

export const CALIBRATION_MODELS = ["a4-plate"] as const;
export type CalibrationModel = (typeof CALIBRATION_MODELS)[number];

const MM_PER_M = 1000;

/**
 * 校正用のモデル。A4 用紙と同じ大きさの半透明の薄い板で、長辺が左右（X）、短辺が奥行（Z）。
 * 机に置いた本物の A4 用紙と四隅が重なるかで、遠近の影響を受けずに AR の縮尺を確かめる。
 */
export function buildCalibrationMeshes(model: CalibrationModel): ArMesh[] {
  if (model !== "a4-plate") throw new Error(`未対応の校正用モデルです: ${model satisfies never}`);
  const halfLong = AR_CALIBRATION.a4LongMm / 2 / MM_PER_M;
  const halfShort = AR_CALIBRATION.a4ShortMm / 2 / MM_PER_M;
  const thickness = AR_CALIBRATION.plateThicknessMm / MM_PER_M;
  return [
    boxMesh("a4-plate", [-halfLong, 0, -halfShort], [halfLong, thickness, halfShort], {
      name: "calibration",
      color: AR_MATERIALS.calibration,
      roughness: AR_MATERIALS.roughness,
      doubleSided: true,
    }),
  ];
}
