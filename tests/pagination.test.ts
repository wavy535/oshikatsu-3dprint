import { expect, test } from "vitest";
import { pageNumber, pageHref } from "@/lib/pagination";
import { parseWorkFilters } from "@/lib/works/search-params";

test("pagination accepts whole page numbers and rejects malformed or extreme offsets", () => {
  expect(pageNumber("2")).toBe(2);
  for (const input of [
    undefined,
    [],
    ["2"],
    "1.5",
    "-1",
    "Infinity",
    "NaN",
    "1e100",
    0,
  ])
    expect(pageNumber(input)).toBe(1);
  expect(parseWorkFilters({ page: "1.5" }).page).toBe(1);
});

test("page links retain filters and an explicit opt-out of the default nui size", () => {
  const path = pageHref(
    "/works",
    { q: "台座 & 小物", nuiSize: "", sort: "price_asc" },
    2,
  );
  const url = new URL(path, "https://example.invalid");
  expect(url.searchParams.get("q")).toBe("台座 & 小物");
  expect(url.searchParams.get("nuiSize")).toBe("");
  expect(url.searchParams.get("page")).toBe("2");
  expect(
    pageHref(
      "/studio/payouts",
      { page: "2", chargesPage: "3" },
      1,
      "chargesPage",
    ),
  ).toBe("/studio/payouts?page=2");
});
