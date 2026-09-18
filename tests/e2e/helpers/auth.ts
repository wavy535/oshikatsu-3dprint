import { expect, type Page } from "@playwright/test";

/** Respect the real auth rate limit when several fixture tests share one local IP. */
export async function signInFixture(page: Page, baseURL: string, email: string) {
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use local fixtures");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post(new URL("/api/auth/sign-in/email", baseURL).href, {
      headers: { origin: new URL(baseURL).origin },
      data: { email, password: "password123" },
    });
    if (response.status() !== 429 || attempt === 2) {
      expect(response.ok(), `fixture login returned ${response.status()}`).toBe(true);
      return;
    }
    const seconds = Number(response.headers()["retry-after"] ?? 11);
    await new Promise((resolve) => setTimeout(resolve, (Math.min(15, Math.max(11, seconds)) + 1) * 1000));
  }
}
