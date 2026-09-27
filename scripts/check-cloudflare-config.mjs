import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";

const errors = [];
const config = parse(readFileSync("wrangler.jsonc", "utf8"), errors);
if (errors.length) throw new Error("wrangler.jsonc is not valid JSONC");
const id = config.hyperdrive?.find((binding) => binding.binding === "DATABASE")?.id;
if (!id || !/^[a-f0-9]{32}$/i.test(id) || /^0+$/.test(id))
  throw new Error("Set DATABASE to a real Hyperdrive ID with query caching disabled before deployment");
const url = new URL(config.vars?.SITE_URL);
if (url.protocol !== "https:" || url.hostname.endsWith(".invalid") || url.pathname !== "/")
  throw new Error("Set SITE_URL to the application's public HTTPS origin before deployment");
if (!config.r2_buckets?.some((binding) => binding.binding === "FILES") ||
    !config.services?.some((binding) => binding.binding === "GEOMETRY"))
  throw new Error("FILES and GEOMETRY bindings are required");
if (config.vars?.DEMO_GUEST_ENABLED !== "true" &&
    (config.vars?.MAIL_PROVIDER !== "resend" || config.vars?.SMS_PROVIDER !== "twilio"))
  throw new Error("Configure mail/SMS delivery, or explicitly select an isolated guest demo");
console.log("Cloudflare configuration placeholders have been resolved. Secrets and remote resources still require verification.");
