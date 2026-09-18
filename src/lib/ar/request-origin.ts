import "server-only";
import { networkInterfaces } from "node:os";
import { headers } from "next/headers";
import { lanIPv4Addresses, phoneReachableOrigin } from "./origin";

/** 作品詳細と開発ページで同じスマートフォン向けURLを使う。 */
export async function requestPhoneOrigin() {
  const requestHeaders = await headers();
  return phoneReachableOrigin({
    host: requestHeaders.get("host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    lanAddresses: lanIPv4Addresses(networkInterfaces()),
  });
}
