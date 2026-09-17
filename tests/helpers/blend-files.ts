import { gzipSync, zstdCompressSync } from "node:zlib";

// Small .blend files written independently from the production reader.
// Only the DNA members the reader needs are defined; offsets follow the DNA rule (members in order, pointers 8 bytes).

type MemberDef = [type: string, name: string];

const PRIMITIVE_SIZES: Record<string, number> = { char: 1, int8_t: 1, short: 2, int: 4, float: 4, int64_t: 8, void: 0 };
const POINTER_BYTES = 8;

const COMMON_STRUCTS: Record<string, MemberDef[]> = {
  ID: [["char", "name[66]"], ["char", "_pad[6]"]],
  ListBase: [["void", "*first"], ["void", "*last"]],
  FileGlobal: [["Scene", "*curscene"], ["ViewLayer", "*cur_view_layer"]],
  Scene: [["ID", "id"], ["ListBase", "view_layers"]],
  ViewLayer: [["ViewLayer", "*next"], ["ViewLayer", "*prev"], ["ListBase", "object_bases"]],
  Base: [["Base", "*next"], ["Base", "*prev"], ["Object", "*object"], ["short", "flag"], ["short", "_pad[3]"]],
  Object: [
    ["ID", "id"], ["short", "type"], ["short", "partype"], ["short", "rotmode"], ["short", "restrictflag"],
    ["Object", "*parent"], ["void", "*data"], ["ListBase", "modifiers"],
    ["float", "loc[3]"], ["float", "dloc[3]"], ["float", "rot[3]"], ["float", "drot[3]"],
    ["float", "quat[4]"], ["float", "dquat[4]"], ["float", "rotAxis[3]"], ["float", "drotAxis[3]"],
    ["float", "rotAngle"], ["float", "drotAngle"], ["float", "size[3]"], ["float", "dscale[3]"],
    ["float", "parentinv[4][4]"],
  ],
  CustomDataLayer: [["int", "type"], ["char", "name[68]"], ["void", "*data"]],
  CustomData: [["CustomDataLayer", "*layers"], ["int", "totlayer"], ["int", "_pad"]],
  Attribute: [["char", "*name"], ["short", "data_type"], ["int8_t", "domain"], ["int8_t", "storage_type"], ["int", "_pad"], ["void", "*data"]],
  AttributeArray: [["void", "*data"], ["void", "*sharing_info"], ["int64_t", "size"]],
  AttributeStorage: [["Attribute", "*dna_attributes"], ["int", "dna_attributes_num"], ["int", "_pad"]],
  ModifierData: [["ModifierData", "*next"], ["ModifierData", "*prev"], ["int", "type"], ["int", "mode"], ["char", "name[64]"]],
  SubsurfModifierData: [
    ["ModifierData", "modifier"], ["short", "subdivType"], ["short", "levels"], ["short", "renderLevels"],
    ["short", "flags"], ["short", "boundary_smooth"], ["short", "_pad"],
  ],
  CollisionModifierData: [["ModifierData", "modifier"]],
  BevelModifierData: [["ModifierData", "modifier"]],
};

const LEGACY_MESH: MemberDef[] = [
  ["ID", "id"], ["int", "totvert"], ["int", "totpoly"], ["int", "totloop"], ["int", "_pad"],
  ["int", "*poly_offset_indices"], ["CustomData", "vdata"], ["CustomData", "ldata"],
];
const ATTRIBUTE_MESH: MemberDef[] = [
  ["ID", "id"], ["int", "totvert"], ["int", "totpoly"], ["int", "totloop"], ["int", "_pad"],
  ["int", "*poly_offset_indices"], ["AttributeStorage", "attribute_storage"], ["CustomData", "vdata"], ["CustomData", "ldata"],
];

