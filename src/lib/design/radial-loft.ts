/** Elliptic sections with optional radial relief; dimensions exclude relief. */
export type RadialSection = [
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  rotation: number,
  relief: number,
];
type Point3 = [number, number, number];

export function sampleRadialLoft(
  sections: RadialSection[],
  ridges: number,
): Point3[][] {
  if (sections.length < 2 || sections.length > 16)
    throw new Error("radialLoftの断面は2〜16個です。");
  if (!Number.isInteger(ridges) || ridges < 0 || ridges > 12)
    throw new Error("稜線の本数は0〜12の整数です。");
  for (let i = 0; i < sections.length; i++) {
    const [, , z, width, depth, rotation, relief] = sections[i];
    if (width < 0.4 || width > 200 || depth < 0.4 || depth > 200)
      throw new Error("断面の幅・奥行は0.4〜200mmです。");
    if (Math.abs(rotation) > 360)
      throw new Error("断面の回転は-360〜360度です。");
    if (
      relief < 0 ||
      relief > Math.min(width, depth) * 0.4 ||
      (!ridges && relief !== 0)
    )
      throw new Error("稜線の高さは短い辺の40%以下、稜線0本なら高さ0です。");
    if (i && z <= sections[i - 1][2])
      throw new Error("断面のZを下から上へ増やしてください。");
  }

  // Keep large twists from collapsing between two sparsely specified rings.
  const steps = sections
    .slice(1)
    .map((section, i) =>
      Math.max(1, Math.ceil(Math.abs(section[5] - sections[i][5]) / 6)),
    );
  if (1 + steps.reduce((sum, count) => sum + count, 0) > 64)
    throw new Error(
      "回転の補間が64断面を超えます。ひねりの往復を減らしてください。",
    );
  const sampled = [sections[0]];
  for (let i = 1; i < sections.length; i++) {
    for (let step = 1; step <= steps[i - 1]; step++) {
      const t = step / steps[i - 1];
      sampled.push(
        sections[i].map(
          (value, axis) => sections[i - 1][axis] * (1 - t) + value * t,
        ) as RadialSection,
      );
    }
  }
  return sampled.map(([x, y, z, width, depth, rotation, relief]) => {
    const turn = (rotation * Math.PI) / 180;
    const cosTurn = Math.cos(turn),
      sinTurn = Math.sin(turn);
    return Array.from({ length: 48 }, (_, i): Point3 => {
      const angle = (i * 2 * Math.PI) / 48;
      const px = (width / 2) * Math.cos(angle),
        py = (depth / 2) * Math.sin(angle);
      const scale =
        1 + (relief * Math.cos(ridges * angle)) / Math.hypot(px, py);
      return [
        x + scale * (px * cosTurn - py * sinTurn),
        y + scale * (px * sinTurn + py * cosTurn),
        z,
      ];
    });
  });
}
