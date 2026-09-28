import { parseModelScript } from "./model-script.ts";
import { RecoveryExhausted, repairHint } from "./recovery.ts";
import { applyProposal, chatReplySchema, type ChatRequest, type ChatReply, type Proposal } from "./ai-contract.ts";
import { CompositeGeometryError } from "./composite.ts";

function waitForCooldown(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// Ignore formatting, comments and AST positions when identifying repeated code.
function fingerprint(proposal: Proposal): string {
  return JSON.stringify(proposal.changes, (key, value) => {
    if (key === "source" && typeof value === "string") {
      try { return JSON.parse(JSON.stringify(parseModelScript(value), (k, v) => ["start", "end", "loc", "raw"].includes(k) ? undefined : v)); }
      catch { return value.trim(); }
    }
    return value;
  });
}

/** Budget counts server repair calls too. Original snapshot survives all attempts. */
export async function runChatEditing(request: ChatRequest, revision: number, options: {
  signal: AbortSignal;
  send: (request: ChatRequest, signal: AbortSignal) => Promise<unknown>;
  apply: (proposal: Proposal, revision: number, signal: AbortSignal) => Promise<void>;
  assertCurrent: () => void;
  onRepair: () => void;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<{ reply: ChatReply; proposal: Proposal; geometryRepaired: boolean }> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(140_000)]);
  let input = request, calls = 0;
  const failed = new Set<string>();
  const failures = new Map<string, number>();
  while (calls < 3) {
    signal.throwIfAborted(); options.assertCurrent();
    const reply = chatReplySchema.parse(await options.send(input, signal));
    signal.throwIfAborted(); options.assertCurrent();
    calls += reply.attempts;
    const proposal = { message: reply.message, changes: reply.changes };
    const identity = fingerprint(proposal);
    if (failed.has(identity)) throw new RecoveryExhausted("同じ提案が再提出されました。");
    try {
      try { applyProposal(request.design, proposal); }
      catch (error) { throw new CompositeGeometryError(error instanceof Error ? error.message : "提案の検証に失敗しました。"); }
      await options.apply(proposal, revision, signal);
      return { reply, proposal, geometryRepaired: failed.size > 0 };
    } catch (error) {
      signal.throwIfAborted(); options.assertCurrent();
      if (!(error instanceof CompositeGeometryError)) throw error;
      failed.add(identity);
      const category = error.message.replace(/model-\d|custom-\d|\d+行目/g, "");
      const repeats = (failures.get(category) ?? 0) + 1; failures.set(category, repeats);
      if (calls >= 3 || repeats >= 2) throw new RecoveryExhausted(error.message);
      options.onRepair();
      input = { ...request, geometryFeedback: { proposal, error: `${error.message.slice(0, 700)}\n修正方針: ${repairHint(error.message)}`.slice(0, 1000) } };
      // This is a second quota-counted request, never a bypass of the 8s limit.
      // Count from receipt of the response: its server reservation is necessarily earlier.
      await (options.wait ?? waitForCooldown)(8100, signal);
    }
  }
  throw new RecoveryExhausted("モデル呼出上限に達しました。");
}
