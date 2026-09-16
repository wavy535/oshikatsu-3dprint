import { networkInterfaces } from "node:os";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { AR_ANCHOR, AR_BLEND, AR_CALIBRATION, AR_DEV_PAGE, AR_LIMITS, AR_ROOM } from "@/lib/ar/config";
import { lanIPv4Addresses, phoneReachableOrigin } from "@/lib/ar/origin";
import {
  listLocalModelFolders,
  localModelRoot,
  readLocalModel,
  type LocalModel,
} from "@/lib/ar/local-models";
import { meshSizeMm } from "@/lib/ar/mesh";
import {
  LOCAL_MODEL_EXCLUDE_PARAM,
  calibrationModelPath,
  localModelPath,
  parseNuiQuery,
  quickLookUrl,
  roomModelPath,
} from "@/lib/ar/params";
import { modelRevision } from "@/lib/ar/revision";
import { ROOM_LAYOUTS, nuiGuideSizeMm, roomInteriorMm, roomOuterMm, type RoomLayout } from "@/lib/ar/room";
import {
  buildWorkMeshes,
  readBlendModel,
  readModelObjects,
  workModelExtension,
} from "@/lib/ar/work-model";
import type { BlendReport } from "@/lib/print/blend";
import { AnalysisBudget } from "@/lib/print/limits";
import type { NamedMesh } from "@/lib/print/mesh";
import { Button } from "@/components/ui/button";

export const metadata = { title: "AR 実寸テスト（開発用）" };

const LAYOUT_LABEL: Record<RoomLayout, string> = {
  "three-walls": "3面（奥・左・右）",
  "back-left": "2面（奥・左）",
};

const BYTES_PER_MB = 1024 * 1024;

type Query = {
  height?: string;
  sit?: string;
  shoulder?: string;
  hug?: string;
  layout?: string;
  model?: string;
  exclude?: string | string[];
};

// 仮の部屋のフォームの項目。手元のファイルを選び直しても、入力した寸法は残す
const ROOM_QUERY_KEYS = ["height", "sit", "shoulder", "hug", "layout"] as const;

const field = "w-28 rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink";

const qrCodeOf = (url: string) =>
  QRCode.toDataURL(url, { width: AR_DEV_PAGE.qrCodeWidthPx, margin: AR_DEV_PAGE.qrCodeMargin });

const decimal = (value: number) => value.toFixed(AR_DEV_PAGE.displayDecimals);

function QrImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={AR_DEV_PAGE.qrCodeWidthPx}
      height={AR_DEV_PAGE.qrCodeWidthPx}
      className="self-start rounded-md border border-line"
    />
  );
}

// 入力した部屋の寸法を [名前, 値] の組で返す（フォームの hidden やリンクで引き継ぐ）
const roomQueryEntries = (query: Query) =>
  ROOM_QUERY_KEYS.flatMap((key) => (query[key] ? [[key, query[key]] as [string, string]] : []));

// 手元のファイルを選ぶリンク。部屋の寸法は残し、前のファイルで外したオブジェクトは引き継がない
const modelHref = (query: Query, name: string) => `?${new URLSearchParams([...roomQueryEntries(query), ["model", name]])}`;

function HiddenInputs({ entries }: { entries: [string, string][] }) {
  return entries.map(([name, value]) => <input key={`${name}=${value}`} type="hidden" name={name} value={value} />);
}

type LocalModelPreview =
  | {
      ok: true;
      sizeMm: ReturnType<typeof meshSizeMm>;
      sourceTriangles: number;
      outputTriangles: number;
      blend: BlendReport | null;
    }
  | { ok: false; message: string };

