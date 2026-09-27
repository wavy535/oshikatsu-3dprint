import "server-only";
import { env } from "cloudflare:workers";

/** Bindings belong to the current Worker invocation; never cache clients globally. */
export function platform() {
  return env;
}
