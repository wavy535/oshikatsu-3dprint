import { expect, test } from "vitest";
import { modelRevision, revisionOf } from "@/lib/ar/revision";

test("revisions are short, deterministic and change with their input", () => {
  expect(revisionOf("room")).toMatch(/^[0-9a-f]{8}$/);
  expect(revisionOf("room")).toBe(revisionOf("room"));
  expect(revisionOf("room")).not.toBe(revisionOf("rooms"));
  // FNV-1a 32bit reference value for the empty string.
  expect(revisionOf("")).toBe("811c9dc5");
  expect(modelRevision()).toMatch(/^[0-9a-f]{8}$/);
  expect(modelRevision()).toBe(modelRevision());
});
