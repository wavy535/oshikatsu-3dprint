import "server-only";
import {
  Kysely,
  SqliteAdapter,
  SqliteQueryCompiler,
  OperationNodeTransformer,
  AliasNode,
  TableNode,
  IdentifierNode,
  InsertQueryNode,
  ValuesNode,
  createQueryId,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
  type FromNode,
  type JoinNode,
  type OperationNode,
  type SelectQueryNode,
  type UpdateQueryNode,
  type DeleteQueryNode,
} from "kysely";
import type { Database } from "@/types/database";
import columnTypes from "./columns.json";
import { d1Introspector } from "./introspector";

export type Actor = {
  role: "app_guest" | "app_user" | "app_service";
  userId?: string;
};
export type Statement = { sql: string; parameters?: readonly unknown[] };
export type Binding = Pick<D1Database, "prepare" | "batch">;
const tableNames = new Set(Object.keys(columnTypes));
const booleanColumns = new Set(
  Object.values(columnTypes).flatMap((columns) =>
    Object.entries(columns)
      .filter(([, type]) => type === "boolean")
      .map(([name]) => name),
  ),
);
const jsonColumns = new Set(
  Object.values(columnTypes).flatMap((columns) =>
    Object.entries(columns)
      .filter(([, type]) => type === "json")
      .map(([name]) => name),
  ),
);

/** Only FROM/JOIN table sources are replaced, never mutation targets/references.
 * Unknown table sources are rejected, so a new table cannot accidentally omit policy.
 * CTE names are tracked within their query scope. */
class Visibility extends OperationNodeTransformer {
  private ctes = new Set<string>();
  source(node: OperationNode): OperationNode {
    if (TableNode.is(node)) {
      const name = node.table.identifier.name;
      if (name.startsWith("visible_") && tableNames.has(name.slice(8)))
        return node;
      if (this.ctes.has(name)) return node;
      if (!tableNames.has(name))
        throw new Error(`Unregistered database table: ${name}`);
      return AliasNode.create(
        TableNode.create(`visible_${name}`),
        IdentifierNode.create(name),
      );
    }
    if (AliasNode.is(node) && TableNode.is(node.node)) {
      const name = node.node.table.identifier.name;
      if (name.startsWith("visible_") && tableNames.has(name.slice(8)))
        return node;
      if (this.ctes.has(name)) return node;
      if (!tableNames.has(name))
        throw new Error(`Unregistered database table: ${name}`);
      return AliasNode.create(TableNode.create(`visible_${name}`), node.alias);
    }
    return this.transformNode(node);
  }
  private mutation(node: OperationNode | undefined) {
    if (
      !node ||
      !TableNode.is(node) ||
      !tableNames.has(node.table.identifier.name)
    )
      throw new Error("Unregistered mutation target");
  }
  protected override transformInsertQuery(
    node: InsertQueryNode,
  ): InsertQueryNode {
    this.mutation(node.into);
    return super.transformInsertQuery(node);
  }
  protected override transformUpdateQuery(
    node: UpdateQueryNode,
  ): UpdateQueryNode {
    this.mutation(node.table);
    return super.transformUpdateQuery(node);
  }
  protected override transformDeleteQuery(
    node: DeleteQueryNode,
  ): DeleteQueryNode {
    node.from.froms.forEach((table) => this.mutation(table));
    return super.transformDeleteQuery(node);
  }
  protected override transformSelectQuery(
    node: SelectQueryNode,
  ): SelectQueryNode {
    if (node.endModifiers?.length)
      throw new Error("D1 uses atomic batches, not SELECT FOR UPDATE");
    const previous = this.ctes;
    this.ctes = new Set([
      ...previous,
      ...(node.with?.expressions.map(
        (e) => e.name.table.table.identifier.name,
      ) ?? []),
    ]);
    try {
      return super.transformSelectQuery(node);
    } finally {
      this.ctes = previous;
    }
  }
  protected override transformFrom(node: FromNode): FromNode {
    // DELETE's FROM is a mutation target; its SQL trigger enforces the policy.
    if (this.nodeStack.at(-2)?.kind === "DeleteQueryNode")
      return super.transformFrom(node);
    return { ...node, froms: node.froms.map((source) => this.source(source)) };
  }
  protected override transformJoin(node: JoinNode): JoinNode {
    return { ...super.transformJoin(node), table: this.source(node.table) };
  }
}

