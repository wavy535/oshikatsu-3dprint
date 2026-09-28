import { parse, type AnyNode, type Node } from "acorn";

// This is an interpreter, never JavaScript eval. Values cannot contain host objects
// or functions. Calls are resolved by name; member calls only allow array.push.
export type ScriptValue = number | boolean | null | ScriptValue[];
export type ModelApi = Readonly<Record<string, (...args: ScriptValue[]) => ScriptValue>>;
const fail = (message: string): never => { throw new Error(`モデリングコード: ${message}`); };
const supported = new Set(["Program", "BlockStatement", "VariableDeclaration", "VariableDeclarator", "Identifier", "Literal", "ArrayExpression", "ExpressionStatement", "ForStatement", "IfStatement", "ReturnStatement", "BinaryExpression", "LogicalExpression", "UnaryExpression", "UpdateExpression", "AssignmentExpression", "MemberExpression", "CallExpression", "ConditionalExpression", "EmptyStatement"]);
export function parseModelScript(source: string) {
  if (new TextEncoder().encode(source).length > 12000) fail("コードは12KBまでです。");
  const tree = parse(source, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
  let count = 0;
  const inspect = (value: unknown, depth: number) => {
    if (depth > 64 || ++count > 10000) fail("式の入れ子が深すぎます。");
    if (!value || typeof value !== "object") return;
    const node = value as { type?: string };
    if (node.type && !supported.has(node.type)) fail(`${node.type}は使えません。`);
    for (const v of Object.values(value)) if (v && typeof v === "object") {
      if (Array.isArray(v)) for (const item of v) inspect(item, depth + 1); else inspect(v, depth + 1);
    }
  };
  inspect(tree, 0);
  return tree;
}
export const scriptNumber = (value: ScriptValue | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e9) return fail("有限の数値が必要です。");
  return value;
};
class Returned { readonly value: ScriptValue; constructor(value: ScriptValue) { this.value = value; } }
type Binding = { value: ScriptValue; constant: boolean };
class Scope {
  values = new Map<string, Binding>();
  readonly parent?: Scope;
  constructor(parent?: Scope) { this.parent = parent; }
  find(name: string): Binding { return this.values.get(name) ?? this.parent?.find(name) ?? fail(`変数${name}がありません。`); }
}
export function runModelScript(source: string, api: ModelApi): ScriptValue {
  const tree = parseModelScript(source);
  let fuel = 100000, allocations = 0;
  const allocate = (n: number) => { allocations += n; if (allocations > 30000) fail("配列の上限を超えました。"); };
  const math: ModelApi = Object.freeze({ sin: (x) => Math.sin(scriptNumber(x)), cos: (x) => Math.cos(scriptNumber(x)), sqrt: (x) => scriptNumber(Math.sqrt(scriptNumber(x))), abs: (x) => Math.abs(scriptNumber(x)), min: (...xs) => Math.min(...xs.map(scriptNumber)), max: (...xs) => Math.max(...xs.map(scriptNumber)), pow: (a, b) => scriptNumber(Math.pow(scriptNumber(a), scriptNumber(b))) });
  const walk = (input: Node, scope: Scope): ScriptValue => {
    if (--fuel < 0) fail("計算回数の上限を超えました。ループを短くしてください。");
    const n = input as AnyNode;
    switch (n.type) {
      case "Program": for (const s of n.body) walk(s, scope); return null;
      case "BlockStatement": { const block = new Scope(scope); for (const s of n.body) walk(s, block); return null; }
      case "EmptyStatement": return null;
      case "VariableDeclaration":
        if (n.kind !== "let" && n.kind !== "const") return fail("letかconstを使ってください。");
        for (const d of n.declarations) {
          if (d.id.type !== "Identifier" || scope.values.has(d.id.name)) return fail("変数宣言が不正です。");
          scope.values.set(d.id.name, { value: d.init ? walk(d.init, scope) : null, constant: n.kind === "const" });
        }
        return null;
      case "Identifier": return scope.find(n.name).value;
      case "Literal": if (typeof n.value === "boolean" || n.value === null) return n.value; return scriptNumber(n.value as ScriptValue);
      case "ArrayExpression": allocate(n.elements.length); return n.elements.map((v) => v ? walk(v, scope) : fail("配列に空欄は使えません。"));
      case "ExpressionStatement": return walk(n.expression, scope);
      case "ReturnStatement": throw new Returned(n.argument ? walk(n.argument, scope) : null);
      case "IfStatement": return walk(n.test, scope) ? walk(n.consequent, scope) : n.alternate ? walk(n.alternate, scope) : null;
      case "ForStatement": {
        const local = new Scope(scope); if (n.init) walk(n.init, local);
        while (!n.test || walk(n.test, local)) { if (--fuel < 0) fail("ループ上限を超えました。"); walk(n.body, local); if (n.update) walk(n.update, local); }
        return null;
      }
      case "ConditionalExpression": return walk(n.test, scope) ? walk(n.consequent, scope) : walk(n.alternate, scope);
      case "LogicalExpression": { const a = walk(n.left, scope); if (n.operator === "&&") return a ? walk(n.right, scope) : a; if (n.operator === "||") return a ? a : walk(n.right, scope); return fail("論理演算は&&と||のみです。"); }
      case "UnaryExpression": { const v = walk(n.argument, scope); if (n.operator === "!") return !v; if (n.operator === "-") return -scriptNumber(v); if (n.operator === "+") return scriptNumber(v); return fail("未対応の単項演算です。"); }
      case "BinaryExpression": {
        const a = scriptNumber(walk(n.left, scope)), b = scriptNumber(walk(n.right, scope));
        switch (n.operator) {
          case "+": return scriptNumber(a + b); case "-": return scriptNumber(a - b); case "*": return scriptNumber(a * b); case "/": return scriptNumber(a / b); case "%": return scriptNumber(a % b); case "**": return scriptNumber(a ** b);
          case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b; case "===": return a === b; case "!==": return a !== b;
          default: return fail("未対応の演算です。");
        }
      }
      case "UpdateExpression": {
        if (n.argument.type !== "Identifier") return fail("更新対象は変数だけです。");
        const b = scope.find(n.argument.name); if (b.constant) fail("constは更新できません。");
        const old = scriptNumber(b.value); b.value = scriptNumber(old + (n.operator === "++" ? 1 : -1)); return n.prefix ? b.value : old;
      }
      case "AssignmentExpression": {
        if (n.left.type !== "Identifier" || n.operator !== "=") return fail("代入は変数への=だけです。");
        const b = scope.find(n.left.name); if (b.constant) fail("constは更新できません。");
        b.value = walk(n.right, scope); return b.value;
      }
      case "MemberExpression": {
        if (!n.computed && n.object.type === "Identifier" && n.object.name === "Math" && n.property.type === "Identifier" && n.property.name === "PI") return Math.PI;
        const obj = walk(n.object, scope); if (!Array.isArray(obj)) return fail("プロパティ参照は配列だけです。");
        if (!n.computed && n.property.type === "Identifier" && n.property.name === "length") return obj.length;
        if (!n.computed) return fail("このプロパティは使えません。");
        const i = scriptNumber(walk(n.property, scope)); if (!Number.isInteger(i) || i < 0 || i >= obj.length) return fail("配列の範囲外です。");
        return obj[i];
      }
      case "CallExpression": {
        if (n.arguments.length > 16) return fail("引数が多すぎます。");
        const args = n.arguments.map((a) => walk(a, scope));
        if (n.callee.type === "Identifier" && Object.hasOwn(api, n.callee.name)) {
          const fn = api[n.callee.name];
          if (args.length !== fn.length) return fail(`${n.callee.name}の引数は${fn.length}個です。`);
          return fn(...args);
        }
        if (n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.property.type === "Identifier") {
          const name = n.callee.property.name;
          if (n.callee.object.type === "Identifier" && n.callee.object.name === "Math" && Object.hasOwn(math, name)) return math[name](...args);
          const array = walk(n.callee.object, scope);
          if (Array.isArray(array) && name === "push") {
            // Deep copy prevents cycles (a.push(a)) and shared exponential graphs.
            const copy = (v: ScriptValue, depth = 0): ScriptValue => { allocate(1); if (depth > 32) return fail("配列が深すぎます。"); return Array.isArray(v) ? v.map((x) => copy(x, depth + 1)) : v; };
            array.push(...args.map((a) => copy(a))); return array.length;
          }
        }
        return fail("この関数は呼べません。");
      }
      default: return fail(`${n.type}は使えません。`);
    }
  };
  try { walk(tree, new Scope()); } catch (e) { if (e instanceof Returned) return e.value; throw e; }
  return fail("最後にreturnで立体を返してください。");
}
