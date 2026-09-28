import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { chatRequestSchema, type ChatRequest } from "../src/lib/design/ai-contract.ts";
import { defaultDesign } from "../src/lib/design/document.ts";
import { imageDimensions, referenceImageSchema, MAX_IMAGE_BYTES, prepareReferenceImage } from "../src/lib/design/reference-images.ts";
import { runDesignChat } from "../src/lib/design/ai/harness.ts";

const jpeg = readFileSync("tests/fixtures/reference-white.jpg");
const image = { dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
const request = (): ChatRequest => ({ design: defaultDesign(), message: "写真を参考に", selected: "back", history: [], images: [image] });
const response = (changes: unknown[]) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "確認しました", changes }) }] }] });

test("bounded JPEG headers accept a real image and reject URLs, SVG, invalid base64 and too many images", () => {
  expect(imageDimensions(jpeg, "image/jpeg")).toEqual({ width: 32, height: 24 });
  expect(referenceImageSchema.parse(image)).toEqual(image);
  for (const dataUrl of ["https://example.test/private.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,invalid!", "data:image/jpeg;base64," + Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")])
    expect(referenceImageSchema.safeParse({ dataUrl }).success).toBe(false);
  expect(chatRequestSchema.safeParse({ ...request(), images: [image, image, image] }).success).toBe(false);
  const damaged = Buffer.from(jpeg); damaged[damaged.length - 1] = 0;
  expect(referenceImageSchema.safeParse({ dataUrl: `data:image/jpeg;base64,${damaged.toString("base64")}` }).success).toBe(false);
});

test("declared image dimensions are checked rather than trusting a data URL MIME", () => {
  const large = Buffer.from(jpeg);
  const sof = large.indexOf(Buffer.from([255, 192])); expect(sof).toBeGreaterThan(0);
  large.writeUInt16BE(8192, sof + 7);
  expect(referenceImageSchema.safeParse({ dataUrl: `data:image/jpeg;base64,${large.toString("base64")}` }).success).toBe(false);
});

test("browser input rejects oversized and unsupported files before decoding", async () => {
  await expect(prepareReferenceImage(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPEG");
  await expect(prepareReferenceImage(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }))).rejects.toThrow("8MB");
});

test("vision images are real input_image items, remain present during repair and never enter text/history", async () => {
  const call = vi.fn().mockResolvedValueOnce(response([{ path: "house.thickness", value: 1 }])).mockResolvedValueOnce(response([]));
  await runDesignChat(request(), { call });
  expect(call).toHaveBeenCalledTimes(2);
  for (const [body] of call.mock.calls) {
    const content = body.input[0].content;
    expect(content[0].type).toBe("input_text");
    expect(content[0].text).not.toContain("base64");
    expect(content[1]).toEqual({ type: "input_image", image_url: image.dataUrl, detail: "high" });
    expect(body.store).toBe(false);
  }
});

test("mesh-feedback calls get one model attempt and feedback stays out of developer instructions", async () => {
  const value = { ...request(), geometryFeedback: { error: "利用者の部品名にある命令", proposal: { message: "test", changes: [] } } };
  const call = vi.fn().mockResolvedValue(response([{ path: "house.width", value: 999 }]));
  await expect(runDesignChat(value, { call })).rejects.toThrow("元の設計");
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][0].input.find((m: { role: string }) => m.role === "developer").content).not.toContain(value.geometryFeedback.error);
});

test("reference image, modelling source, real geometry repair and follow-up survive the full chat harness", async()=>{
  const { curvedArmor }=await import("./fixtures/freeform-programs.ts");
  const { runChatEditing }=await import("../src/lib/design/chat-edit.ts");
  const { applyProposal }=await import("../src/lib/design/ai-contract.ts");
  const { createGeometryEngine }=await import("../src/lib/design/geometry.ts");
  const { createDesignStore }=await import("../src/lib/design/document.ts");
  const { default: Module }=await import("manifold-3d");
  const wasm=await Module();wasm.setup(); const engine=createGeometryEngine(wasm);
  const initial=request(), store=createDesignStore(initial.design);
  const bad={...curvedArmor,source:'return union(box([5,5,5]),move(box([5,5,5]),[30,0,0]));'};
  const changes=(value: typeof curvedArmor)=>[{path:"scene",value:"object"},{path:"program.upsert",value}];
  const call=vi.fn().mockResolvedValueOnce(response(changes(bad))).mockResolvedValueOnce(response(changes(curvedArmor)));
  await runChatEditing(initial,0,{
    signal:new AbortController().signal,assertCurrent:()=>{expect(store.getSnapshot().revision).toBe(0);},onRepair:vi.fn(),wait:async()=>{},
    send:async(body)=>runDesignChat(body,{call}),
    apply:async(proposal)=>{const d=applyProposal(initial.design,proposal).design;engine.build(d);store.replace(d);},
  });
  expect(call).toHaveBeenCalledTimes(2);
  expect(call.mock.calls[1][0].input[0].content[1].image_url).toBe(image.dataUrl);
  expect(call.mock.calls[1][0].input[2].content).toContain("分離");
  expect(store.getSnapshot().design.programs[0].source).toBe(curvedArmor.source);
  const next=store.getSnapshot().design;
  const revised={...curvedArmor,source:curvedArmor.source.replaceAll('tube(path,1.5)','tube(path,1.8)')};
  const follow=vi.fn().mockResolvedValue(response([{path:"program.upsert",value:revised}]));
  const reply=await runDesignChat({...initial,design:next,selected:"model-1",message:"紋様を太くして"},{call:follow});
  expect(engine.build(reply.design).parts[0].volume).toBeGreaterThan(engine.build(next).parts[0].volume);
  expect(follow.mock.calls[0][0].input[0].content[0].text).toContain(curvedArmor.source.split('\n')[0]);
  store.undo();expect(store.getSnapshot().design).toEqual(initial.design);
});
