import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ serviceDatabase: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: vi.fn() }));
vi.mock("@/lib/mail/dispatch", () => ({ dispatchNotificationEmails: vi.fn() }));
import { requireAdmin } from "@/lib/auth/guards";
import { serviceDatabase } from "@/lib/db/client";
import { getPool } from "@/lib/db/pool";
import { dispatchNotificationEmails } from "@/lib/mail/dispatch";
import { runMaintenanceAction } from "@/lib/ops/maintenance-actions";

test("manual maintenance authorizes the admin before accessing any data or sending mail", async () => {
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("Not an admin"));
  await expect(runMaintenanceAction()).rejects.toThrow("Not an admin");
  expect(serviceDatabase).not.toHaveBeenCalled();
  expect(getPool).not.toHaveBeenCalled();
  expect(dispatchNotificationEmails).not.toHaveBeenCalled();
});
