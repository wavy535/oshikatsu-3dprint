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

/** Keep the original snapshot through both requests; never apply a failed mesh. */
export async function runChatEditing(request: ChatRequest, revision: number, options: {
  signal: AbortSignal;
  send: (request: ChatRequest, signal: AbortSignal) => Promise<unknown>;
  apply: (proposal: Proposal, revision: number, signal: AbortSignal) => Promise<void>;
  assertCurrent: () => void;
  onRepair: () => void;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<{ reply: ChatReply; proposal: Proposal; geometryRepaired: boolean }> {
  let input = request;
  for (let attempt = 0; attempt < 2; attempt++) {
    options.signal.throwIfAborted(); options.assertCurrent();
    const reply = chatReplySchema.parse(await options.send(input, options.signal));
    options.signal.throwIfAborted(); options.assertCurrent();
    const { proposal } = applyProposal(request.design, { message: reply.message, changes: reply.changes });
    try {
      await options.apply(proposal, revision, options.signal);
      return { reply, proposal, geometryRepaired: attempt > 0 };
    } catch (error) {
      options.signal.throwIfAborted(); options.assertCurrent();
      if (!(error instanceof CompositeGeometryError) || attempt > 0) throw error;
      options.onRepair();
      input = { ...request, geometryFeedback: { proposal, error: error.message.slice(0, 1000) } };
      // This is a second quota-counted request, never a bypass of the 8s limit.
      // Count from receipt of the response: its server reservation is necessarily earlier.
      await (options.wait ?? waitForCooldown)(8100, options.signal);
    }
  }
  throw new Error("形状を修正できませんでした。元の設計は保持しています。");
}
