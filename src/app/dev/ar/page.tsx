import { networkInterfaces } from "node:os";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { AR_DEV_PAGE, AR_LIMITS } from "@/lib/ar/config";
import { lanIPv4Addresses, phoneReachableOrigin } from "@/lib/ar/dev";
import { parseNuiQuery, quickLookRoomUrl } from "@/lib/ar/params";
import { ROOM_LAYOUTS, nuiGuideSizeMm, roomInteriorMm, type RoomLayout } from "@/lib/ar/room";
import { Button } from "@/components/ui/button";

export const metadata = { title: "AR 実寸テスト（開発用）" };

const LAYOUT_LABEL: Record<RoomLayout, string> = {
  "three-walls": "3面（奥・左・右）",
  "back-left": "2面（奥・左）",
};

type Query = { sit?: string; shoulder?: string; hug?: string; layout?: string };

const field = "w-28 rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink";

/**
 * 開発用：仮の部屋を iPhone の Quick Look で実寸表示して確かめるページ。本番では 404。
 * 寸法を入れると QR コードが出て、iPhone のカメラで読むと AR が起動する。DB とログインは使わない。
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
  const arUrl = nui && phone ? quickLookRoomUrl(phone.origin, layout, nui) : null;
  const qrCode = arUrl
    ? await QRCode.toDataURL(arUrl, { width: AR_DEV_PAGE.qrCodeWidthPx, margin: AR_DEV_PAGE.qrCodeMargin })
    : null;
  const interior = nui ? roomInteriorMm(nui) : null;
  const guide = nui ? nuiGuideSizeMm(nui) : null;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-ink">AR 実寸テスト（開発用）</h1>
        <p className="text-[12.5px] text-muted-foreground">
          ぬいの寸法から仮の部屋を作り、iPhone の Quick Look で実寸表示します。本物のぬいと並べて大きさを確かめてください。
        </p>
      </div>

      <form method="get" className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
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
          肩幅か抱き幅のどちらかは必須です（両方あれば抱き幅を使います）。
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

      {nui && interior && guide && (
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row">
          {qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrCode}
              alt="iPhone のカメラで読み取ると AR が起動します"
              width={AR_DEV_PAGE.qrCodeWidthPx}
              height={AR_DEV_PAGE.qrCodeWidthPx}
              className="self-start rounded-md border border-line"
            />
          ) : (
            <p className="text-[12.5px] text-danger">
              スマホから届くアドレスが分からないため、QR コードを作れません。Mac が Wi-Fi などのネットワークにつながっているか確認してください。
            </p>
          )}
          <div className="flex min-w-0 flex-col gap-2 text-[12.5px] text-ink">
            <p className="font-semibold">{LAYOUT_LABEL[layout]}</p>
            <table className="text-[12px]">
              <tbody>
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
            {phone?.replacedLoopback && (
              <p className="text-[11.5px] text-muted-foreground">
                localhost で開いているため、QR コードには <span className="num">{phone.origin}</span>{" "}
                を入れています。iPhone と Mac を同じ Wi-Fi につないでください。
              </p>
            )}
            {arUrl && (
              <p className="text-[11.5px] break-all text-muted-foreground">
                iPhone でこのページを開いている場合は{" "}
                <a href={arUrl} className="font-semibold text-brand hover:underline">
                  ここをタップ
                </a>
                。URL：<span className="num">{arUrl}</span>
              </p>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold text-ink">確認の手順</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-5 text-ink">
          <li>Mac と iPhone を同じ Wi-Fi につなぎ、本物のぬいの寸法を入れて QR コードを作ります。</li>
          <li>iPhone の標準カメラで QR コードを読み、出てきたリンクを Safari で開きます。</li>
          <li>Quick Look が開いたら「AR」を選び、机の上に部屋を置きます。ピンチしても大きさが変わらないことを確かめます。</li>
          <li>本物のぬいを部屋の横に置き、ピンクの箱（高さ＝座高）と見比べます。</li>
          <li>定規を部屋の横に置き、画面の中で内寸の幅と高さを読み取って、上の値と比べて記録します。</li>
          <li>iPhone との距離を 30cm・50cm・1m ほどに変えて、同じように読み取ります。</li>
        </ol>
      </section>
    </main>
  );
}
