import { expect, test } from "vitest";
import { lanIPv4Addresses, localModelVersion, phoneReachableOrigin, sortLocalNames } from "@/lib/ar/dev";

test("LAN addresses keep external IPv4 interfaces only", () => {
  expect(
    lanIPv4Addresses({
      lo0: [
        { address: "127.0.0.1", family: "IPv4", internal: true },
        { address: "::1", family: "IPv6", internal: true },
      ],
      en0: [
        { address: "fe80::1", family: "IPv6", internal: false },
        { address: "192.168.1.68", family: "IPv4", internal: false },
      ],
      en1: [{ address: "10.0.0.5", family: 4, internal: false }],
      utun0: undefined,
    }),
  ).toEqual(["192.168.1.68", "10.0.0.5"]);
});

test("pages opened through a reachable host keep that origin", () => {
  expect(
    phoneReachableOrigin({ host: "192.168.1.68:3000", forwardedProto: null, lanAddresses: ["10.0.0.5"] }),
  ).toEqual({ origin: "http://192.168.1.68:3000", replacedLoopback: false });
  expect(
    phoneReachableOrigin({ host: "dev.example.test", forwardedProto: "https,http", lanAddresses: [] }),
  ).toEqual({ origin: "https://dev.example.test", replacedLoopback: false });
});

test("loopback hosts are replaced by the first LAN address on the same port", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    expect(phoneReachableOrigin({ host, forwardedProto: null, lanAddresses: ["192.168.1.68"] })).toEqual({
      origin: "http://192.168.1.68:3000",
      replacedLoopback: true,
    });
  }
  expect(phoneReachableOrigin({ host: "localhost:3000", forwardedProto: null, lanAddresses: [] })).toBeNull();
  expect(phoneReachableOrigin({ host: null, forwardedProto: null, lanAddresses: ["192.168.1.68"] })).toBeNull();
});

test("local file names are listed in natural order without changing the input", () => {
  const names = ["10_Table.gcode.3mf", "roomfile", "2_Chair.gcode.3mf", "test_3mf"];
  expect(sortLocalNames(names)).toEqual(["2_Chair.gcode.3mf", "10_Table.gcode.3mf", "roomfile", "test_3mf"]);
  expect(names[0]).toBe("10_Table.gcode.3mf");
});

test("local model versions change when the file is replaced", () => {
  const file = { size: 4_966_418, mtimeMs: 1_789_120_000_000 };
  expect(localModelVersion(file)).toBe(localModelVersion({ ...file }));
  expect(localModelVersion(file)).not.toBe(localModelVersion({ ...file, size: file.size + 1 }));
  expect(localModelVersion(file)).not.toBe(localModelVersion({ ...file, mtimeMs: file.mtimeMs + 1 }));
});
