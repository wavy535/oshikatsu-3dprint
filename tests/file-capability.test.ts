import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signFileClaim, verifyFileClaim, type FileClaim } from "@/lib/files/capability";
import { objectKey } from "@/lib/files/storage";
const claim = (): FileClaim => ({ version: 1, operation: "write", key: "work-stl/owner/work/model.stl", bytes: 128,
  contentType: "application/octet-stream", expires: Math.floor(Date.now() / 1000) + 120 });
beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret-with-at-least-32-characters"));
afterEach(() => vi.unstubAllEnvs());
test("a capability binds path, method, size, media type and expiration", async () => {
  const data = claim(); const token = await signFileClaim(data);
  expect(await verifyFileClaim(token, "write")).toEqual(data);
  expect(await verifyFileClaim(token, "read")).toBeNull();
  const [, signature] = token.split(".");
  for (const change of [{ key: "work-stl/other/private.stl" }, { bytes: 999 }, { contentType: "text/html" }, { expires: data.expires + 1000 }]) {
    const payload = Buffer.from(JSON.stringify({ ...data, ...change })).toString("base64url");
    expect(await verifyFileClaim(`${payload}.${signature}`, "write")).toBeNull();
  }
});
test("expired, malformed and rotated-key tokens fail closed", async () => {
  const token = await signFileClaim(claim());
  expect(await verifyFileClaim(await signFileClaim({ ...claim(), expires: 1 }), "write")).toBeNull();
  for (const invalid of [null, "", "x.y", "a".repeat(3000)]) expect(await verifyFileClaim(invalid, "write")).toBeNull();
  vi.stubEnv("AUTH_SECRET", "different-secret-with-at-least-32-characters");
  expect(await verifyFileClaim(token, "write")).toBeNull();
});
test.each(["", "../private", "owner/../private", "owner//model", "owner\\model", "owner/\u0000file"])("invalid object path %j is rejected", (path) => {
  expect(() => objectKey("work-stl", path)).toThrow("Invalid object path");
});
