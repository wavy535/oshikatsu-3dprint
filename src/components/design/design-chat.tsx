"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { changeSummary, type ChatRequest, type Proposal } from "@/lib/design/ai-contract";
import { runChatEditing } from "@/lib/design/chat-edit";
import { MAX_REFERENCE_IMAGES, prepareReferenceImage, type ReferenceImage } from "@/lib/design/reference-images";
import type { Design } from "@/lib/design/document";

type Entry = { role: "user" | "assistant"; content: string; context?: string };
export function DesignChat({ snapshot, selected, apply }: {
  snapshot: () => { design: Design; revision: number };
  selected: ChatRequest["selected"];
  apply: (proposal: Proposal, revision: number, signal: AbortSignal) => Promise<void>;
}) {
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [preparing, setPreparing] = useState(false), [repairing, setRepairing] = useState(false);
  const preparingRef = useRef(false), alive = useRef(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [entries]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); controller.current = null; }; }, []);

  async function attach(files: File[]) {
    if (preparingRef.current || controller.current) return;
    if (images.length + files.length > MAX_REFERENCE_IMAGES) { setError("参考画像は2枚までです。"); return; }
    preparingRef.current = true; setPreparing(true); setError("");
    try {
      const added: ReferenceImage[] = [];
      for (const file of files) added.push(await prepareReferenceImage(file));
      if (alive.current) setImages((old) => [...old, ...added]);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "画像を読み込めませんでした。"); }
    finally { preparingRef.current = false; if (alive.current) setPreparing(false); }
  }

  async function send() {
    if (controller.current || preparingRef.current || (!input.trim() && !images.length)) return;
    const current = snapshot(), instruction = input.trim() || "添付画像を参考に作れるものを提案し、必要な寸法を確認してください。";
    const abort = new AbortController(); controller.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(140_000)]);
    setBusy(true); setError(""); setLogin(false); setRepairing(false);
    try {
      const { reply, proposal, geometryRepaired } = await runChatEditing({
        design: current.design, selected, message: instruction, images,
        history: entries.slice(-8).map((entry) => ({ role: entry.role, content: entry.context ?? entry.content })),
      }, current.revision, {
        signal, apply, onRepair: () => setRepairing(true),
        assertCurrent: () => { if (!alive.current || snapshot().revision !== current.revision) throw new Error("AIの応答中に設計が変わりました。現在の設計からもう一度送信してください。"); },
        send: async (body, requestSignal) => {
          const response = await fetch("/api/design/chat", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: requestSignal,
          });
          const data = await response.json();
          if (response.status === 401) setLogin(true);
          if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "AI編集を完了できませんでした。");
          return data;
        },
      });
      if (controller.current !== abort) return;
      const changes = changeSummary(current.design, proposal.changes);
      const content = [changes.length ? "変更しました。取り消しで元に戻せます。" : "設計は変更していません。", ...(reply.attempts > 1 || geometryRepaired ? ["検査結果をもとに変更案を再調整しました。"] : []), proposal.message, ...changes].join("\n");
      setEntries((old) => [...old, { role: "user" as const, content: instruction + (images.length ? `（参考画像${images.length}枚）` : "") }, { role: "assistant" as const, content: content.slice(0, 2000), context: (changes.length ? "適用した変更:\n" + changes.join("\n") : "設計は変更していません。").slice(0, 2000) }].slice(-20));
      setInput("");
    } catch (e) {
      if (controller.current === abort) setError(abort.signal.aborted ? "中止しました。設計は変更していません。" : e instanceof Error && e.name === "TimeoutError" ? "応答が時間内に届きませんでした。元の設計は保持しています。再送してください。" : e instanceof Error ? e.message : "AI編集を完了できませんでした。");
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(false); }
    }
  }

  return <section aria-label="AIと相談して編集" className="border border-line p-4">
    <h2 className="font-semibold">AIと相談して編集</h2>
    <p className="mt-2 text-sm text-muted-foreground">画像を参考に、アーチや段差などを組み合わせた家具も会話で作れます。位置・寸法の問題は再調整します。検査を通った変更は自動で反映します。</p>
    {entries.length > 0 && <div ref={log} role="log" aria-label="制作の会話" aria-live="polite" className="mt-3 max-h-80 space-y-3 overflow-y-auto border-y border-line py-3">
      {entries.map((entry, i) => <div key={i} className={entry.role === "user" ? "border-l-2 border-brand pl-3" : "pl-3"}>
        <p className="text-sm font-semibold">{entry.role === "user" ? "あなた" : "OshiNest"}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{entry.content}</p>
      </div>)}
    </div>}
    <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <label className="block text-sm font-medium">参考画像（JPEG・PNG、各8MB以下、2枚まで）
        <input aria-label="参考画像" type="file" accept="image/jpeg,image/png" multiple disabled={busy || preparing || images.length >= MAX_REFERENCE_IMAGES}
          className="mt-2 block w-full min-w-0 text-sm" onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void attach(files); }} />
      </label>
      {preparing && <p role="status" className="text-sm">画像を準備しています…</p>}
      {!!images.length && <ul aria-label="添付中の画像" className="flex flex-wrap gap-3">{images.map((image, i) => <li key={i} className="w-28">
        {/* User-selected, normalized data URL; no remote image loader is needed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.dataUrl} alt={`参考画像 ${i + 1}`} width={112} height={112} className="h-28 w-28 border border-line object-contain" />
        <Button type="button" variant="outline" size="sm" disabled={busy || preparing} onClick={() => setImages((old) => old.filter((_, index) => index !== i))}>画像{i + 1}を外す</Button>
      </li>)}</ul>}
      <label className="block text-sm font-medium" htmlFor="design-chat-input">変えたいところ</label>
      <textarea id="design-chat-input" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} maxLength={1000} rows={3}
        placeholder="例：曲がった脚と唐草飾りの椅子を作って"
        className="w-full resize-y border border-line bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || preparing || (!input.trim() && !images.length)}>送信して編集</Button>
        {busy && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>中止</Button>}
        {!!entries.length && !busy && <Button type="button" variant="outline" onClick={() => { setEntries([]); setError(""); }}>会話をクリア</Button>}
      </div>
    </form>
    {busy && <p role="status" className="mt-3 text-sm">{repairing ? "形状の検査結果をもとに再提案しています。送信間隔を空けて、自動修正は1回だけ行います…" : "変更を考えて、寸法を確認しています…"}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {login && <Link href="/login?redirect=%2Fcreate" className="mt-2 inline-block py-2 text-sm font-semibold text-brand underline">ログインしてAIを使う</Link>}
    <p className="mt-3 text-sm text-muted-foreground">AIはログイン後に1日30回まで。自動修正の追加送信も1回分を使います。指示・直近の会話・設計情報・添付中の画像を毎回OpenAIに送ります。画像は縮小して送り、このサービスには保存しません。画像だけから正確な寸法は測れません。会話は再読み込みで消えます。ログインへ移動する前に設計を保存してください。</p>
  </section>;
}
