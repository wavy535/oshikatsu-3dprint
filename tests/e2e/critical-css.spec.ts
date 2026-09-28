import { readFileSync, readdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signInFixture } from "./helpers/auth";

const cssDirectory = "dist/client/_next/static/css";
const fullCss = () => readdirSync(cssDirectory).filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(`${cssDirectory}/${name}`, "utf8")).join("\n");

async function appearance(page: Page) {
  return page.locator("body").evaluate((body) => [...body.querySelectorAll("*")]
    .filter((element) => !["SCRIPT", "STYLE", "LINK"].includes(element.tagName))
    .map((element) => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        styles: Object.fromEntries([
          "display", "visibility", "position", "width", "height", "color", "background-color",
          "font-family", "font-size", "font-weight", "line-height", "text-align", "white-space",
          "padding", "margin", "gap", "border-width", "border-color", "border-radius",
          "grid-template-columns", "flex-direction", "align-items", "justify-content", "box-shadow",
        ].map((name) => [name, style.getPropertyValue(name)])),
      };
    }));
}

for (const width of [390, 1365]) {
  test(`critical CSS matches complete styles before JavaScript at ${width}px`, async ({ browser, baseURL }) => {
    if (!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname)) throw new Error("Local fixtures only");
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 } });
    try {
      const page = await context.newPage();
      await signInFixture(page, baseURL!, "buyer@example.com");
      for (const path of ["/", "/works", "/mypage", "/mypage/notification-settings", "/mypage/orders", "/cart"]) {
        const response = await page.goto(new URL(path, baseURL!).href);
        expect(response?.headers().link ?? "").not.toContain('/_next/static/css/');
        await expect(page.locator("style[data-oshinest-critical]")).toHaveCount(1);
        const critical = await appearance(page);
        // Swap only the inline subset for the complete emitted stylesheet.
        // All content, data, DOM, viewport and browser state remain identical.
        const complete = fullCss();
        const original = await page.locator("style[data-oshinest-critical]").textContent();
        await page.locator("style[data-oshinest-critical]").evaluate((style, css) => { style.textContent = css; }, complete);
        expect(await appearance(page), path).toEqual(critical);
        await page.locator("style[data-oshinest-critical]").evaluate((style, css) => { style.textContent = css; }, original);
        if (width === 390 && path.startsWith("/mypage")) {
          await page.locator("summary").filter({ hasText: "マイページメニュー" }).click();
          const expanded = await appearance(page);
          await page.locator("style[data-oshinest-critical]").evaluate((style, css) => { style.textContent = css; }, complete);
          expect(await appearance(page)).toEqual(expanded);
        }
      }
    } finally {
      await context.close();
    }
  });
}

test("HTML remains readable when Brotli is explicitly disabled", async ({ request }) => {
  for (const encoding of ["identity", "gzip, br;q=0"]) {
    const response = await request.get("/", { headers: { "Accept-Encoding": encoding } });
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-encoding"]).not.toBe("br");
    expect(await response.text()).toContain("おうちと家具。");
  }
});

test("create reports render stages while preserving compressed and uncompressed HTML", async ({ request }) => {
  for (const encoding of ["br", "identity"]) {
    const response = await request.get("/create", { headers: { "Accept-Encoding": encoding } });
    expect(response.ok()).toBe(true);
    const timing = response.headers()["server-timing"];
    for (const name of ["ssr", "html", "css", "rewrite", "encode", "worker"])
      expect(timing).toMatch(new RegExp(`(?:^|, )${name};dur=\\d+\\.\\d`));
    expect(response.headers()["content-encoding"] ?? "identity").toBe(encoding);
    expect(await response.text()).toContain("壁・屋根・窓・棚を組み合わせて");
  }
});
