"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { applyProposal, chatReplySchema, changeSummary, type ChatRequest, type Proposal } from "@/lib/design/ai-contract";
import type { Design } from "@/lib/design/document";

type Entry = { role: "user" | "assistant"; content: string; context?: string };
export function DesignChat({ snapshot, selected, apply }: {
  snapshot: () => { design: Design; revision: number };
  selected: ChatRequest["selected"];
  apply: (proposal: Proposal, revision: number, signal: AbortSignal) => Promise<void>;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [entries]);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);

  async function send() {
    if (controller.current || !input.trim()) return;
    const current = snapshot(), instruction = input.trim();
    const abort = new AbortController(); controller.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(55_000)]);
    setBusy(true); setError(""); setLogin(false);
    try {
      const response = await fetch("/api/design/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: current.design, selected, message: instruction, history: entries.slice(-8).map((entry) => ({ role: entry.role, content: entry.context ?? entry.content })) }),
        signal,
      });
      const data = await response.json();
      if (response.status === 401) setLogin(true);
      if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "AI編集を完了できませんでした。");
      const reply = chatReplySchema.parse(data);
      const { proposal } = applyProposal(current.design, { message: reply.message, changes: reply.changes });
      // API includes design and attempt metadata; proposal validation uses only its fields.
      await apply(proposal, current.revision, signal);
      if (controller.current !== abort) return;
      const changes = changeSummary(current.design, proposal.changes);
      const content = [changes.length ? "変更しました。取り消しで元に戻せます。" : "設計は変更していません。", proposal.message, ...changes].join("\n");
      setEntries((old) => [...old, { role: "user" as const, content: instruction }, { role: "assistant" as const, content: content.slice(0, 2000), context: (changes.length ? "適用した変更:\n" + changes.join("\n") : "設計は変更していません。").slice(0, 2000) }].slice(-20));
      setInput("");
    } catch (e) {
      if (controller.current === abort) setError(abort.signal.aborted ? "中止しました。設計は変更していません。" : e instanceof Error && e.name === "TimeoutError" ? "応答が時間内に届きませんでした。元の設計は保持しています。再送してください。" : e instanceof Error ? e.message : "AI編集を完了できませんでした。");
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(false); }
    }
  }

  return <section aria-label="AIと相談して編集" className="border border-line p-4">
    <h2 className="font-semibold">AIと相談して編集</h2>
    <p className="mt-2 text-sm text-muted-foreground">壁・屋根・窓・棚の寸法と色を、会話で変更できます。検査を通った変更は自動で反映します。</p>
    {entries.length > 0 && <div ref={log} role="log" aria-label="制作の会話" aria-live="polite" className="mt-3 max-h-80 space-y-3 overflow-y-auto border-y border-line py-3">
      {entries.map((entry, i) => <div key={i} className={entry.role === "user" ? "border-l-2 border-brand pl-3" : "pl-3"}>
        <p className="text-sm font-semibold">{entry.role === "user" ? "あなた" : "OshiNest"}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{entry.content}</p>
      </div>)}
    </div>}
    <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <label className="block text-sm font-medium" htmlFor="design-chat-input">変えたいところ</label>
      <textarea id="design-chat-input" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} maxLength={1000} rows={3}
        placeholder="例：屋根を青くして、右奥に棚を置いて"
        className="w-full resize-y border border-line bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !input.trim()}>送信して編集</Button>
        {busy && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>中止</Button>}
        {!!entries.length && !busy && <Button type="button" variant="outline" onClick={() => { setEntries([]); setError(""); }}>会話をクリア</Button>}
      </div>
    </form>
    {busy && <p role="status" className="mt-3 text-sm">変更を考えて、寸法を確認しています…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {login && <Link href="/login?redirect=%2Fcreate" className="mt-2 inline-block py-2 text-sm font-semibold text-brand underline">ログインしてAIを使う</Link>}
    <p className="mt-3 text-sm text-muted-foreground">AIはログイン後に1日30回まで。指示・直近の会話・設計情報をOpenAIに送ります。会話は再読み込みで消えます。ログインへ移動する前に設計を保存してください。</p>
  </section>;
}