const parseName = (raw: string) => ({
  pointer: raw.startsWith("*"),
  count: [...raw.matchAll(/\[(\d+)\]/g)].reduce((product, match) => product * Number(match[1]), 1),
  bare: raw.replace(/^\*+/, "").replace(/\[.*$/, ""),
});

class Dna {
  readonly structs: Record<string, MemberDef[]>;
  readonly lengths = new Map<string, number>();
  constructor(structs: Record<string, MemberDef[]>) {
    this.structs = structs;
    for (const name of Object.keys(structs)) this.length(name);
  }
  length(type: string): number {
    if (type in PRIMITIVE_SIZES) return PRIMITIVE_SIZES[type];
    const known = this.lengths.get(type);
    if (known !== undefined) return known;
    const members = this.structs[type];
    if (!members) throw new Error(`unknown type ${type}`);
    const total = members.reduce((sum, [memberType, raw]) => {
      const name = parseName(raw);
      return sum + (name.pointer ? POINTER_BYTES : this.length(memberType)) * name.count;
    }, 0);
    this.lengths.set(type, total);
    return total;
  }
  // offset and element size of a dotted path such as "id.name" or "modifier.mode"
  member(structName: string, path: string) {
    let type = structName;
    let offset = 0;
    let size = 0;
    let pointer = false;
    let elementType = "";
    for (const part of path.split(".")) {
      let at = 0;
      const members = this.structs[type];
      const found = members.find(([, raw]) => parseName(raw).bare === part);
      if (!found) throw new Error(`${structName}.${path} missing`);
      for (const [memberType, raw] of members) {
        const name = parseName(raw);
        if (name.bare === part) break;
        at += (name.pointer ? POINTER_BYTES : this.length(memberType)) * name.count;
      }
      const name = parseName(found[1]);
      offset += at;
      pointer = name.pointer;
      elementType = found[0];
      size = pointer ? POINTER_BYTES : this.length(found[0]);
      type = found[0];
    }
    return { offset, size, pointer, elementType };
  }
  encode() {
    const types = [...Object.keys(PRIMITIVE_SIZES), ...Object.keys(this.structs)];
    const names: string[] = [];
    for (const members of Object.values(this.structs))
      for (const [, raw] of members) if (!names.includes(raw)) names.push(raw);
    const chunks: Buffer[] = [];
    const tag = (text: string) => chunks.push(Buffer.from(text, "latin1"));
    const int32 = (value: number) => {
      const b = Buffer.alloc(4);
      b.writeInt32LE(value);
      chunks.push(b);
    };
    const pad = () => {
      const length = chunks.reduce((sum, c) => sum + c.length, 0);
      if (length % 4) chunks.push(Buffer.alloc(4 - (length % 4)));
    };
    tag("SDNA");
    tag("NAME");
    int32(names.length);
    for (const name of names) chunks.push(Buffer.from(`${name}\0`, "latin1"));
    pad();
    tag("TYPE");
    int32(types.length);
    for (const type of types) chunks.push(Buffer.from(`${type}\0`, "latin1"));
    pad();
    tag("TLEN");
    const lengths = Buffer.alloc(types.length * 2);
    types.forEach((type, i) => lengths.writeUInt16LE(this.length(type), i * 2));
    chunks.push(lengths);
    pad();
    tag("STRC");
    int32(Object.keys(this.structs).length);
    for (const [structName, members] of Object.entries(this.structs)) {
      const head = Buffer.alloc(4 + members.length * 4);
      head.writeUInt16LE(types.indexOf(structName), 0);
      head.writeUInt16LE(members.length, 2);
      members.forEach(([memberType, raw], i) => {
        head.writeUInt16LE(types.indexOf(memberType), 4 + i * 4);
        head.writeUInt16LE(names.indexOf(raw), 6 + i * 4);
      });
      chunks.push(head);
    }
    return { data: Buffer.concat(chunks), structIndex: (name: string) => Object.keys(this.structs).indexOf(name) };
  }
}

type Block = { code: string; address: bigint; struct: string | null; count: number; data: Buffer };

class StructWriter {
  readonly data: Buffer;
  private readonly dna: Dna;
  private readonly structName: string;
  constructor(dna: Dna, structName: string, count = 1) {
    this.dna = dna;
    this.structName = structName;
    this.data = Buffer.alloc(dna.length(structName) * count);
  }
  private at(path: string, element: number) {
    return element * this.dna.length(this.structName) + this.dna.member(this.structName, path).offset;
  }
  string(path: string, value: string, element = 0) {
    this.data.write(value, this.at(path, element), "utf8");
    return this;
  }
  int8(path: string, value: number, element = 0) {
    this.data.writeInt8(value, this.at(path, element));
    return this;
  }
  int16(path: string, value: number, element = 0) {
    this.data.writeInt16LE(value, this.at(path, element));
    return this;
  }
  int32(path: string, value: number, element = 0) {
    this.data.writeInt32LE(value, this.at(path, element));
    return this;
  }
  int64(path: string, value: number, element = 0) {
    this.data.writeBigInt64LE(BigInt(value), this.at(path, element));
    return this;
  }
  floats(path: string, values: readonly number[], element = 0) {
    values.forEach((value, i) => this.data.writeFloatLE(value, this.at(path, element) + i * 4));
    return this;
  }
  pointer(path: string, address: bigint, element = 0) {
    this.data.writeBigUInt64LE(address, this.at(path, element));
    return this;
  }
}

const floatArray = (values: readonly number[]) => {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => b.writeFloatLE(value, i * 4));
  return b;
};
const intArray = (values: readonly number[]) => {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => b.writeInt32LE(value, i * 4));
  return b;
};

