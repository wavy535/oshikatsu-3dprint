import { networkInterfaces } from "node:os";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { AR_CALIBRATION, AR_DEV_PAGE, AR_LIMITS, AR_ROOM } from "@/lib/ar/config";
import { lanIPv4Addresses, phoneReachableOrigin } from "@/lib/ar/dev";
import { calibrationModelPath, parseNuiQuery, quickLookUrl, roomModelPath } from "@/lib/ar/params";
import { modelRevision } from "@/lib/ar/revision";
import { ROOM_LAYOUTS, nuiGuideSizeMm, roomInteriorMm, roomOuterMm, type RoomLayout } from "@/lib/ar/room";
import { Button } from "@/components/ui/button";

export const metadata = { title: "AR 実寸テスト（開発用）" };

const LAYOUT_LABEL: Record<RoomLayout, string> = {
  "three-walls": "3面（奥・左・右）",
  "back-left": "2面（奥・左）",
};

type Query = { sit?: string; shoulder?: string; hug?: string; layout?: string };

const field = "w-28 rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink";

const qrCodeOf = (url: string) =>
  QRCode.toDataURL(url, { width: AR_DEV_PAGE.qrCodeWidthPx, margin: AR_DEV_PAGE.qrCodeMargin });

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

/**
 * 開発用：仮の部屋と校正用の A4 の板を、iPhone の Quick Look で実寸表示して確かめるページ。本番では 404。
 * QR コードを iPhone のカメラで読むと AR が起動する。DB とログインは使わない。
 */
export default async function ArRoomTestPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const layout = ROOM_LAYOUTS.find((candidate) => candidate === query.layout) ?? ROOM_LAYOUTS[0];
  const submitted = Boolean(query.sit);
  const input = new URLSearchParams();
  for (const key of ["sit", "shoulder", "hug"] as const) {
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
  const roomUrl = nui && phone ? quickLookUrl(phone.origin, roomModelPath(layout, nui, revision, "usdz")) : null;
  const calibrationUrl = phone
    ? quickLookUrl(phone.origin, calibrationModelPath("a4-plate", revision, "usdz"))
    : null;
  const [roomQrCode, calibrationQrCode] = await Promise.all([
    roomUrl ? qrCodeOf(roomUrl) : null,
    calibrationUrl ? qrCodeOf(calibrationUrl) : null,
  ]);
  const interior = nui ? roomInteriorMm(nui) : null;
  const guide = nui ? nuiGuideSizeMm(nui) : null;
  const outer = nui ? roomOuterMm(nui, layout) : null;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-ink">AR 実寸テスト（開発用）</h1>
        <p className="text-[12.5px] text-muted-foreground">
          ぬいの寸法から仮の部屋を作り、iPhone の Quick Look で実寸表示します。校正用の A4 の板で、AR の縮尺そのものも確かめられます。
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

      <form method="get" className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold text-ink">仮の部屋</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink">
            座高（mm）
            <input name="sit" type="number" step="0.1" required defaultValue={query.sit} className={field} />
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
          単位は mm です（15cm なら 150）。肩幅か抱き幅のどちらかは必須で、両方あれば抱き幅を使います。
          <span className="num">{AR_LIMITS.nuiDimensionMinMm}</span>〜
          <span className="num">{AR_LIMITS.nuiDimensionMaxMm}</span>mm の範囲で入力してください。
        </p>
        <Button type="submit" className="self-start">
          QR コードを作る
        </Button>
      </form>

      {submitted && !nui && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
          寸法を確認してください（座高と、肩幅か抱き幅のどちらかが範囲内で必要です）。
        </p>
      )}

      {nui && interior && guide && outer && (
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row">
          {roomQrCode && <QrImage src={roomQrCode} alt="iPhone のカメラで読み取ると仮の部屋の AR が起動します" />}
          <div className="flex min-w-0 flex-col gap-2 text-[12.5px] text-ink">
            <p className="font-semibold">{LAYOUT_LABEL[layout]}</p>
            <table className="text-[12px]">
              <tbody>
                <tr>
                  <td className="pr-3 text-muted-foreground">部屋の外寸</td>
                  <td className="num">
                    幅 {outer.widthMm} × 奥行 {outer.depthMm} × 高さ {outer.heightMm} mm
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted-foreground">部屋の内寸</td>
                  <td className="num">
                    幅 {interior.widthMm} × 奥行 {interior.depthMm} × 高さ {interior.heightMm} mm
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted-foreground">ピンクの箱</td>
                  <td className="num">
                    幅 {guide.widthMm} × 奥行 {guide.depthMm} × 高さ {guide.heightMm} mm
                  </td>
                </tr>
              </tbody>
            </table>
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
          <li>本物のぬいを部屋の横に置き、ピンクの箱（高さ＝座高）と見比べます。</li>
        </ol>
      </section>
    </main>
  );
}
