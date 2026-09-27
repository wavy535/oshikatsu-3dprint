import { expect, test } from "@playwright/test";
import { signInFixture } from "./helpers/auth";

test("notification preferences persist and keep mandatory notices enabled", async ({
  page,
  baseURL,
}) => {
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname))
    throw new Error("Local fixtures only");
  await signInFixture(page, baseURL!, "buyer@example.com");
  await page.goto("/mypage/notification-settings");
  await expect(
    page.getByRole("heading", { name: "通知設定", exact: true }),
  ).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "お知らせ", exact: true }) });
  const toggle = row.getByRole("button", { name: /アプリ内通知/ });
  const original = await toggle.getAttribute("aria-pressed");
  try {
    await toggle.click();
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      original === "true" ? "false" : "true",
    );
    await page.reload();
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      original === "true" ? "false" : "true",
    );
    await expect(page.getByText("常時オン", { exact: true })).toHaveCount(2);
    const ownerEmail = page.getByText("buyer@example.com", { exact: true });
    await expect(ownerEmail).toBeVisible();
  } finally {
    if ((await toggle.getAttribute("aria-pressed")) !== original) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", original!);
    }
  }
});