export type TestMesh = { name: string; positions: readonly number[]; faces: readonly (readonly number[])[] };
export type TestModifier = {
  kind: "subsurf" | "collision" | "bevel";
  render?: boolean;
  renderLevels?: number;
  simple?: boolean;
  recursive?: boolean;
  preserveCorners?: boolean;
};
export type TestObject = {
  name: string;
  mesh: TestMesh;
  loc?: readonly number[];
  rot?: readonly number[];
  rotmode?: number;
  quat?: readonly number[];
  // axis x, y, z and the angle (radians), used with rotmode -1
  axisAngle?: readonly number[];
  scale?: readonly number[];
  parent?: string;
  partype?: number;
  parentinv?: readonly number[];
  hiddenInRender?: boolean;
  enabledInViewLayer?: boolean;
  modifiers?: readonly TestModifier[];
};

const OB_MESH = 1;
const OB_HIDE_RENDER = 1 << 2;
const BASE_ENABLED_RENDER = 1 << 7;
const MODE_REALTIME_RENDER = 3;
const MODE_REALTIME_ONLY = 1;
const IDENTITY_4X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Build a .blend with the given mesh objects in one scene and view layer.
 * "legacy" writes a Blender 4.x style file (12-byte header, CustomData layers, unique addresses);
 * "current" writes a Blender 5.0 style file (large block headers, AttributeStorage, DATA addresses reused per ID).
 */
