import { z } from "zod";

/**
 * ID（uuid 列）の入力検査。
 *
 * zod の `uuid()` は RFC 4122 のバージョン／バリアント桁まで見るので、開発シードの
 * 固定ID（`22222222-2222-...`）が「Invalid UUID」で弾かれる。DB の uuid 型が受ける
 * 形（16進32桁＋ハイフン）まで緩めて、存在の検査は DB に任せる。
 */
export const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "IDの形式が正しくありません");
