import { crc32, deflateRawSync } from "node:zlib";

// A small, complete ZIP fixture written independently from the production reader.
export function modelZip(xml: string, compressed = true) {
  const name = Buffer.from("3D/3dmodel.model");
  const source = Buffer.from(xml);
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
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(1, 8);
  footer.writeUInt16LE(1, 10);
  footer.writeUInt32LE(directory.length + name.length, 12);
  footer.writeUInt32LE(header.length + name.length + payload.length, 16);
  return Buffer.concat([header, name, payload, directory, name, footer]);
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
