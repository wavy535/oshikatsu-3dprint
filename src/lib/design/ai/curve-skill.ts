/** Shared geometry vocabulary for both house and image/freeform instructions. */
export const BEZIER_CONTOUR_SKILL = `画像の平たい輪郭や抜き穴にはbezierExtrudeを使える。葉・花びら・波形・非対称な飾りを、箱や球の寄せ集めに置き換えない。輪郭の先端、くびれ、膨らみの位置を画像から読み、少数の滑らかな曲線で結ぶ。
bezierExtrude(curves,height)は閉じた2Dベジェ輪郭をZ方向に押し出す。curvesは2〜16本の曲線。各曲線は[[始点x,y],[制御点1x,y],[制御点2x,y],[終点x,y]]。終点を次の曲線の始点と同じ座標にし、最後は最初の始点に戻す。向きはどちらでもよく、16分割/曲線で生成する。heightは0.2..200mm。輪郭の制御点は各-400..400mm。2つの制御点は曲線が通る点ではなく接線を決める。滑らかにつなぐ箇所は接線方向を揃え、葉先など尖らせる箇所は方向を変える。
構文例: const outline=[[[0,0],[0,15],[20,15],[20,0]],[[20,0],[20,-10],[0,-10],[0,0]]];return bezierExtrude(outline,3);
抜き穴は小さい閉じた輪郭を別にbezierExtrudeし、本体より厚くしてZ=-1からsubtractする。穴が外周へ達しないよう余白を残す。立体的な蔓や先細りの装飾にはstroke、断面が変わる立体にはloftを使い、平面輪郭の押出だけで曲面を作れたと主張しない。`;
