import "server-only";
import QRCode from "qrcode";
import { AR_DISPLAY } from "./config";
import { buildArModelOptions, nuiDimensionsOf, variantForNui } from "./options";
import { quickLookUrl, workModelPath } from "./params";
import { getArWorkSource } from "./queries";
import { requestPhoneOrigin } from "./request-origin";
import { modelRevision } from "./revision";
import { assetVersion } from "./version";

type Variant = { id: string; size_label: string; nui_size_cm: number | string | null };
type Nui = Parameters<typeof nuiDimensionsOf>[0] & {
  id: string;
  name: string;
  nui_size_cm: number | string | null;
  is_main: boolean;
};

export type QrUnavailableReason = "no_size" | "no_model";

/** 作品詳細のAR表示データ。購入サイズと、ぬいに合わせるARサイズは別に扱う。 */
export async function getWorkArPreview(input: {
  workId: string;
  variants: readonly Variant[];
  selected: Variant | null;
  signedIn: boolean;
  nuis: readonly Nui[];
  nuiId?: string;
}) {
  const { workId, variants, selected, signedIn, nuis, nuiId } = input;
  // 他人のIDや古いIDは選択とせず、本人の登録一覧からだけ選ぶ。
  const nui = nuis.find((candidate) => candidate.id === nuiId) ?? null;
  const variant = nui ? variantForNui(variants, nui) : selected;
  const source = variant ? await getArWorkSource(workId, variant.id) : null;
  const version = source ? assetVersion(source.storagePath) : null;
  const roomNui = nui ?? nuis.find((candidate) => candidate.is_main) ?? null;
  const models = buildArModelOptions({
    workId,
    variantId: variant?.id ?? null,
    assetVersion: version,
    signedIn,
    nui: roomNui ? nuiDimensionsOf(roomNui) : null,
  });

  let qr: { url: string; imageDataUrl: string } | null = null;
  if (nui && variant && version) {
    const phone = await requestPhoneOrigin();
    if (phone) {
      const url = quickLookUrl(phone.origin, workModelPath(workId, variant.id, version, modelRevision(), "usdz"));
      qr = {
        url,
        imageDataUrl: await QRCode.toDataURL(url, {
          width: AR_DISPLAY.qrCodeWidthPx,
          margin: AR_DISPLAY.qrCodeMargin,
        }),
      };
    }
  }
  const qrUnavailable: QrUnavailableReason | null =
    nui ? (variant ? (source ? null : "no_model") : "no_size") : null;

  return {
    ...models,
    sizeLabel: variant?.size_label ?? null,
    signedIn,
    nuis: nuis.map((candidate) => ({
      id: candidate.id,
      label: candidate.nui_size_cm === null
        ? candidate.name
        : `${candidate.name}（${Number(candidate.nui_size_cm)}cm）`,
    })),
    selectedNuiId: nui?.id ?? null,
    basePath: `/works/${workId}`,
    baseQuery: new URLSearchParams(selected ? { size: selected.id } : {}).toString(),
    qr,
    qrUnavailable,
  };
}
