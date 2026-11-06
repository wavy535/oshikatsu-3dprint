/** Bounded closed cubic paths for smooth, planar modelling silhouettes. */
export type Point2 = [number, number];
export type CubicSegment = [Point2, Point2, Point2, Point2];

export function sampleBezierContour(segments: CubicSegment[]): Point2[] {
  if (segments.length < 2 || segments.length > 16) {
    throw new Error("ベジェ輪郭は2〜16本の曲線で閉じてください。");
  }
  const points: Point2[] = [];
  for (let index = 0; index < segments.length; index++) {
    const [start, first, second, end] = segments[index];
    const next = segments[(index + 1) % segments.length][0];
    if (Math.hypot(end[0] - next[0], end[1] - next[1]) > 0.001) {
      throw new Error(
        `曲線${index + 1}の終点を次の曲線の始点に合わせて輪郭を閉じてください。`,
      );
    }
    for (let step = 0; step < 16; step++) {
      const t = step / 16,
        u = 1 - t;
      points.push(
        [0, 1].map(
          (axis) =>
            u ** 3 * start[axis] +
            3 * u ** 2 * t * first[axis] +
            3 * u * t ** 2 * second[axis] +
            t ** 3 * end[axis],
        ) as Point2,
      );
    }
  }
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (Math.abs(area) < 0.001) throw new Error("ベジェ輪郭に面積がありません。");
  return area < 0 ? points.reverse() : points;
}
