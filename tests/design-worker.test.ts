import { afterEach, expect, it, vi } from "vitest";
import { createWorkerClient, Superseded } from "../src/lib/design/worker-client";
import { defaultDesign } from "../src/lib/design/document";
import type { EngineRequest, EngineResponse } from "../src/lib/design/protocol";

class FakeWorker {
  static current: FakeWorker;
  sent: EngineRequest[] = [];
  terminated = false;
  onmessage?: (event: { data: EngineResponse }) => void;
  onerror?: () => void;
  constructor() { FakeWorker.current = this; }
  postMessage(message: EngineRequest) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  complete(index: number) { this.onmessage?.({ data: { id: this.sent[index].id, kind: "build", build: { parts: [], issues: [], milliseconds: 0 } } }); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("coalesces queued previews and keeps the exact export ahead of the latest preview", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = createWorkerClient(), worker = FakeWorker.current, d = defaultDesign();
  const first = client.request(d);
  const skipped = client.request({ ...d, name: "old" });
  const rejected = expect(skipped).rejects.toBeInstanceOf(Superseded);
  const latest = client.request({ ...d, name: "latest" });
  const exported = client.request({ ...d, name: "saved" }, "glb");
  expect(worker.sent).toHaveLength(1);
  worker.complete(0); await first; await rejected;
  expect(worker.sent[1].design.name).toBe("saved");
  worker.complete(1); await exported;
  expect(worker.sent[2].design.name).toBe("latest");
  worker.complete(2); await latest;
  client.dispose(); expect(worker.terminated).toBe(true);
});

it("terminates a hung worker and rejects active and queued requests", async () => {
  vi.useFakeTimers(); vi.stubGlobal("Worker", FakeWorker);
  const client = createWorkerClient(), d = defaultDesign();
  const a = expect(client.request(d)).rejects.toThrow("時間内");
  const b = expect(client.request(d)).rejects.toThrow("時間内");
  await vi.advanceTimersByTimeAsync(20_000);
  await Promise.all([a, b]);
  expect(FakeWorker.current.terminated).toBe(true);
  await expect(client.request(d)).rejects.toThrow("停止");
});
