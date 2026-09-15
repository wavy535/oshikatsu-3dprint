import { revisionOf } from "./revision.ts";

type NetworkInterfaceLike = { address: string; family: string | number; internal: boolean };

const IPV4 = "IPv4";
const IPV4_NUMERIC = 4;

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname.startsWith("127.") || hostname === "[::1]";
}

/** os.networkInterfaces() の結果から、ほかの端末から届く IPv4 アドレスを選ぶ */
export function lanIPv4Addresses(interfaces: Record<string, NetworkInterfaceLike[] | undefined>) {
  return Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((item) => (item.family === IPV4 || item.family === IPV4_NUMERIC) && !item.internal)
    .map((item) => item.address);
}

/**
 * 開発用の実寸テストページで、スマホから届く origin を決める。
 * Mac で localhost として開いていても、QR コードには同じポートの LAN アドレスを入れる。
 * 決められないとき（ホスト不明・LAN アドレスなし）は null。
 */
export function phoneReachableOrigin(input: {
  host: string | null;
  forwardedProto: string | null;
  lanAddresses: string[];
}) {
  if (!input.host) return null;
  const protocol = input.forwardedProto?.split(",")[0]?.trim() === "https" ? "https" : "http";
  let url: URL;
  try {
    url = new URL(`${protocol}://${input.host}`);
  } catch {
    return null;
  }
  if (!isLoopback(url.hostname)) return { origin: url.origin, replacedLoopback: false };
  const lan = input.lanAddresses[0];
  if (!lan) return null;
  url.hostname = lan;
  return { origin: url.origin, replacedLoopback: true };
}

/** 手元のフォルダ・ファイルの名前を、名前順（数字は数として、2 は 10 より前）に並べる */
export const sortLocalNames = (names: string[]) =>
  [...names].sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));

/** 手元のファイルの版。大きさと更新日時から作り、ファイルを置き換えると変わる */
export const localModelVersion = (file: { size: number; mtimeMs: number }) =>
  revisionOf(`${file.size}:${file.mtimeMs}`);
