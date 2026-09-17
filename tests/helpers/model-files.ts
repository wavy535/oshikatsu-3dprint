import { crc32, deflateRawSync } from "node:zlib";

// A small, complete ZIP fixture written independently from the production reader.
// Entries are stored in the given order; the central directory follows all local entries.
export function modelPackage(files: Record<string, string>, compressed = true) {
  const locals: Buffer[] = [];
  const directories: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path);
    const source = Buffer.from(text);
    const payload = compressed ? deflateRawSync(source) : source;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(compressed ? 8 : 0, 8);
    header.writeUInt32LE(crc32(source), 14);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(source.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(compressed ? 8 : 0, 10);
    directory.writeUInt32LE(crc32(source), 16);
    directory.writeUInt32LE(payload.length, 20);
    directory.writeUInt32LE(source.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(header, name, payload);
    directories.push(directory, name);
    offset += header.length + name.length + payload.length;
  }
  const count = Object.keys(files).length;
  const directorySize = directories.reduce((size, part) => size + part.length, 0);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(count, 8);
  footer.writeUInt16LE(count, 10);
  footer.writeUInt32LE(directorySize, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...directories, footer]);
}

export function modelZip(xml: string, compressed = true) {
  return modelPackage({ "3D/3dmodel.model": xml }, compressed);
}

export const tetrahedronMesh = `<mesh><vertices>
<vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/>
<vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
</vertices><triangles><triangle v1="0" v2="2" v3="1"/>
<triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/>
<triangle v1="1" v2="2" v3="3"/></triangles></mesh>`;

export function modelXml(
  resources = `<object id="1">${tetrahedronMesh}</object>`,
  build = '<item objectid="1"/>',
) {
  return `<?xml version="1.0"?><model unit="millimeter"><resources>${resources}</resources><build>${build}</build></model>`;
}

export const PRODUCTION_NAMESPACE =
  'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';

// Bambu Studio style: the root model only holds components that point into another model file.
export function productionModelXml(
  resources: string,
  build: string,
  namespace = PRODUCTION_NAMESPACE,
  unit = "millimeter",
) {
  return `<?xml version="1.0"?><model unit="${unit}" ${namespace} requiredextensions="p"><resources>${resources}</resources><build>${build}</build></model>`;
}

export function bambuStylePackage(options: { componentTransform?: string; itemTransform?: string } = {}) {
  const componentTransform = options.componentTransform ?? "1 0 0 0 1 0 0 0 1 0 0 0";
  const itemTransform = options.itemTransform ?? "1 0 0 0 1 0 0 0 1 0 0 0";
  return modelPackage({
    "3D/3dmodel.model": productionModelXml(
      `<object id="2" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="${componentTransform}"/></components></object>`,
      `<item objectid="2" transform="${itemTransform}" printable="1"/>`,
    ),
    "3D/Objects/object_1.model": productionModelXml(
      `<object id="1" type="model">${tetrahedronMesh}</object>`,
      "",
    ).replace("<build></build>", "<build/>"),
  });
}
