import { writeFile } from "node:fs/promises";

// D1's remote SQL splitter can mistake a CASE's END for the trigger's END.
// Parentheses disambiguate without changing SQLite expression semantics.
// https://github.com/cloudflare/workers-sdk/issues/4727
export function parenthesizeCases(sql) {
  let depth = 0;
  const result = sql.replace(
    /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|\bCASE\b|\bEND\b/gi,
    (token) => {
      if (/^CASE$/i.test(token)) {
        depth++;
        return `(${token}`;
      }
      if (/^END$/i.test(token) && depth > 0) {
        depth--;
        return `${token})`;
      }
      return token;
    },
  );
  if (depth !== 0) throw new Error("Unclosed CASE in generated D1 SQL");
  return result;
}

export async function writeD1Migration(path, sql) {
  await writeFile(path, parenthesizeCases(sql));
}
