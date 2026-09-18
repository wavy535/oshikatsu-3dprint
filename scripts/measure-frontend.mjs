import { chromium } from "@playwright/test";

// Run against the production standalone server on port 3100 (see README).
// Cold browser cache, local network, 4x CPU slowdown. These are lab samples, not field vitals.
const baseURL = process.env.PERF_BASE_URL ?? "http://localhost:3100";
const routes = process.argv.slice(2);
if (!routes.length) routes.push("/", "/works");
if (routes.some((route) => !route.startsWith("/") || route.startsWith("//"))) {
  throw new Error("Pass relative route paths, for example /works");
}
const browser = await chromium.launch();
const samples = [];
try {
  for (const route of routes) {
    // Warm the server separately; each recorded sample still gets a fresh browser context.
    const warmup = await fetch(new URL(route, baseURL));
    if (!warmup.ok) throw new Error(`${route}: HTTP ${warmup.status}`);
    await warmup.arrayBuffer();
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.addInitScript(() => {
          const metrics = window.__renderMetrics = { lcp: 0, cls: 0 };
          let windowStart = 0, lastShift = 0, windowValue = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.hadRecentInput) continue;
              if (entry.startTime - lastShift > 1000 || entry.startTime - windowStart > 5000) {
                windowStart = entry.startTime;
                windowValue = 0;
              }
              lastShift = entry.startTime;
              windowValue += entry.value;
              metrics.cls = Math.max(metrics.cls, windowValue);
            }
          }).observe({ type: "layout-shift", buffered: true });
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(new URL(route, baseURL).href);
        if (!response?.ok()) throw new Error(`${route}: HTTP ${response?.status()}`);
        await page.waitForTimeout(1500);
        const metrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType("navigation")[0];
          const scripts = performance.getEntriesByType("resource").filter((entry) => entry.initiatorType === "script");
          return {
            ...window.__renderMetrics,
            ttfb: navigation.responseStart,
            fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
            htmlBytes: navigation.decodedBodySize,
            scriptBytes: scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
            scriptRequests: scripts.length,
            domNodes: document.querySelectorAll("*").length,
          };
        });
        samples.push({ route, run, ...metrics, errors });
      } finally {
        await context.close();
      }
    }
  }
  console.log(JSON.stringify({ browser: browser.version(), baseURL, viewport: "390x844", cpuSlowdown: 4, samples }, null, 2));
  if (samples.some((sample) => sample.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
