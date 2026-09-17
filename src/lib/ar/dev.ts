import { revisionOf } from "./revision.ts";

// 開発用の実寸テストページ（/dev/ar）だけで使うもの

/** 手元のフォルダ・ファイルの名前を、名前順（数字は数として、2 は 10 より前）に並べる */
export const sortLocalNames = (names: string[]) =>
  [...names].sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));

/** 手元のファイルの版。大きさと更新日時から作り、ファイルを置き換えると変わる */
export const localModelVersion = (file: { size: number; mtimeMs: number }) =>
  revisionOf(`${file.size}:${file.mtimeMs}`);