function parameter(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  )
    return JSON.stringify(value);
  return value;
}

function decode<R>(rows: Record<string, unknown>[]): R[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([name, value]) => {
        if (booleanColumns.has(name) && (value === 0 || value === 1))
          return [name, Boolean(value)];
        if (jsonColumns.has(name) && typeof value === "string")
          return [name, JSON.parse(value)];
        return [name, value];
      }),
    ),
  ) as R[];
}

function failure(error: unknown): Error & { code?: string } {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(message, { cause: error }) as Error & {
    code?: string;
  };
  wrapped.code = /UNIQUE constraint failed/.test(message)
    ? "23505"
    : /FOREIGN KEY constraint failed/.test(message)
      ? "23503"
      : /permission denied/.test(message)
        ? "42501"
        : /CHECK constraint failed/.test(message)
          ? "23514"
          : undefined;
  return wrapped;
}

/** Context setup, queries and cleanup are one native D1 transaction. D1 rolls back
 * the whole batch on error. No connection/session state survives between requests. */
export async function executeBatch(
  binding: Binding,
  actor: Actor,
  statements: readonly Statement[],
) {
  if (!statements.length) return [];
  const prepared = [
    binding
      .prepare(
        "UPDATE _request_context SET role=?,user_id=?,internal_depth=0 WHERE id=1",
      )
      .bind(actor.role, actor.userId ?? null),
    ...statements.map((query) =>
      binding
        .prepare(query.sql)
        .bind(...(query.parameters ?? []).map(parameter)),
    ),
    binding.prepare(
      "UPDATE _request_context SET role='app_guest',user_id=NULL,internal_depth=0 WHERE id=1",
    ),
  ];
  try {
    const results = await binding.batch<Record<string, unknown>>(prepared);
    return results.slice(1, -1).map((result) => ({
      rows: decode<Record<string, unknown>>(result.results),
      numAffectedRows: BigInt(result.meta.changes ?? 0),
      insertId: BigInt(result.meta.last_row_id ?? 0),
    }));
  } catch (error) {
    throw failure(error);
  }
}

/** Split large VALUES lists before reaching D1's 100 bound-parameter limit.
 * Every chunk remains in the SAME batch; a later failure rolls back earlier chunks. */
function chunks(query: CompiledQuery): CompiledQuery[] {
  if (query.parameters.length <= 100) return [query];
  const node = query.query;
  if (!InsertQueryNode.is(node) || !node.values || !ValuesNode.is(node.values))
    throw new Error("Query exceeds D1 parameter limit");
  const compiler = new SqliteQueryCompiler();
  const result: CompiledQuery[] = [];
  let values: (typeof node.values.values)[number][] = [];
  for (const row of node.values.values) {
    const candidate = compiler.compileQuery(
      { ...node, values: ValuesNode.create([...values, row]) },
      createQueryId(),
    );
    if (candidate.parameters.length > 100) {
      if (!values.length) throw new Error("Row exceeds D1 parameter limit");
      result.push(
        compiler.compileQuery(
          { ...node, values: ValuesNode.create(values) },
          createQueryId(),
        ),
      );
      values = [];
    }
    values.push(row);
  }
  if (values.length)
    result.push(
      compiler.compileQuery(
        { ...node, values: ValuesNode.create(values) },
        createQueryId(),
      ),
    );
  return result;
}

