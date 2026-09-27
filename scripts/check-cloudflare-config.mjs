import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";

const errors = [];
const config = parse(readFileSync("wrangler.jsonc", "utf8"), errors);
if (errors.length) throw new Error("wrangler.jsonc is not valid JSONC");
const id = config.d1_databases?.find((binding) => binding.binding === "DATABASE")?.database_id;
if (!id || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || /^0+$/.test(id.replaceAll("-", "")))
  throw new Error("Set DATABASE to a real D1 database ID before deployment");
const url = new URL(config.vars?.SITE_URL);
if (url.protocol !== "https:" || url.hostname.endsWith(".invalid") || url.pathname !== "/")
  throw new Error("Set SITE_URL to the application's public HTTPS origin before deployment");
if (!config.r2_buckets?.some((binding) => binding.binding === "FILES") ||
    !config.services?.some((binding) => binding.binding === "GEOMETRY"))
  throw new Error("FILES and GEOMETRY bindings are required");
if (config.vars?.DEMO_GUEST_ENABLED !== "false" || config.vars?.MAIL_PROVIDER !== "none" ||
    config.vars?.AUTH_EMAIL_VERIFICATION !== "disabled" || config.vars?.CREATOR_APPLICATIONS_ENABLED !== "false")
  throw new Error("This release permits unverified ordinary members and disables email delivery and creator applications");
console.log("Cloudflare configuration is ready. Secrets and remote resources still require verification.");