// 選んだファイルを API と同じ処理で変換してみて、AR での大きさと面の数（.blend なら読み取りの報告も）を出す
async function previewLocalModel(model: LocalModel, excludeObjects: string[]): Promise<LocalModelPreview> {
  const buffer = await readLocalModel(model.name);
  if (!buffer) return { ok: false, message: "ファイルを読めませんでした" };
  const budget = new AnalysisBudget();
  try {
    let objects: NamedMesh[];
    let blend: BlendReport | null = null;
    if (workModelExtension(model.name) === "blend") {
      const read = readBlendModel(buffer, budget, { excludeObjects });
      objects = read.objects;
      blend = read.report;
    } else {
      objects = readModelObjects(buffer, model.name, budget);
    }
    const { meshes, sourceTriangles, outputTriangles } = buildWorkMeshes(
      objects,
      AR_DEV_PAGE.localModelScale,
      budget,
      AR_ANCHOR.room,
    );
    return { ok: true, sizeMm: meshSizeMm(meshes), sourceTriangles, outputTriangles, blend };
  } catch (error) {
    // 開発用のページなので、変換できない理由をそのまま表示する
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

// 「Bevel（Cube、立方体）」のように、モディファイアの種類ごとにオブジェクトの名前をまとめる
function modifierSummary(notes: BlendReport["modifierNotes"]) {
  const byModifier = new Map<string, string[]>();
  for (const note of notes) byModifier.set(note.modifier, [...(byModifier.get(note.modifier) ?? []), note.object]);
  return [...byModifier].map(([modifier, objects]) => `${modifier}（${objects.join("、")}）`).join(" / ");
}

/**
 * .blend の読み取りの報告。ふだんは表示中の数と注意だけを出し、外すオブジェクトは「細かい設定」を開いたときに選ぶ。
 */
function BlendSummary({ report, carry }: { report: BlendReport; carry: [string, string][] }) {
  const excluded = report.objects.filter((object) => object.excluded).length;
  const unsupported = report.modifierNotes.filter((note) => note.note === "unsupported");
  const limited = report.modifierNotes.filter((note) => note.note === "levels_limited");
  return (
    <div className="flex flex-col gap-1.5 text-[11.5px] leading-5 text-muted-foreground">
      <p>
        レンダリングに出るメッシュ <span className="num">{report.objects.length - excluded}</span> 個を、組み立てた配置のまま表示しています（1 Blender 単位 ={" "}
        <span className="num">{AR_BLEND.mmPerUnit}</span> mm）。
        {excluded > 0 && <> 外したもの <span className="num">{excluded}</span> 個。</>}
        {report.hiddenObjects > 0 && <> レンダリングで非表示の <span className="num">{report.hiddenObjects}</span> 個は表示しません。</>}
      </p>
      {unsupported.length > 0 && <p>再現していないモディファイア：{modifierSummary(unsupported)}（その部分は適用前の形です）</p>}
      {limited.length > 0 && (
        <p>
          Subdivision Surface の分割を <span className="num">{AR_BLEND.maxSubdivisionLevels}</span> 回に抑えたもの：
          {limited.map((note) => note.object).join("、")}
        </p>
      )}
      <details open={excluded > 0} className="rounded-lg border border-line px-3 py-2">
        <summary className="cursor-pointer font-semibold text-ink">細かい設定：表示から外すオブジェクトを選ぶ</summary>
        <form method="get" className="mt-2 flex flex-col gap-2">
          <HiddenInputs entries={carry} />
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {report.objects.map((object) => (
              <label key={object.name} className="flex items-center gap-1.5 text-[12px] text-ink">
                <input
                  type="checkbox"
                  name={LOCAL_MODEL_EXCLUDE_PARAM}
                  value={object.name}
                  defaultChecked={object.excluded}
                />
                {object.name}
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" className="self-start">
            外して表示し直す
          </Button>
        </form>
      </details>
    </div>
  );
}

/**
 * AR で置く前の案内。置く場所はアプリでは決めておらず、床（水平面）に置いたあとは利用者が動かして合わせる。
 * このページのモデル（仮の部屋・手元のファイル）は、基準点が奥の左下の角。
 */
function PlacementGuide() {
  return (
    <div className="flex flex-col gap-1 text-[11.5px] leading-5 text-muted-foreground">
      <p className="font-semibold text-ink">AR での置き方</p>
      <ol className="list-decimal space-y-0.5 pl-4">
        <li>iPhone を床にゆっくり向け、床が認識されてから置きます（机の上など、水平な面なら置けます）。</li>
        <li>置いたあとは、1本指で動かし、2本指で回して向きを変えられます。大きさは変わりません（実寸固定）。</li>
        <li>
          基準点は奥の左下の角（床の下面）です。部屋のデータなら、実際の部屋の角に合わせ、開いている面を自分のほうに向けると中が見えます。壁には自動で沿わないので、置いてから回して寄せてください。
        </li>
      </ol>
    </div>
  );
}

/**
 * 開発用：仮の部屋・校正用の A4 の板・手元の3Dデータを、iPhone の Quick Look で実寸表示して確かめるページ。本番では 404。
 * QR コードを iPhone のカメラで読むと AR が起動する。DB とログインは使わない。
 */
export default async function ArRoomTestPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const layout = ROOM_LAYOUTS.find((candidate) => candidate === query.layout) ?? ROOM_LAYOUTS[0];
  const submitted = Boolean(query.height);
  const input = new URLSearchParams();
  for (const key of ["height", "sit", "shoulder", "hug"] as const) {
    if (query[key]) input.set(key, query[key]);
  }
  const nui = parseNuiQuery(input);

  const requestHeaders = await headers();
  const phone = phoneReachableOrigin({
    host: requestHeaders.get("host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    lanAddresses: lanIPv4Addresses(networkInterfaces()),
  });
  const revision = modelRevision();

  const localRoot = localModelRoot();
  const localFolders = await listLocalModelFolders(localRoot);
  const localModels = localFolders?.flatMap((folder) => folder.models) ?? null;
  const selectedModel = localModels?.find((model) => model.name === query.model) ?? null;
  const excludeObjects = [query.exclude ?? []].flat().filter((name) => name !== "");
  const modelPreview = selectedModel ? await previewLocalModel(selectedModel, excludeObjects) : null;

  const roomUrl = nui && phone ? quickLookUrl(phone.origin, roomModelPath(layout, nui, revision, "usdz")) : null;
  const calibrationUrl = phone
    ? quickLookUrl(phone.origin, calibrationModelPath("a4-plate", revision, "usdz"))
    : null;
  const modelUrl =
    selectedModel && modelPreview?.ok && phone
      ? quickLookUrl(
          phone.origin,
          localModelPath(selectedModel.name, selectedModel.version, revision, "usdz", excludeObjects),
        )
      : null;
  const [roomQrCode, calibrationQrCode, modelQrCode] = await Promise.all([
    roomUrl ? qrCodeOf(roomUrl) : null,
    calibrationUrl ? qrCodeOf(calibrationUrl) : null,
    modelUrl ? qrCodeOf(modelUrl) : null,
  ]);
  const interior = nui ? roomInteriorMm(nui) : null;
  const guide = nui ? nuiGuideSizeMm(nui) : null;
  const outer = nui ? roomOuterMm(nui, layout) : null;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-ink">AR 実寸テスト（開発用）</h1>
        <p className="text-[12.5px] text-muted-foreground">
          ぬいの寸法から作る仮の部屋と、手元の3Dデータ（3MF / STL / Blender の .blend）を、iPhone の Quick Look で実寸表示します。校正用の A4 の板で、AR の縮尺そのものも確かめられます。
        </p>
        <p className="text-[11px] text-muted-foreground">
          モデルの版（rev）：<span className="num">{revision}</span>（設定を変えると変わり、iPhone に残った古いモデルは使われません）
        </p>
      </div>

      {!phone && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
          スマホから届くアドレスが分からないため、QR コードを作れません。Mac が Wi-Fi などのネットワークにつながっているか確認してください。
        </p>
      )}
      {phone?.replacedLoopback && (
        <p className="text-[11.5px] text-muted-foreground">
          localhost で開いているため、QR コードには <span className="num">{phone.origin}</span>{" "}
          を入れています。iPhone と Mac を同じ Wi-Fi につないでください。
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold text-ink">校正用：A4 の板</h2>
        <div className="flex flex-col gap-4 sm:flex-row">
          {calibrationQrCode && (
            <QrImage src={calibrationQrCode} alt="iPhone のカメラで読み取ると A4 の板の AR が起動します" />
          )}
          <div className="flex min-w-0 flex-col gap-2 text-[12.5px] leading-5 text-ink">
            <p>
              <span className="num">{AR_CALIBRATION.a4LongMm}</span> ×{" "}
              <span className="num">{AR_CALIBRATION.a4ShortMm}</span> mm（厚さ{" "}
              <span className="num">{AR_CALIBRATION.plateThicknessMm}</span> mm）の半透明の青い板です。
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>本物の A4 用紙を机に置きます。</li>
              <li>QR コードを読んで AR を起動し、板を指で動かし・回して用紙に重ねます。</li>
              <li>真上から見て、四隅が用紙の四隅と重なるかを確かめます。ずれていれば、はみ出した（足りない）長さを長辺・短辺それぞれ定規で測って記録します。</li>
            </ol>
            {calibrationUrl && (
              <p className="text-[11.5px] break-all text-muted-foreground">
                iPhone でこのページを開いている場合は{" "}
                <a href={calibrationUrl} className="font-semibold text-brand hover:underline">
                  ここをタップ
                </a>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold text-ink">作品の3Dデータ（手元のファイル）</h2>
        <p className="text-[12px] leading-5 text-muted-foreground">
          <span className="num break-all">{localRoot}</span>{" "}
          の中のフォルダ（test_3mf・roomfile など）にある 3MF / STL / .blend を、そのままの大きさで表示します。Bambu Studio の .gcode.3mf も読めます。3MF / STL はプレートに置いた（印刷する）向きのまま、.blend は組み立てた配置のままで、色は反映しません。
        </p>
        {localFolders === null && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
            置き場所が見つかりません。上の場所の中にフォルダを作り、3MF / STL / .blend を置いてください。
          </p>
        )}
        {localFolders?.length === 0 && (
          <p className="text-[12.5px] text-muted-foreground">
            フォルダがありません。上の場所の中にフォルダを作り、3MF / STL / .blend を置いてください。
          </p>
        )}
        {localFolders?.map((folder) => (
          <div key={folder.folder} className="flex flex-col gap-1">
            <p className="text-[12px] font-semibold text-ink">
              {folder.folder}/
              {folder.linkedTo && (
                <span className="ml-1.5 font-normal break-all text-muted-foreground">
                  （リンク先：<span className="num">{folder.linkedTo}</span>）
                </span>
              )}
            </p>
            {folder.models.length === 0 && folder.unsupported.length === 0 && (
              <p className="text-[12px] text-muted-foreground">ファイルがありません。</p>
            )}
            {folder.models.length > 0 && (
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {folder.models.map((model) => (
                  <li key={model.name} className="flex flex-wrap items-baseline gap-x-2">
                    {model.name === selectedModel?.name ? (
                      <span className="font-semibold text-ink">▶ {model.name}</span>
                    ) : (
                      <a href={modelHref(query, model.name)} className="font-semibold text-brand hover:underline">
                        {model.name}
                      </a>
                    )}
                    <span className="num text-[11.5px] text-muted-foreground">
                      {decimal(model.bytes / BYTES_PER_MB)} MB
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {folder.unsupported.length > 0 && (
              <p className="text-[11.5px] break-all text-muted-foreground">
                読めない形式：{folder.unsupported.join("、")}（3MF・STL・.blend 以外のファイルです）
              </p>
            )}
          </div>
        ))}
        {query.model && localModels && !selectedModel && (
          <p className="text-[12.5px] text-danger">選んだファイル（{query.model}）が見つかりません。</p>
        )}
        {selectedModel && modelPreview && (
          <div className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row">
            {modelQrCode && <QrImage src={modelQrCode} alt="iPhone のカメラで読み取ると作品の AR が起動します" />}
            <div className="flex min-w-0 flex-col gap-2 text-[12.5px] text-ink">
              <p className="font-semibold break-all">{selectedModel.name}</p>
              {modelPreview.ok ? (
                <>
                  <table className="text-[12px]">
                    <tbody>
                      <tr>
                        <td className="pr-3 text-muted-foreground">AR での大きさ</td>
                        <td className="num">
                          幅 {decimal(modelPreview.sizeMm.widthMm)} × 奥行 {decimal(modelPreview.sizeMm.depthMm)} × 高さ{" "}
                          {decimal(modelPreview.sizeMm.heightMm)} mm
                        </td>
                      </tr>
                      <tr>
                        <td className="pr-3 text-muted-foreground">面の数</td>
                        <td className="num">
                          {modelPreview.outputTriangles < modelPreview.sourceTriangles
                            ? `${modelPreview.sourceTriangles.toLocaleString("ja-JP")} → ${modelPreview.outputTriangles.toLocaleString("ja-JP")}（AR 用に間引き）`
                            : `${modelPreview.sourceTriangles.toLocaleString("ja-JP")}（間引きなし）`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[11.5px] text-muted-foreground">
                    {modelPreview.outputTriangles < modelPreview.sourceTriangles &&
                      "間引きで細部はつぶれますが、外形の大きさはほぼ保たれます。"}
                    定規を当てて、上の大きさと比べてください。
                  </p>
                  {modelPreview.blend && (
                    <BlendSummary
                      report={modelPreview.blend}
                      carry={[["model", selectedModel.name], ...roomQueryEntries(query)]}
                    />
                  )}
                  <PlacementGuide />
                  {modelUrl && (
                    <p className="text-[11.5px] break-all text-muted-foreground">
                      iPhone でこのページを開いている場合は{" "}
                      <a href={modelUrl} className="font-semibold text-brand hover:underline">
                        ここをタップ
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-lg bg-danger-bg px-3 py-2 text-danger">
                  AR 用に変換できませんでした：{modelPreview.message}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <form method="get" className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold text-ink">仮の部屋</h2>
        <HiddenInputs
          entries={[
            ...(query.model ? [["model", query.model] as [string, string]] : []),
            ...excludeObjects.map((name) => [LOCAL_MODEL_EXCLUDE_PARAM, name] as [string, string]),
          ]}
        />
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink">
            身長（mm）
            <input name="height" type="number" step="0.1" required defaultValue={query.height} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink">
            座高（mm）
            <input name="sit" type="number" step="0.1" defaultValue={query.sit} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink">
            肩幅（mm）
            <input name="shoulder" type="number" step="0.1" defaultValue={query.shoulder} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink">
            抱き幅（mm）
            <input name="hug" type="number" step="0.1" defaultValue={query.hug} className={field} />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-4 text-[12.5px] text-ink">
          <legend className="mb-1 text-[12px] font-semibold">部屋の形</legend>
          {ROOM_LAYOUTS.map((candidate) => (
            <label key={candidate} className="flex items-center gap-1.5">
              <input type="radio" name="layout" value={candidate} defaultChecked={candidate === layout} />
              {LAYOUT_LABEL[candidate]}
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-muted-foreground">
          単位は mm です（15cm なら 150）。身長は必須で、座高・肩幅・抱き幅は測れた場合だけ入力します（両方あれば抱き幅を使います）。
          <span className="num">{AR_LIMITS.nuiDimensionMinMm}</span>〜
          <span className="num">{AR_LIMITS.nuiDimensionMaxMm}</span>mm の範囲で入力してください。
        </p>
        <Button type="submit" className="self-start">
          QR コードを作る
        </Button>
      </form>

      {submitted && !nui && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
          寸法を確認してください（身長が必要で、入力した値はすべて範囲内にしてください）。
        </p>
      )}

      {nui && interior && guide && outer && (
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row">
          {roomQrCode && <QrImage src={roomQrCode} alt="iPhone のカメラで読み取ると仮の部屋の AR が起動します" />}
          <div className="flex min-w-0 flex-col gap-2 text-[12.5px] text-ink">
            <p className="font-semibold">{LAYOUT_LABEL[layout]}</p>
            <table className="text-[12px]">
              <tbody>
                {(
                  [
                    ["部屋の外寸", outer],
                    ["部屋の内寸", interior],
                    ["ピンクの箱", guide],
                  ] as const
                ).map(([label, size]) => (
                  <tr key={label}>
                    <td className="pr-3 text-muted-foreground">{label}</td>
                    <td className="num">
                      幅 {decimal(size.widthMm)} × 奥行 {decimal(size.depthMm)} × 高さ {decimal(size.heightMm)} mm
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PlacementGuide />
            {roomUrl && (
              <p className="text-[11.5px] break-all text-muted-foreground">
                iPhone でこのページを開いている場合は{" "}
                <a href={roomUrl} className="font-semibold text-brand hover:underline">
                  ここをタップ
                </a>
                。URL：<span className="num">{roomUrl}</span>
              </p>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold text-ink">仮の部屋の測り方（遠近の影響を避ける）</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-5 text-ink">
          <li>QR コードを読み、Quick Look で「AR」を選んで机に置きます。ピンチしても大きさが変わらないことを確かめます。</li>
          <li>定規は、測る辺に触れる位置に置きます（離れた辺を読むと、遠いほど小さく映ります）。</li>
          <li>幅：床の手前の辺に沿って定規を置き、真上から読みます。</li>
          <li>奥行：床の左の辺に沿って定規を置き、真上から読みます。</li>
          <li>高さ：左の壁の手前側の縦の辺に定規を立て、真横から読みます（壁の上端までは外寸の高さから天井の厚み {AR_ROOM.ceilingThicknessMm}mm を引いた値）。</li>
          <li>本物のぬいを部屋の横に置き、ピンクの箱（座らせたぬいの大きさの目安）と見比べます。</li>
        </ol>
      </section>
    </main>
  );
}
