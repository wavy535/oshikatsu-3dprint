"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Paperclip, Square, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { changeSummary, type ChatRequest, type Proposal } from "@/lib/design/ai-contract";
import { RecoveryExhausted, RECOVERY_MESSAGE } from "@/lib/design/recovery";
import { runChatEditing } from "@/lib/design/chat-edit";
import { MAX_REFERENCE_IMAGES, prepareReferenceImage, type ReferenceImage } from "@/lib/design/reference-images";
import type { Design } from "@/lib/design/document";

type Entry = { id: number; role: "user" | "assistant"; content: string; context?: string; images?: ReferenceImage[]; status?: "pending" | "sent" | "failed"; changes?: string[]; repaired?: boolean };
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
  const [login, setLogin] = useState(false), [retryable, setRetryable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0), follow = useRef(true);
  const [cleared, setCleared] = useState<Entry[] | null>(null);
  useEffect(() => { if (log.current && follow.current) log.current.scrollTop = log.current.scrollHeight; }, [entries, busy, repairing]);
  useEffect(() => { if (!busy && entries.length) inputRef.current?.focus({ preventScroll: true }); }, [busy, entries.length]);
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
    const userId = nextId.current++;
    follow.current = true;
    setEntries((old) => [...old, { id: userId, role: "user" as const, content: instruction, images: [...images], status: "pending" as const }].slice(-20));
    setInput(""); setCleared(null);
    setBusy(true); setError(""); setRetryable(false); setLogin(false); setRepairing(false);
    try {
      const { reply, proposal, geometryRepaired } = await runChatEditing({
        design: current.design, selected, message: instruction, images,
        history: entries.filter((entry) => entry.status !== "failed" && entry.status !== "pending").slice(-8).map((entry) => ({ role: entry.role, content: entry.context ?? entry.content })),
      }, current.revision, {
        signal, apply, onRepair: () => setRepairing(true),
        assertCurrent: () => { if (!alive.current || snapshot().revision !== current.revision) throw new Error("AIの応答中に設計が変わりました。現在の設計からもう一度送信してください。"); },
        send: async (body, requestSignal) => {
          const response = await fetch("/api/design/chat", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: requestSignal,
          });
          const data = await response.json();
          if (response.status === 401) setLogin(true);
          if (!response.ok) {
            if (response.status === 401) throw new Error("ログインしてから送信してください。");
            if (response.status === 429) throw new Error("利用上限に達したか、送信間隔が短すぎます。少し待って再送してください。");
            throw new RecoveryExhausted(`chat-http-${response.status}`);
          }
          return data;
        },
      });
      if (controller.current !== abort) return;
      const changes = changeSummary(current.design, proposal.changes);
      setEntries((old) => [...old.map((entry) => entry.id === userId ? { ...entry, status: "sent" as const } : entry), {
        id: nextId.current++, role: "assistant" as const, content: proposal.message, changes,
        repaired: reply.attempts > 1 || geometryRepaired,
        context: (changes.length ? "適用した変更:\n" + changes.join("\n") : proposal.message + "\n設計は変更していません。").slice(0, 2000),
      }].slice(-20));
    } catch (e) {
      if (controller.current === abort) {
        setEntries((old) => old.map((entry) => entry.id === userId ? { ...entry, status: "failed" } : entry));
        setInput(instruction);
        if (e instanceof RecoveryExhausted) console.warn("OshiNest: modelling repair stopped", { diagnostic: e.diagnostic.slice(0, 1000) });
        const cancelled = abort.signal.aborted;
        const changed = e instanceof Error && e.message.startsWith("AIの応答中に設計が変わりました");
        const access = e instanceof Error && /^(ログインしてから|利用上限に達した)/.test(e.message);
        setRetryable(!cancelled && !changed && !access);
        setError(cancelled ? "中止しました。設計は変更していません。" : changed || access ? (e as Error).message : RECOVERY_MESSAGE);
      }
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(false); }
    }
  }

  return <section aria-label="AIと相談して編集" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
    <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div><h2 className="text-balance font-semibold">制作チャット</h2><p className="mt-1 text-pretty text-xs text-muted-foreground">相談しながら、形にしていこう</p></div>
      {!!entries.length && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setCleared(entries); setEntries([]); setError(""); setLogin(false); }}>会話をクリア</Button>}
    </header>
    <div ref={log} role="log" aria-label="制作の会話" aria-live="polite" aria-relevant="additions text"
      onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
      className="flex h-80 min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain p-4 sm:h-96 lg:h-[480px]">
      {!entries.length && <div className="my-auto space-y-4">
        <MessageCircle aria-hidden="true" className="size-7 text-brand" />
        <div><p className="text-balance font-semibold">どんなものを作りたいですか？</p><p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">まだ形が決まっていなくても大丈夫。アイデアを相談したり、画像を見せたり、少しずつ一緒に考えられます。</p></div>
        <Button type="button" variant="outline" className="h-auto w-full whitespace-normal text-left" onClick={() => { setInput("装飾の多い椅子を作りたい。まずデザインを相談したい"); inputRef.current?.focus(); }}>装飾のある椅子を相談する</Button>
      </div>}
      {entries.map((entry) => <article key={entry.id} aria-label={entry.role === "user" ? "あなたのメッセージ" : "OshiNestのメッセージ"}
        className={cn("min-w-0 max-w-full shrink-0", entry.role === "user" ? "ml-6 self-end rounded-2xl rounded-tr-sm bg-ground px-4 py-3" : "mr-3 self-start")}>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{entry.role === "user" ? "あなた" : "OshiNest"}</p>
        {!!entry.images?.length && <div className="mb-2 flex flex-wrap gap-2">{entry.images.map((image, i) => (
          // User-selected normalized data URLs, never remote image URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={image.dataUrl} alt={`送信した参考画像 ${i + 1}`} width={72} height={72} className="size-18 rounded-lg border border-line object-contain" />
        ))}</div>}
        <p className="whitespace-pre-wrap break-words text-pretty text-sm leading-7 [overflow-wrap:anywhere]">{entry.content}</p>
        {entry.status === "failed" && <p className="mt-2 text-xs text-muted-foreground">未完了 · 下の入力欄から再送できます</p>}
        {!!entry.changes?.length && <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-xs font-semibold text-brand">変更を反映しました</p>
          <ul className="mt-2 space-y-1 text-sm">{entry.changes.map((change, i) => <li key={i} className="break-words [overflow-wrap:anywhere]">{change}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">「取り消し」で元に戻せます</p>
        </div>}
        {entry.repaired && <p className="mt-2 text-xs text-muted-foreground">検査結果をもとに変更案を再調整しました。</p>}
      </article>)}
      {busy && <div role="status" className="shrink-0 text-sm text-muted-foreground"><p className="mb-1 text-xs font-semibold">OshiNest</p>{repairing ? "形状を確認して、修正しています…" : "考えています…"}</div>}
    </div>
    {cleared && <div className="flex items-center justify-between gap-2 border-t border-line px-4 text-xs"><span>会話をクリアしました</span><Button type="button" variant="ghost" size="sm" onClick={() => { setEntries(cleared); setCleared(null); }}>会話を戻す</Button></div>}
    <form className="border-t border-line bg-white p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      {error && <p role="alert" className="mb-3 text-pretty text-sm text-danger">{error}</p>}
      {error && retryable && !busy && <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void send()}>もう一度試す</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setInput(`「${input.slice(0, 750)}」について、まだ編集せず、実現できる作り方を相談したいです。`); setError(""); setRetryable(false); inputRef.current?.focus(); }}>作り方を相談する</Button>
      </div>}
      {login && <Link href="/login?redirect=%2Fcreate" className="mb-3 inline-block py-2 text-sm font-semibold text-brand underline">ログインしてAIを使う</Link>}
      <div className="rounded-2xl border border-line bg-ground p-2 focus-within:ring-2 focus-within:ring-brand">
        <input ref={fileRef} aria-label="参考画像" type="file" accept="image/jpeg,image/png" multiple disabled={busy || preparing || images.length >= MAX_REFERENCE_IMAGES}
          className="sr-only" tabIndex={-1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void attach(files); }} />
        {!!images.length && <ul aria-label="添付中の画像" className="flex flex-wrap gap-2 px-1 pb-2">{images.map((image, i) => <li key={i} className="flex items-center gap-2 rounded-xl border border-line bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.dataUrl} alt={`参考画像 ${i + 1}`} width={44} height={44} className="size-11 rounded-lg object-contain" />
          <Button type="button" variant="ghost" size="sm" aria-label={`画像${i + 1}を外す`} disabled={busy || preparing} onClick={() => setImages((old) => old.filter((_, index) => index !== i))}>外す</Button>
        </li>)}</ul>}
        <label className="sr-only" htmlFor="design-chat-input">変えたいところ</label>
        <textarea ref={inputRef} id="design-chat-input" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} maxLength={1000} rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); } }}
          placeholder="作りたいものや、変えたいところを送信"
          className="block max-h-40 min-h-20 w-full resize-y border-0 bg-transparent px-2 py-2 text-base leading-6 outline-none disabled:opacity-60" />
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label="画像を添付" title="JPEG・PNG、各8MB以下、2枚まで" disabled={busy || preparing || images.length >= MAX_REFERENCE_IMAGES} onClick={() => fileRef.current?.click()}><Paperclip aria-hidden="true" className="size-5" /></Button>
          {preparing && <span role="status" className="text-xs text-muted-foreground">画像を準備中…</span>}
          {busy ? <Button key="stop" type="button" variant="outline" size="icon" aria-label="中止" onClick={(e) => { e.preventDefault(); controller.current?.abort(); }}><Square aria-hidden="true" className="size-4 fill-current" /></Button>
            : <Button key="send" type="submit" size="icon" aria-label="送信して編集" disabled={preparing || (!input.trim() && !images.length)}><ArrowUp aria-hidden="true" className="size-5" /></Button>}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Enterで送信 · Shift + Enterで改行</p>
      {!!images.length && <p className="mt-2 text-pretty text-xs text-muted-foreground">添付中の画像は、外すまで次の送信にも使います。</p>}
    </form>
    <details className="px-4 pb-3 text-xs text-muted-foreground"><summary className="min-h-8 cursor-pointer py-2">AIの利用について</summary>
      <p className="text-pretty leading-5">ログイン後に1日30回まで。自動修正の追加送信も1回分を使います。指示・直近の会話・設計情報・添付画像をOpenAIに送ります。画像は縮小して送り、このサービスには保存しません。会話は再読み込みで消えます。相談だけなら設計を変えず、編集を頼むと検査後に反映します。</p>
    </details>
  </section>;
}
