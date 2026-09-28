import type { Design } from "./document.ts";
import type { DesignBuild } from "./geometry.ts";
import type { ExportFormat } from "./export.ts";

export type EngineRequest = { id: number; design: Design; format?: ExportFormat };
export type EngineResponse =
  | { id: number; kind: "build"; build: DesignBuild }
  | { id: number; kind: "export"; bytes: Uint8Array; format: ExportFormat }
  | { id: number; kind: "error"; message: string; repairable?: boolean };
