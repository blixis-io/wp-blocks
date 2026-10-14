// Minimal deterministic ZIP writer (BWB-017). Same input => same bytes with the same Node/zlib build:
// entries sorted by path, fixed DOS timestamp, fixed permissions, UTF-8 names, no extra fields or comments.
import { deflateRawSync, crc32 } from 'node:zlib';

const FIXED_TIME = 0; // 00:00:00
const FIXED_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, the DOS epoch

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

/**
 * @param {{ path: string, data: Buffer, mode: number }[]} entries  POSIX paths without a leading slash
 * @returns {Buffer}
 */
export function createZip(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of sorted) {
    if (seen.has(entry.path)) throw new Error(`duplicate zip entry: ${entry.path}`);
    seen.add(entry.path);
    if (entry.path.startsWith('/') || entry.path.split('/').includes('..'))
      throw new Error(`unsafe zip path: ${entry.path}`);
    const name = Buffer.from(entry.path, 'utf8');
    const isDir = entry.path.endsWith('/');
    const data = isDir ? Buffer.alloc(0) : entry.data;
    const compressed = data.length === 0 ? data : deflateRawSync(data, { level: 9 });
    const method = data.length === 0 ? 0 : 8;
    const crc = data.length === 0 ? 0 : crc32(data);
    const header = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(method),
      u16(FIXED_TIME),
      u16(FIXED_DATE),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    locals.push(header, compressed);
    const mode = isDir ? 0o040755 : 0o100000 | (entry.mode & 0o777);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16((3 << 8) | 20),
        u16(20),
        u16(0x0800),
        u16(method),
        u16(FIXED_TIME),
        u16(FIXED_DATE),
        u32(crc),
        u32(compressed.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32((mode << 16) >>> 0),
        u32(offset),
        name,
      ]),
    );
    offset += header.length + compressed.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(sorted.length),
    u16(sorted.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, central, end]);
}
