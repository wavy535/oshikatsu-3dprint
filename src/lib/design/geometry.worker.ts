import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { createGeometryEngine } from "./geometry.ts";
import { exportDesign } from "./export.ts";
import type { EngineRequest, EngineResponse } from "./protocol.ts";

const engine = Module({ locateFile: () => wasmUrl }).then((module) => {
  module.setup();
  return createGeometryEngine(module);
});
// Attach rejection handling immediately; each request reports initialization errors too.
void engine.catch(() => {});
const send = (message: EngineResponse, buffers: ArrayBuffer[] = []) => self.postMessage(message, { transfer: buffers });
self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const { id, design, format } = event.data;
  try {
    const build = (await engine).build(design);
    if (format) {
      const bytes = exportDesign(design, build, format);
      send({ id, kind: "export", bytes, format }, [bytes.buffer as ArrayBuffer]);
    } else {
      send({ id, kind: "build", build }, build.parts.flatMap((p) => [p.positions.buffer as ArrayBuffer, p.indices.buffer as ArrayBuffer]));
    }
  } catch (error) {
    send({ id, kind: "error", message: error instanceof Error ? error.message : "形状を生成できませんでした。" });
  }
};