export function buildTestBlend(format: "legacy" | "current", objects: readonly TestObject[]) {
  const dna = new Dna({ ...COMMON_STRUCTS, Mesh: format === "legacy" ? LEGACY_MESH : ATTRIBUTE_MESH });
  const blocks: Block[] = [];
  let nextId = BigInt(0x10000);
  const idAddress = () => (nextId += BigInt(0x1000));
  // Within one ID, DATA blocks get addresses 0x100, 0x110, ... ("current" repeats them in every ID).
  let unique = BigInt(0x9000000);
  let scoped = BigInt(0);
  const dataAddress = () => {
    if (format === "legacy") return (unique += BigInt(0x10));
    return (scoped += BigInt(0x10));
  };
  const startId = () => {
    scoped = BigInt(0x100);
  };
  const push = (code: string, address: bigint, struct: string | null, data: Buffer, count = 1) =>
    blocks.push({ code, address, struct, count, data });

  const meshAddress = new Map<TestMesh, bigint>();
  const objectAddress = new Map<string, bigint>();
  for (const object of objects) objectAddress.set(object.name, idAddress());
  for (const object of objects) if (!meshAddress.has(object.mesh)) meshAddress.set(object.mesh, idAddress());
  const sceneAddress = idAddress();

  // scene with one view layer and a base per object
  startId();
  const viewLayerAddress = dataAddress();
  const baseAddresses = objects.map(() => dataAddress());
  push("GLOB", BigInt(0), "FileGlobal", new StructWriter(dna, "FileGlobal").pointer("curscene", sceneAddress).pointer("cur_view_layer", viewLayerAddress).data);
  push("SC", sceneAddress, "Scene", new StructWriter(dna, "Scene").string("id.name", "SCScene").pointer("view_layers.first", viewLayerAddress).data);
  push("DATA", viewLayerAddress, "ViewLayer", new StructWriter(dna, "ViewLayer").pointer("object_bases.first", baseAddresses[0] ?? BigInt(0)).data);
  objects.forEach((object, i) => {
    const base = new StructWriter(dna, "Base")
      .pointer("next", baseAddresses[i + 1] ?? BigInt(0))
      .pointer("object", objectAddress.get(object.name)!)
      .int16("flag", object.enabledInViewLayer === false ? 0 : BASE_ENABLED_RENDER);
    push("DATA", baseAddresses[i], "Base", base.data);
  });

  for (const object of objects) {
    startId();
    const modifiers = (object.modifiers ?? []).map((modifier) => ({ modifier, address: dataAddress() }));
    const writer = new StructWriter(dna, "Object")
      .string("id.name", `OB${object.name}`)
      .int16("type", OB_MESH)
      .int16("rotmode", object.rotmode ?? 1)
      .int16("restrictflag", object.hiddenInRender ? OB_HIDE_RENDER : 0)
      .int16("partype", object.partype ?? 0)
      .pointer("parent", object.parent ? objectAddress.get(object.parent)! : BigInt(0))
      .pointer("data", meshAddress.get(object.mesh)!)
      .pointer("modifiers.first", modifiers[0]?.address ?? BigInt(0))
      .floats("loc", object.loc ?? [0, 0, 0])
      .floats("rot", object.rot ?? [0, 0, 0])
      .floats("quat", object.quat ?? [1, 0, 0, 0])
      .floats("dquat", [1, 0, 0, 0])
      .floats("rotAxis", object.axisAngle?.slice(0, 3) ?? [0, 1, 0])
      .floats("drotAxis", [0, 1, 0])
      .floats("rotAngle", [object.axisAngle?.[3] ?? 0])
      .floats("size", object.scale ?? [1, 1, 1])
      .floats("dscale", [1, 1, 1])
      .floats("parentinv", object.parentinv ?? IDENTITY_4X4);
    push("OB", objectAddress.get(object.name)!, "Object", writer.data);
    modifiers.forEach(({ modifier, address }, i) => {
      const structName =
        modifier.kind === "subsurf" ? "SubsurfModifierData" : modifier.kind === "collision" ? "CollisionModifierData" : "BevelModifierData";
      const md = new StructWriter(dna, structName)
        .pointer("modifier.next", modifiers[i + 1]?.address ?? BigInt(0))
        .int32("modifier.mode", modifier.render === false ? MODE_REALTIME_ONLY : MODE_REALTIME_RENDER)
        .string("modifier.name", modifier.kind);
      if (modifier.kind === "subsurf") {
        md.int16("subdivType", modifier.simple ? 1 : 0)
          .int16("renderLevels", modifier.renderLevels ?? 1)
          .int16("flags", modifier.recursive ? 1 << 6 : 0)
          .int16("boundary_smooth", modifier.preserveCorners ? 1 : 0);
      }
      push("DATA", address, structName, md.data);
    });
  }

  for (const [mesh, address] of meshAddress) {
    startId();
    const offsets = [0];
    for (const face of mesh.faces) offsets.push(offsets[offsets.length - 1] + face.length);
    const cornerVerts = mesh.faces.flat();
    const offsetsAddress = dataAddress();
    const writer = new StructWriter(dna, "Mesh")
      .string("id.name", `ME${mesh.name}`)
      .int32("totvert", mesh.positions.length / 3)
      .int32("totpoly", mesh.faces.length)
      .int32("totloop", cornerVerts.length)
      .pointer("poly_offset_indices", offsetsAddress);
    const data: [bigint, string | null, Buffer, number][] = [[offsetsAddress, null, intArray(offsets), 1]];
    if (format === "legacy") {
      for (const [custom, name, payload] of [
        ["vdata", "position", floatArray(mesh.positions)],
        ["ldata", ".corner_vert", intArray(cornerVerts)],
      ] as const) {
        const layers = dataAddress();
        const payloadAddress = dataAddress();
        writer.pointer(`${custom}.layers`, layers).int32(`${custom}.totlayer`, 1);
        data.push([layers, "CustomDataLayer", new StructWriter(dna, "CustomDataLayer").string("name", name).pointer("data", payloadAddress).data, 1]);
        data.push([payloadAddress, null, payload, 1]);
      }
    } else {
      const attributes = dataAddress();
      const array = new StructWriter(dna, "Attribute", 2);
      writer.pointer("attribute_storage.dna_attributes", attributes).int32("attribute_storage.dna_attributes_num", 2);
      const entries = [
        ["position", floatArray(mesh.positions), mesh.positions.length / 3],
        [".corner_vert", intArray(cornerVerts), cornerVerts.length],
      ] as const;
      entries.forEach(([name, payload, size], i) => {
        const nameAddress = dataAddress();
        const holder = dataAddress();
        const payloadAddress = dataAddress();
        array.pointer("name", nameAddress, i).pointer("data", holder, i);
        data.push([nameAddress, null, Buffer.from(`${name}\0`, "utf8"), 1]);
        data.push([holder, "AttributeArray", new StructWriter(dna, "AttributeArray").pointer("data", payloadAddress).int64("size", size).data, 1]);
        data.push([payloadAddress, null, payload, 1]);
      });
      data.unshift([attributes, "Attribute", array.data, 2]);
    }
    push("ME", address, "Mesh", writer.data);
    for (const [dataAddr, struct, payload, count] of data) push("DATA", dataAddr, struct, payload, count);
  }

  const { data: dnaData, structIndex } = dna.encode();
  push("DNA1", BigInt(0), null, dnaData);
  push("ENDB", BigInt(0), null, Buffer.alloc(0));

  const header = Buffer.from(format === "legacy" ? "BLENDER-v404" : "BLENDER17-01v0500", "latin1");
  const chunks: Buffer[] = [header];
  for (const block of blocks) {
    const sdna = block.struct ? structIndex(block.struct) : 0;
    const head = Buffer.alloc(format === "legacy" ? 24 : 32);
    head.write(block.code.padEnd(4, "\0"), 0, "latin1");
    if (format === "legacy") {
      head.writeInt32LE(block.data.length, 4);
      head.writeBigUInt64LE(block.address, 8);
      head.writeInt32LE(sdna, 16);
      head.writeInt32LE(block.count, 20);
    } else {
      head.writeInt32LE(sdna, 4);
      head.writeBigUInt64LE(block.address, 8);
      head.writeBigInt64LE(BigInt(block.data.length), 16);
      head.writeBigInt64LE(BigInt(block.count), 24);
    }
    chunks.push(head, block.data);
  }
  return Buffer.concat(chunks);
}

