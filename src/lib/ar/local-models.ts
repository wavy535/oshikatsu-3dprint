import "server-only";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { AR_DEV_PAGE } from "./config.ts";
import { localModelNames, localModelVersion } from "./dev.ts";

// 開発用の実寸テストで、手元のフォルダに置いた 3MF / STL を読む（DB・S3 は使わない）

export type LocalModel = { name: string; bytes: number; version: string };

/** 手元の3Dデータを置くフォルダ（絶対パス） */
export const localModelDirectory = () => path.resolve(process.cwd(), AR_DEV_PAGE.localModelDir);

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");

/** フォルダの実際の場所（シンボリックリンクをたどった先）。フォルダがなければ null */
export async function realLocalModelDirectory(directory = localModelDirectory()) {
  try {
    return await realpath(directory);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** フォルダにある 3MF / STL の一覧（名前順）。フォルダがなければ null */
export async function listLocalModels(directory = localModelDirectory()): Promise<LocalModel[] | null> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const models: LocalModel[] = [];
  for (const name of localModelNames(names)) {
    const info = await stat(path.join(directory, name));
    if (info.isFile()) models.push({ name, bytes: info.size, version: localModelVersion(info) });
  }
  return models;
}

/**
 * 一覧にあるファイルだけを読む。名前は一覧の名前と完全に一致させ、
 * パス区切りや .. を含む名前でフォルダの外を読ませない。一覧になければ null
 */
export async function readLocalModel(name: string, directory = localModelDirectory()) {
  const models = await listLocalModels(directory);
  if (!models?.some((model) => model.name === name)) return null;
  return readFile(path.join(directory, name));
}
