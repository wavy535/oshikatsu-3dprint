import { chromium } from "@playwright/test";

// Run against a production build or the public Worker. Never use the Vite dev server.
// Fresh browser contexts, fixed network/CPU. Optional private storage state for member pages.
// Never commit storage-state files: they contain session cookies.
const baseURL = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const storageState = process.env.PERF_STORAGE_STATE;
const viewport = { width: Number(process.env.PERF_WIDTH ?? 390), height: 844 };
if (!Number.isInteger(viewport.width) || viewport.width < 320)
  throw new Error("Invalid PERF_WIDTH");
const routes = process.argv.slice(2);
if (!routes.length) routes.push("/", "/works");
if (routes.some((route) => !route.startsWith("/") || route.startsWith("//"))) {
  throw new Error("Pass relative route paths, for example /works");
}
const network = {
  offline: false,
  latency: 150,
  downloadThroughput: 1_600_000 / 8,
  uploadThroughput: 750_000 / 8,
};
const browser = await chromium.launch();
const samples = [];
try {
  for (const route of routes) {
    // Warm the server separately; each recorded sample still gets a fresh browser context.
    const warmContext = await browser.newContext({ storageState });
    try {
      const warmup = await warmContext.request.get(
        new URL(route, baseURL).href,
        { maxRedirects: 0 },
      );
      if (!warmup.ok())
        throw new Error(
          `${route}: warmup HTTP ${warmup.status()} (check authentication)`,
        );
      await warmup.body();
    } finally {
      await warmContext.close();
    }
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport,
        storageState,
      });
      try {
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await session.send("Network.enable");
        await session.send("Network.setCacheDisabled", { cacheDisabled: true });
        await session.send("Network.emulateNetworkConditions", network);
        await page.addInitScript(() => {
          const metrics = (window.__renderMetrics = {
            lcp: 0,
            cls: 0,
            lcpElement: null,
            lcpUrl: null,
            longTasks: [],
          });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              metrics.longTasks.push({
                start: entry.startTime,
                duration: entry.duration,
              });
          }).observe({ type: "longtask", buffered: true });
          let windowStart = 0,
            lastShift = 0,
            windowValue = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              metrics.lcp = entry.startTime;
              metrics.lcpElement = entry.element
                ? `${entry.element.tagName.toLowerCase()}.${[...entry.element.classList].join(".")}`
                : null;
              metrics.lcpUrl = entry.url;
            }
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.hadRecentInput) continue;
              if (
                entry.startTime - lastShift > 1000 ||
                entry.startTime - windowStart > 5000
              ) {
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
        if (!response?.ok())
          throw new Error(`${route}: HTTP ${response?.status()}`);
        if (new URL(page.url()).pathname !== new URL(route, baseURL).pathname)
          throw new Error(
            `${route}: redirected; refusing to measure a different page`,
          );
        await page.waitForTimeout(1500);
        const metrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType("navigation")[0];
          const scripts = performance
            .getEntriesByType("resource")
            .filter((entry) => new URL(entry.name).pathname.endsWith(".js"));
          return {
            ...window.__renderMetrics,
            ttfb: navigation.responseStart,
            fcp:
              performance.getEntriesByName("first-contentful-paint")[0]
                ?.startTime ?? null,
            hydratedAt: window.__VINEXT_HYDRATED_AT ?? null,
            htmlBytes: navigation.decodedBodySize,
            htmlEncodedBytes: navigation.encodedBodySize,
            contentEncoding: navigation.contentEncoding ?? null,
            htmlTransferBytes: navigation.transferSize,
            connection: {
              dns: navigation.domainLookupEnd - navigation.domainLookupStart,
              tcpTls: navigation.connectEnd - navigation.connectStart,
              requestWait: navigation.responseStart - navigation.requestStart,
            },
            responseEnd: navigation.responseEnd,
            resources: performance.getEntriesByType("resource").map((e) => ({
              url: e.name,
              type: e.initiatorType,
              start: e.startTime,
              end: e.responseEnd,
              bytes: e.decodedBodySize,
              transfer: e.transferSize,
            })),
            scriptBytes: scripts.reduce(
              (sum, entry) => sum + entry.decodedBodySize,
              0,
            ),
            scriptRequests: scripts.length,
            domNodes: document.querySelectorAll("*").length,
          };
        });
        samples.push({ route, run, ...metrics, errors });
        console.error(
          `${route} #${run}: LCP ${Math.round(metrics.lcp)}ms, TTFB ${Math.round(metrics.ttfb)}ms`,
        );
      } finally {
        await context.close();
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        baseURL,
        viewport: `${viewport.width}x${viewport.height}`,
        authenticated: Boolean(storageState),
        cpuSlowdown: 4,
        network,
        cache: "disabled",
        samples,
      },
      null,
      2,
    ),
  );
  if (samples.some((sample) => sample.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