/** Parse only JSON projections/columns, including nested helper projections.
 * Metadata belongs to this compiled execution, not QueryId (cloned builders share
 * QueryIds and can execute different projections concurrently). */
function hydrateRows<R>(
  rows: Record<string, unknown>[],
  node: OperationNode,
): R[] {
  const aliases = new Set<string>();
  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;
    const alias = value as OperationNode;
    if (
      AliasNode.is(alias) &&
      IdentifierNode.is(alias.alias) &&
      alias.node.kind === "RawNode" &&
      JSON.stringify(alias.node).includes("json_")
    )
      aliases.add(alias.alias.name);
    Object.values(value).forEach((child) =>
      Array.isArray(child) ? child.forEach(collect) : collect(child),
    );
  }
  collect(node);
  function nested(value: unknown, key?: string): unknown {
    if (
      key &&
      typeof value === "string" &&
      (aliases.has(key) || jsonColumns.has(key))
    )
      value = JSON.parse(value);
    if (key && booleanColumns.has(key) && (value === 0 || value === 1))
      return Boolean(value);
    if (Array.isArray(value)) return value.map((v) => nested(v));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, nested(v, k)]),
      );
    return value;
  }
  return rows.map((row) => nested(row)) as R[];
}

class D1Driver implements Driver, DatabaseConnection {
  constructor(
    private binding: Binding,
    private actor: Actor,
  ) {}
  async init() {}
  async acquireConnection() {
    return this;
  }
  async releaseConnection() {}
  async destroy() {}
  async beginTransaction(): Promise<never> {
    throw new Error("Use atomicBatch for D1 transactions");
  }
  async commitTransaction(): Promise<never> {
    throw new Error("Use atomicBatch for D1 transactions");
  }
  async rollbackTransaction(): Promise<never> {
    throw new Error("Use atomicBatch for D1 transactions");
  }
  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    if (
      ![
        "SelectQueryNode",
        "InsertQueryNode",
        "UpdateQueryNode",
        "DeleteQueryNode",
      ].includes(query.query.kind)
    )
      throw new Error(
        "Raw SQL and schema changes must use an audited domain operation",
      );
    const results = await executeBatch(this.binding, this.actor, chunks(query));
    return {
      rows: hydrateRows<R>(
        results.flatMap((r) => r.rows),
        query.query,
      ),
      numAffectedRows: results.reduce(
        (n, r) => n + r.numAffectedRows,
        BigInt(0),
      ),
      insertId: results.at(-1)?.insertId,
    };
  }
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("D1 streaming is unsupported");
  }
}

const contexts = new WeakMap<
  Kysely<Database>,
  { binding: Binding; actor: Actor }
>();
export function d1Database(binding: Binding, actor: Actor): Kysely<Database> {
  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createDriver: () => new D1Driver(binding, actor),
      createIntrospector: () => d1Introspector(binding, actor),
    },
    plugins: [
      {
        transformQuery: ({ node }) => new Visibility().transformNode(node),
        transformResult: async ({ result }) => result,
      },
    ],
  });
  contexts.set(db, { binding, actor });
  return db;
}
export function context(db: Kysely<Database>) {
  const context = contexts.get(db);
  if (!context) throw new Error("Expected a request-scoped D1 database");
  return context;
}
export async function atomicBatch(
  db: Kysely<Database>,
  queries: readonly (Statement | { compile(): CompiledQuery })[],
) {
  const { binding, actor } = context(db);
  return executeBatch(
    binding,
    actor,
    queries.flatMap((query) =>
      "compile" in query ? chunks(query.compile()) : [query],
    ),
  );
}

/** Assert inside a batch, before mutations. Checking outside would allow a race. */
export function assertQuery(query: { compile(): CompiledQuery }): Statement {
  const compiled = query.compile();
  return {
    sql: `INSERT INTO _assert(ok) SELECT EXISTS(${compiled.sql})`,
    parameters: compiled.parameters,
  };
}
