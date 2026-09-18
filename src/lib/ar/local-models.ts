import "server-only";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { AR_DEV_PAGE } from "./config.ts";
import { localModelVersion, sortLocalNames } from "./dev.ts";
import { workModelExtension } from "./work-model.ts";

// 開発用の実寸テストで、手元のフォルダに置いた 3MF / STL / .blend を読む（DB・S3 は使わない）

// フォルダ名とファイル名の区切り。一覧の名前（"roomfile/room.3mf"）と URL の name に使う
const FOLDER_SEPARATOR = "/";

export type LocalModel = { name: string; bytes: number; version: string };
export type LocalModelFolder = {
  folder: string;
  // シンボリックリンクのとき、リンク先の場所
  linkedTo: string | null;
  models: LocalModel[];
  // 3MF / STL / .blend 以外のファイル（OBJ・画像・メモなど）
  unsupported: string[];
};

/** 手元の3Dデータの置き場所（絶対パス） */
export function localModelRoot() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local AR models are available only in development");
  }
  // Developer-owned files are read at runtime only; never trace them into a deployment.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), AR_DEV_PAGE.localModelRoot);
}

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");

const isVisible = (name: string) => !name.startsWith(".");

/**
 * 置き場所の直下にあるフォルダ（シンボリックリンクを含む）ごとの 3MF / STL / .blend。
 * 置き場所の直下のファイル（メモなど）は見ない。置き場所がなければ null
 */
export async function listLocalModelFolders(root = localModelRoot()): Promise<LocalModelFolder[] | null> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }

  const folders: LocalModelFolder[] = [];
  for (const folder of sortLocalNames(entries.filter(isVisible))) {
    const directory = path.join(root, folder);
    if (!(await stat(directory)).isDirectory()) continue;
    const real = await realpath(directory);
    const models: LocalModel[] = [];
    const unsupported: string[] = [];
    for (const name of sortLocalNames((await readdir(directory)).filter(isVisible))) {
      const info = await stat(path.join(directory, name));
      if (!info.isFile()) continue;
      if (workModelExtension(name) === null) unsupported.push(name);
      else models.push({ name: `${folder}${FOLDER_SEPARATOR}${name}`, bytes: info.size, version: localModelVersion(info) });
    }
    folders.push({ folder, linkedTo: real === directory ? null : real, models, unsupported });
  }
  return folders;
}

/**
 * 一覧にあるファイルだけを読む。名前は一覧の名前（"roomfile/room.3mf"）と完全に一致させ、
 * .. などを含む名前で置き場所の外を読ませない。一覧になければ null
 */
export async function readLocalModel(name: string, root = localModelRoot()) {
  const folders = await listLocalModelFolders(root);
  if (!folders?.some((folder) => folder.models.some((model) => model.name === name))) return null;
  return readFile(path.join(root, ...name.split(FOLDER_SEPARATOR)));
}
