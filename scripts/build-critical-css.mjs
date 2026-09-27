import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { compileSheet, encodePlan } from "beasties/compiler";

// Run after Vite: only the exact emitted CSS is compiled into the server bundle.
// The compiler and PostCSS never enter the Worker runtime.
const directory = "dist/client/_next/static/css";
const files = readdirSync(directory).filter((name) => name.endsWith(".css"));
if (!files.length) throw new Error("No production CSS to compile");
const plans = files.map((name) => {
  const sheet = compileSheet(readFileSync(`${directory}/${name}`, "utf8"), {
    href: `/_next/static/css/${name}`, exact: false,
    // Normalization strips root pseudo selectors such as :where(select).
    // Keep these small global/accessibility rules on every page.
    allowRules: [/^:/],
  });
  // Beasties 0.5.4 adds a statement terminator after leaf block at-rules.
  // In browsers, `@property {...};@property {...}` discards the next rule.
  // Remove only that extra terminator, leaving statement at-rules intact.
  // The JavaScript-disabled E2E checks Tailwind property/border parity.
  for (const rule of sheet.rules) {
    if (rule.css?.startsWith("@") && rule.css.endsWith("};")) {
      rule.css = rule.css.slice(0, -1);
    }
  }
  return encodePlan(sheet);
});
const entry = "dist/server/index.js";
const marker = "globalThis.__OSHINEST_CSS_PLANS__ = ";
const source = readFileSync(entry, "utf8");
if (source.includes(marker)) throw new Error("Critical CSS plans already injected; rebuild first");
writeFileSync(entry, `${marker}${JSON.stringify(plans)};\n${source}`);
console.log(`Compiled ${files.length} stylesheet(s) for critical CSS extraction`);
