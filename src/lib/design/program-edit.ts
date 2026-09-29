import { parseModelScript } from "./model-script.ts";
import type { AnyNode } from "acorn";

/** Replace one top-level initializer, preserving every other source byte. */
export function editProgramBinding(source: string, binding: string, expression: string): string {
  const replacement = parseModelScript(`const replacement=(${expression});`);
  const statement = replacement.body[0] as AnyNode;
  if (replacement.body.length !== 1 || statement.type !== "VariableDeclaration" || statement.declarations.length !== 1)
    throw new Error("部分編集は1つの式だけを指定してください。");
  const inspect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as AnyNode;
    if (["AssignmentExpression", "UpdateExpression"].includes(node.type) ||
        (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.type === "Identifier" && node.callee.property.name === "push"))
      throw new Error("部分編集の式から他の変数や配列を変更できません。");
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(inspect); else if (child && typeof child === "object") inspect(child);
    }
  };
  inspect(statement.declarations[0].init);
  const matches = parseModelScript(source).body.flatMap(node => {
    const n = node as AnyNode;
    return n.type === "VariableDeclaration" ? n.declarations.filter(d => d.id.type === "Identifier" && d.id.name === binding) : [];
  });
  if (matches.length !== 1 || !matches[0].init) throw new Error("部分編集する変数が見つからないか、一意ではありません。");
  const init = matches[0].init;
  const result = source.slice(0, init.start) + `(${expression})` + source.slice(init.end);
  parseModelScript(result);
  return result;
}
