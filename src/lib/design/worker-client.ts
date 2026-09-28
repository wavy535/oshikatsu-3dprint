import { CompositeGeometryError } from "./composite.ts";
import type { EngineRequest, EngineResponse } from "./protocol.ts";
import type { Design } from "./document.ts";
import type { ExportFormat } from "./export.ts";

type Task = { request: EngineRequest; resolve: (r: EngineResponse) => void; reject: (e: Error) => void };
export class Superseded extends Error {}

/** One in flight and one latest preview. Exports are explicit, never silently dropped. */
export function createWorkerClient() {
  const worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), { type: "module" });
  let nextId = 0, active: Task | undefined, preview: Task | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const exports: Task[] = [];
  let stopped = false;
  function fail(error: Error) {
    stopped = true;
    clearTimeout(timer);
    worker.terminate();
    active?.reject(error); preview?.reject(error); exports.forEach((t) => t.reject(error));
    active = undefined; preview = undefined; exports.length = 0;
  }
  function pump() {
    if (active || stopped) return;
    active = exports.shift() ?? preview;
    if (!active) return;
    if (active === preview) preview = undefined;
    timer = setTimeout(() => fail(new Error("形状処理が時間内に完了しませんでした。「再試行」で再開できます。")), 20_000);
    worker.postMessage(active.request);
  }
  worker.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
    if (data.id !== active?.request.id) return;
    clearTimeout(timer);
    if (data.kind === "error") active.reject(data.repairable ? new CompositeGeometryError(data.message) : new Error(data.message)); else active.resolve(data);
    active = undefined;
    pump();
  };
  worker.onerror = () => fail(new Error("制作エンジンを読み込めませんでした。接続を確認して再試行してください。"));
  worker.onmessageerror = () => fail(new Error("形状データを受け取れませんでした。再試行してください。"));
  return {
    request(design: Design, format?: ExportFormat): Promise<EngineResponse> {
      if (stopped) return Promise.reject(new Error("制作エンジンが停止しています。再試行してください。"));
      return new Promise((resolve, reject) => {
        const task = { request: { id: ++nextId, design, format }, resolve, reject };
        if (format) {
          if (exports.length >= 2) { reject(new Error("書き出し中です。完了してから操作してください。")); return; }
          exports.push(task);
        } else { preview?.reject(new Superseded()); preview = task; }
        pump();
      });
    },
    dispose() { fail(new Superseded()); },
  };
}
