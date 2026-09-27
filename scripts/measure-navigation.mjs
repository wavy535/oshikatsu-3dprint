import { chromium } from "@playwright/test";

// A separate metric from LCP: click dispatch to destination heading + paint.
// Uses normal browser caching, as a person navigating within the site would.
const baseURL = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const storageState = process.env.PERF_STORAGE_STATE;
if (!storageState) throw new Error("PERF_STORAGE_STATE is required for member navigation");
const network = {
  offline: false,
  latency: 150,
  downloadThroughput: 1_600_000 / 8,
  uploadThroughput: 750_000 / 8,
};
const destinations = [
  { route: "/mypage/notification-settings", heading: "通知設定", menu: true },
  { route: "/mypage/orders", heading: "購入履歴", menu: true },
  { route: "/cart", heading: /^カート\s*\d+件$/ },
  { route: "/works", heading: "作品をさがす" },
  { route: "/mypage", heading: "マイページ" },
];
const browser = await chromium.launch();
const samples = [];
try {
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ storageState, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", network);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(new URL("/mypage", baseURL).href);
      if (new URL(page.url()).pathname !== "/mypage") throw new Error("Member authentication required");
      await page.waitForFunction(() => window.__NEXT_HYDRATED === true);
      for (const { route, heading, menu } of destinations) {
        if (menu) await page.locator("summary").filter({ hasText: "マイページメニュー" }).click();
        await page.evaluate(() => {
          delete window.__navigationStart;
          document.addEventListener("click", () => { window.__navigationStart = performance.now(); }, { capture: true, once: true });
        });
        await page.locator(`a[href="${route}"]:visible`).first().click();
        await page.waitForURL((url) => url.pathname === route);
        await page.getByRole("heading", { name: heading, exact: true, level: 1 }).waitFor();
        const duration = await page.evaluate(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (typeof window.__navigationStart !== "number") throw new Error("Unexpected full navigation");
          return performance.now() - window.__navigationStart;
        });
        samples.push({ run, route, duration, errors: [...errors] });
        console.error(`${route} #${run}: click to paint ${Math.round(duration)}ms`);
      }
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify({ browser: browser.version(), baseURL, viewport: "390x844", authenticated: true,
    cpuSlowdown: 4, network, cache: "enabled", metric: "click-to-heading-and-two-animation-frames", samples }, null, 2));
  if (samples.some((sample) => sample.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
