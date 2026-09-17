// マイぬいの採寸値の設定。数値はここだけで持つ。
// 推定の比率は DB の nui_sit_height_ratio() / nui_width_ratio()（db/migrations/0007_nui_height.sql）と同じ値にそろえる。

/**
 * 身長（立たせた全長）から、入力されていない採寸値を推定する比率。
 * 2頭身の人型ぬいを前提にした仮の値で、実物を測って調整する。比率は小数第2位までにする（丸めを DB とそろえるため）。
 */
export const NUI_PROPORTIONS = {
  // 座高 ÷ 身長。15cm ぬいの型紙（頭 7.5cm・脚 3cm）で、座らせると脚のぶん低くなることから見積もった
  sitHeightPerHeight: 0.88,
  // 一番広い幅（抱き幅）÷ 身長。頭囲 25cm の頭の幅から見積もった。奥行きにも同じ値を使う
  widthPerHeight: 0.57,
} as const;