/** zstd seekable format as Blender writes it: independent frames, then a skippable seek table frame */
export function seekableZstd(buf: Buffer, frameBytes: number) {
  const frames: Buffer[] = [];
  const table: Buffer[] = [];
  for (let at = 0; at < buf.length; at += frameBytes) {
    const part = buf.subarray(at, Math.min(buf.length, at + frameBytes));
    const compressed = zstdCompressSync(part);
    frames.push(compressed);
    const entry = Buffer.alloc(8);
    entry.writeUInt32LE(compressed.length, 0);
    entry.writeUInt32LE(part.length, 4);
    table.push(entry);
  }
  const footer = Buffer.alloc(9);
  footer.writeUInt32LE(frames.length, 0);
  footer.writeUInt8(0, 4);
  footer.writeUInt32LE(0x8f92eab1, 5);
  const content = Buffer.concat([...table, footer]);
  const skippable = Buffer.alloc(8);
  skippable.writeUInt32LE(0x184d2a5e, 0);
  skippable.writeUInt32LE(content.length, 4);
  return Buffer.concat([...frames, skippable, content]);
}

export const gzipBlend = (buf: Buffer) => gzipSync(buf);

/** A 2 x 2 x 2 cube centred at the origin, faces winding outward */
export const cubeMesh = (name = "Cube"): TestMesh => ({
  name,
  positions: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
  faces: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ],
});
