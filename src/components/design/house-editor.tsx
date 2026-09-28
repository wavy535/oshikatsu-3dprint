"use client";

import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createDesignStore, DESIGN_FILE_LIMIT, readDesign, type Design } from "@/lib/design/document";
import type { DesignBuild } from "@/lib/design/geometry";
import type { ExportFormat } from "@/lib/design/export";
import { createWorkerClient, Superseded } from "@/lib/design/worker-client";
import { DesignChat } from "./design-chat";
import { applyProposal, type ChatRequest, type Proposal } from "@/lib/design/ai-contract";
import { NumberField, Toggle, ColorField } from "./fields";
import { FurnitureEditor } from "./furniture-editor";
import { CustomPartsEditor } from "./custom-parts-editor";
import { DesignAr } from "./design-ar";

const Viewport = lazy(() => import("./viewport"));
const STORAGE_KEY = "oshinest.design.v1";
const message = (e: unknown) => e instanceof Error ? e.message : "操作を完了できませんでした。";

function download(bytes: Uint8Array | string, filename: string, type: string) {
  const blob = new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], { type });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function HouseEditor() {
  const [store] = useState(() => createDesignStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const d = state.design;
  const [built, setBuilt] = useState<{ revision: number; design: Design; build: DesignBuild } | null>(null);
  const [error, setError] = useState<{ revision: number; text: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [operationError, setOperationError] = useState("");
  const [attempt, setAttempt] = useState(0), [selected, setSelected] = useState("back"), [view, setView] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [ar, setAr] = useState<{ revision: number; glb: string; usdz: string } | null>(null);
  const client = useRef<ReturnType<typeof createWorkerClient> | null>(null);
  const mounted = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    try { client.current = createWorkerClient(); }
    catch (e) { Promise.resolve().then(() => { if (mounted.current) setError({ revision: store.getSnapshot().revision, text: message(e) }); }); }
    return () => { mounted.current = false; client.current?.dispose(); client.current = null; };
  }, [attempt, store]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      client.current?.request(d).then((response) => {
        if (active && response.kind === "build") { setBuilt({ revision: state.revision, design: d, build: response.build }); setError(null); }
      }).catch((e) => { if (active && !(e instanceof Superseded)) setError({ revision: state.revision, text: message(e) }); });
    }, 80);
    return () => { active = false; clearTimeout(timer); };
  }, [d, state.revision, attempt]);
  useEffect(() => () => { if (ar) { URL.revokeObjectURL(ar.glb); URL.revokeObjectURL(ar.usdz); } }, [ar]);

  const pending = built?.revision !== state.revision;
  const activeError = error?.revision === state.revision ? error.text : "";
  const update = (value: Design) => {
    try { store.replace(value); setOperationError(""); setNotice("変更しました。残しておく場合は保存してください。"); return true; }
    catch (e) { setOperationError(message(e)); return false; }
  };
  const house = <K extends keyof Design["house"]>(key: K, value: Design["house"][K]) => update({ ...d, house: { ...d.house, [key]: value } });
  const shelf = <K extends keyof Design["shelf"]>(key: K, value: Design["shelf"][K]) => update({ ...d, shelf: { ...d.shelf, [key]: value } });

  async function applyChat(proposal: Proposal, revision: number, signal: AbortSignal) {
    const assertCurrent = () => {
      signal.throwIfAborted();
      if (!mounted.current || store.getSnapshot().revision !== revision)
        throw new Error("AIの応答中に設計が変わりました。現在の設計からもう一度送信してください。");
    };
    assertCurrent();
    const { design } = applyProposal(store.getSnapshot().design, proposal);
    if (!proposal.changes.length) return;
    if (!client.current) throw new Error("制作エンジンの準備ができていません。再試行してください。");
    const result = await client.current.request(design);
    assertCurrent();
    if (result.kind !== "build" || result.build.issues.some((issue) => issue.level === "error"))
      throw new Error("形状の検査に通らなかったため変更していません。寸法を調整して再送してください。");
    store.replace(design);
    setOperationError("");
    setNotice("AIの変更を反映しました。取り消しで元に戻せます。残す場合は保存してください。");
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    // Do not let a slow file read replace edits made after the user selected it.
    const revision = store.getSnapshot().revision;
    try {
      if (file.size > DESIGN_FILE_LIMIT) throw new Error("設計ファイルは128KiBまでです。");
      const imported = readDesign(await file.text());
      if (!mounted.current) return;
      if (store.getSnapshot().revision !== revision) throw new Error("読み込み中に編集されました。ファイルをもう一度開いてください。");
      store.replace(imported); setNotice("設計ファイルを開きました。取り消しで元の設計に戻せます。"); setOperationError("");
    } catch (e) { if (mounted.current) setOperationError(message(e)); }
    finally { if (importInput.current) importInput.current.value = ""; }
  }

  async function exportFile(format: ExportFormat | "ar") {
    if (!client.current || exporting) return;
    const snapshot = store.getSnapshot();
    setExporting(true); setOperationError("");
    try {
      if (format === "ar") {
        const glb = await client.current.request(snapshot.design, "glb");
        const usdz = await client.current.request(snapshot.design, "usdz");
        if (!mounted.current || glb.kind !== "export" || usdz.kind !== "export") return;
        if (store.getSnapshot().revision !== snapshot.revision) throw new Error("設計が変わりました。もう一度ARを開いてください。");
        setAr({ revision: snapshot.revision,
          glb: URL.createObjectURL(new Blob([new Uint8Array(glb.bytes)], { type: "model/gltf-binary" })),
          usdz: URL.createObjectURL(new Blob([new Uint8Array(usdz.bytes)], { type: "model/vnd.usdz+zip" })),
        });
      } else {
        const result = await client.current.request(snapshot.design, format);
        if (mounted.current && result.kind === "export") {
          download(result.bytes, `oshinest-${format === "3mf" ? "parts.zip" : `house.${format}`}`, format === "3mf" ? "application/zip" : format === "glb" ? "model/gltf-binary" : "model/vnd.usdz+zip");
          setNotice("書き出しました。出力ボタンを押した時点の設計です。");
        }
      }
    } catch (e) { if (mounted.current && !(e instanceof Superseded)) setOperationError(message(e)); }
    finally { if (mounted.current) setExporting(false); }
  }

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-center gap-2 border-y border-line py-3" aria-label="設計の保存と履歴">
      <Button variant="outline" size="sm" disabled={!state.past.length} onClick={() => store.undo()}>取り消し</Button>
      <Button variant="outline" size="sm" disabled={!state.future.length} onClick={() => store.redo()}>やり直し</Button>
      <Button size="sm" aria-label="この端末に保存" onClick={() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); setNotice("この端末に保存しました。"); setOperationError(""); } catch { setOperationError("この端末に保存できません。設計ファイルを保存してください。"); } }}>保存</Button>
      <details className="basis-full sm:basis-auto sm:pl-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">設計を開く・ファイルに保存</summary>
      <div className="flex flex-wrap gap-2 py-2">
      <Button variant="outline" size="sm" onClick={() => {
        try { const text = localStorage.getItem(STORAGE_KEY); if (!text) throw new Error("この端末には保存した設計がありません。"); store.replace(readDesign(text)); setNotice("保存した設計を開きました。取り消しで元に戻せます。"); setOperationError(""); }
        catch (e) { setOperationError(message(e)); }
      }}>保存した設計を開く</Button>
      <Button variant="outline" size="sm" onClick={() => download(JSON.stringify(d, null, 2), "house.oshinest.json", "application/json")}>設計ファイルを保存</Button>
      <Button variant="outline" size="sm" onClick={() => importInput.current?.click()}>設計ファイルを開く</Button>
      <input ref={importInput} type="file" accept=".json" aria-label="設計ファイル" className="sr-only" onChange={(e) => void openFile(e.target.files?.[0])} />
      </div></details>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{notice || "保存はこの端末だけです。設計ファイルを保存すると、別の端末でも編集できます。"}</p>
    {operationError && <p role="alert" className="border-l-2 border-danger pl-3 text-sm text-danger">{operationError}</p>}

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="プレビューと出力" className="min-w-0 lg:sticky lg:top-4">
        <div className="border border-line" aria-busy={pending && !activeError}>
          <div className="flex items-center justify-between gap-3 border-b border-line p-3">
            <h2 className="text-balance font-semibold">組み立てたおうち</h2>
            <Button size="sm" variant="outline" onClick={() => setView((n) => n + 1)}>視点を戻す</Button>
          </div>
          {built ? <Suspense fallback={<div className="flex h-80 items-center justify-center bg-ground sm:h-96 lg:h-[480px]">3D表示を準備しています…</div>}>
            <Viewport build={built.build} design={built.design} selected={selected} view={view} onSelect={setSelected} />
          </Suspense> : <div className="flex h-80 items-center justify-center bg-ground px-4 text-center text-muted-foreground sm:h-96 lg:h-[480px]">制作エンジンを準備しています…</div>}
          <div className="border-t border-line p-3">
            <p role="status" data-testid="design-status" className="text-sm">{activeError ? "形状の生成が停止しました" : pending ? "形状を更新しています…" : "プレビューを更新しました"}</p>
            <p className="mt-1 text-sm text-muted-foreground">ドラッグで回転・ピンチで拡大。部品は画面か下の一覧で選べます。</p>
            {activeError && <div role="alert" className="mt-3"><p className="text-sm text-danger">{activeError}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>再試行</Button></div>}
          </div>
        </div>
        {built && <div className="mt-3 flex flex-wrap gap-2" aria-label="部品一覧">{built.build.parts.map((p) => <Button key={p.id} size="sm" variant="outline" aria-pressed={selected === p.id} onClick={() => setSelected(p.id)} className={cn(selected === p.id && "border-brand font-bold text-brand")}>{p.label}</Button>)}</div>}
        <div className="mt-5 border-t border-line pt-4">
          <h2 className="text-balance font-semibold">寸法と造形の確認</h2>
          <p className="mt-2 text-sm text-muted-foreground">板厚・ぬいの寸法・部品の造形範囲を確認します。接着して組み立てる試作です。強度・造形成功・ぬいへの適合は試し刷りで確認してください。</p>
          {!pending && built && (built.build.issues.length ? <ul className="mt-3 space-y-2">{built.build.issues.map((i) => <li key={i.code} className={cn("border-l-2 pl-3 text-sm", i.level === "error" ? "border-danger text-danger" : "border-warn text-ink")}>{i.level === "error" ? "要修正：" : "確認："}{i.message}</li>)}</ul> : <p className="mt-3 text-sm">自動検査の対象項目に問題はありません。試し刷りは未実施です。</p>)}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={pending || exporting || !!activeError || built?.build.issues.some((i) => i.level === "error")} onClick={() => void exportFile("3mf")}>印刷用3MFを保存</Button>
          <Button variant="outline" disabled={pending || exporting || !!activeError} onClick={() => void exportFile("ar")}>ARで確認</Button>
          <Button variant="outline" disabled={pending || exporting || !!activeError} onClick={() => void exportFile("glb")}>GLBを保存</Button>
        </div>
        {exporting && <p role="status" className="mt-2 text-sm">書き出しています…</p>}
        <p className="mt-3 text-sm text-muted-foreground">3MFは部品ごとに分かれたZIPです。スライサーで個別に開き、材料・印刷条件を設定してください。自動注文や出品は行いません。</p>
        {ar && ar.revision === state.revision && <div className="mt-4"><Button variant="outline" size="sm" onClick={() => setAr(null)}>ARを閉じる</Button><DesignAr glb={ar.glb} usdz={ar.usdz} /></div>}
      </section>

      <section aria-label="おうちの編集" className="min-w-0 space-y-5">
        <DesignChat snapshot={store.getSnapshot} selected={selected as ChatRequest["selected"]} apply={applyChat} />
        <label className="flex flex-col gap-2 text-sm font-semibold">設計の名前<Input key={d.name} defaultValue={d.name} maxLength={80} onBlur={(e) => { if (!update({ ...d, name: e.target.value })) e.currentTarget.value = d.name; }} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">制作対象
          <select aria-label="制作対象" className="min-h-11 border border-line bg-white px-3" value={d.scene} onChange={(e) => update({ ...d, scene: e.target.value as Design["scene"] })}>
            <option value="house">おうちと家具</option><option value="object">単体の家具・装備</option>
          </select>
        </label>
        {d.scene === "object" && <p className="text-sm text-muted-foreground">床・壁・屋根を外して、部品だけを制作・保存します。おうちの設定は保持されます。</p>}
        {d.scene === "house" && <>
        <fieldset className="border-t border-line pt-3"><legend className="text-balance pr-3 font-semibold">おうちの寸法</legend>
          <p className="mb-3 text-sm text-muted-foreground">幅・奥行きは外寸。壁の高さは床の上から測ります。入力後、欄の外を押すと反映されます。</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="幅" value={d.house.width} min={80} max={400} onChange={(n) => house("width", n)} />
            <NumberField label="奥行き" value={d.house.depth} min={80} max={400} onChange={(n) => house("depth", n)} />
            <NumberField label="壁の高さ" value={d.house.height} min={80} max={350} onChange={(n) => house("height", n)} />
            <NumberField label="板厚" value={d.house.thickness} min={1} max={8} onChange={(n) => house("thickness", n)} />
          </div>
        </fieldset>
        <fieldset className="border-t border-line pt-3"><legend className="text-balance pr-3 font-semibold">部品と色</legend>
          <div className="grid grid-cols-2 gap-x-3"><Toggle label="左の壁" checked={d.house.leftWall} onChange={(v) => house("leftWall", v)} /><Toggle label="右の壁" checked={d.house.rightWall} onChange={(v) => house("rightWall", v)} /></div>
          <Toggle label="屋根をつける" checked={d.house.roof} onChange={(v) => house("roof", v)} />
          {d.house.roof && <><NumberField label="屋根の立ち上がり" value={d.house.roofRise} min={0} max={100} onChange={(n) => house("roofRise", n)} /><p className="mt-1 text-sm text-muted-foreground">0mmで平らな屋根になります。切妻屋根の前後は開いています。</p></>}
          <div className="mt-3 space-y-1"><ColorField label="壁の色" value={d.house.wallColor} onChange={(v) => house("wallColor", v)} /><ColorField label="床の色" value={d.house.floorColor} onChange={(v) => house("floorColor", v)} /><ColorField label="屋根の色" value={d.house.roofColor} onChange={(v) => house("roofColor", v)} /></div>
        </fieldset>
        <fieldset className="border-t border-line pt-3"><legend className="text-balance pr-3 font-semibold">窓</legend>
          <Toggle label="奥の壁に窓をつける" checked={d.window.enabled} onChange={(v) => update({ ...d, window: { ...d.window, enabled: v } })} />
          {d.window.enabled && <label className="mb-3 flex flex-col gap-1 text-sm font-medium">窓の形
            <select aria-label="窓の形" className="min-h-11 border border-line bg-white px-3" value={d.window.shape} onChange={(e) => update({ ...d, window: { ...d.window, shape: e.target.value as Design["window"]["shape"] } })}>
              <option value="rectangle">四角</option><option value="ellipse">丸・楕円（幅と高さが同じなら真円）</option>
            </select>
          </label>}
          {d.window.enabled && <div className="grid grid-cols-2 gap-3"><NumberField label="窓の幅" value={d.window.width} min={10} max={200} onChange={(v) => update({ ...d, window: { ...d.window, width: v } })} /><NumberField label="窓の高さ" value={d.window.height} min={10} max={200} onChange={(v) => update({ ...d, window: { ...d.window, height: v } })} /></div>}
        </fieldset>
        </>}
        <fieldset className="border-t border-line pt-3"><legend className="text-balance pr-3 font-semibold">棚</legend>
          <Toggle label="棚を置く" checked={d.shelf.enabled} onChange={(v) => shelf("enabled", v)} />
          {d.shelf.enabled && <><div className="grid grid-cols-2 gap-3">
            <NumberField label="棚の幅" value={d.shelf.width} min={20} max={200} onChange={(n) => shelf("width", n)} />
            <NumberField label="棚の奥行き" value={d.shelf.depth} min={15} max={150} onChange={(n) => shelf("depth", n)} />
            <NumberField label="棚の高さ" value={d.shelf.height} min={20} max={200} onChange={(n) => shelf("height", n)} />
            <NumberField label="左端からの位置" value={d.shelf.x} min={0} max={350} onChange={(n) => shelf("x", n)} />
            <NumberField label="手前からの位置" value={d.shelf.y} min={0} max={350} onChange={(n) => shelf("y", n)} />
          </div><ColorField label="棚の色" value={d.shelf.color} onChange={(v) => shelf("color", v)} /></>}
        </fieldset>
        <FurnitureEditor design={d} update={update} />
        <CustomPartsEditor design={d} update={update} />
        <details className="border-t border-line pt-2"><summary className="min-h-11 cursor-pointer py-3 font-semibold">ぬい・プリンタの寸法</summary>
          <p className="mb-3 text-sm text-muted-foreground">初期値は15cmぬいの目安です。腕・足を含め、飾る姿勢で測ってください。</p>
          <div className="grid grid-cols-2 gap-3">{(["width", "depth", "height"] as const).map((key, i) => <NumberField key={key} label={`ぬいの${["幅", "奥行き", "高さ"][i]}`} value={d.nui[key]} min={10} max={300} onChange={(n) => update({ ...d, nui: { ...d.nui, [key]: n } })} />)}</div>
          <p className="my-3 text-sm text-muted-foreground">プリンタの造形可能寸法。初期値256mmは仮の値です。</p>
          <div className="grid grid-cols-2 gap-3">{(["width", "depth", "height"] as const).map((key, i) => <NumberField key={key} label={`造形範囲の${["幅", "奥行き", "高さ"][i]}`} value={d.bed[key]} min={80} max={500} onChange={(n) => update({ ...d, bed: { ...d.bed, [key]: n } })} />)}</div>
        </details>
      </section>
    </div>
  </div>;
}
