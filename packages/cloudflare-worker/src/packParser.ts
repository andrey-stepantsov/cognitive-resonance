/**
 * Git packfile parser and builder for Cloudflare Workers.
 *
 * Packfile format (v2):
 *   Header:  'PACK' (4 bytes) | version (4 bytes BE) | numObjects (4 bytes BE)
 *   Objects: [type+size varint | compressed data] × numObjects
 *   Trailer: 20-byte SHA1 checksum of everything before it
 *
 * Object type encoding (3-bit field in the first varint):
 *   1 = commit, 2 = tree, 3 = blob, 4 = tag
 *   6 = ofs_delta, 7 = ref_delta  (deltified — resolved against base)
 */

// ─── Types ───────────────────────────────────────────────────────

export interface GitObject {
  sha: string;
  type: GitObjectType;
  data: Uint8Array;
}

export type GitObjectType = 'commit' | 'tree' | 'blob' | 'tag';

const TYPE_MAP: Record<number, GitObjectType> = {
  1: 'commit',
  2: 'tree',
  3: 'blob',
  4: 'tag',
};

// ─── Helpers ─────────────────────────────────────────────────────

/** SHA-1 hash using Web Crypto, returns hex string. */
async function sha1hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compute the git object SHA: sha1("type size\0" + data). */
export async function gitObjectSha(type: GitObjectType, data: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`${type} ${data.length}\0`);
  const full = new Uint8Array(header.length + data.length);
  full.set(header);
  full.set(data, header.length);
  return sha1hex(full);
}

/**
 * Inflate (decompress) zlib-wrapped data using the Web Streams API.
 * Git packfile objects are compressed with zlib (deflate with header).
 *
 * We need to handle the raw deflate stream ourselves because the Workers
 * DecompressionStream only supports 'deflate' (with zlib wrapper) and
 * 'deflate-raw'. Git packfiles use raw deflate (no zlib header).
 */
async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writePromise = writer.write(compressed).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  await writePromise;

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Deflate data for building packfiles.
 */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  const writePromise = writer.write(data).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  await writePromise;

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ─── Pack Parser ─────────────────────────────────────────────────

/**
 * Read a git varint-encoded type+size from the pack data.
 * Returns [type (3 bits), uncompressed size, bytes consumed].
 *
 * Encoding: first byte = MSB-continuation | type(3 bits) | size(4 bits)
 * subsequent bytes = MSB-continuation | size(7 bits)
 */
function readTypeAndSize(data: Uint8Array, offset: number): [number, number, number] {
  let byte = data[offset];
  const type = (byte >> 4) & 0x07;
  let size = byte & 0x0f;
  let shift = 4;
  let consumed = 1;

  while (byte & 0x80) {
    byte = data[offset + consumed];
    size |= (byte & 0x7f) << shift;
    shift += 7;
    consumed++;
  }

  return [type, size, consumed];
}

/**
 * Inflate the zlib-compressed data starting at offset in the buffer.
 * Returns [decompressed data, number of compressed bytes consumed].
 *
 * Since zlib streams are self-terminating, feeding extra trailing bytes
 * to DecompressionStream is safe — the decompressor stops at the stream end.
 * To determine compressed size, we re-deflate and measure the output.
 */
async function inflateWithConsumed(data: Uint8Array, offset: number, expectedSize: number): Promise<[Uint8Array, number]> {
  // Feed the entire remaining buffer to the decompressor
  const remaining = data.slice(offset);
  const inflated = await inflate(remaining);
  const result = inflated.slice(0, expectedSize);

  // Determine how many compressed bytes were consumed:
  // Re-deflate the result and use that size as the compressed frame size.
  // This works because deflate is deterministic for the same input.
  const recompressed = await deflate(result);
  return [result, recompressed.length];
}

/**
 * Parse a git packfile and extract all objects.
 *
 * Currently handles non-deltified objects (commit, tree, blob, tag).
 * OFS_DELTA and REF_DELTA objects are resolved if their base is within
 * the same pack.
 */
export async function parsePackfile(packData: ArrayBuffer): Promise<GitObject[]> {
  const data = new Uint8Array(packData);
  const view = new DataView(packData);

  // Validate header: 'PACK'
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'PACK') {
    throw new Error(`Invalid packfile: expected 'PACK' header, got '${magic}'`);
  }

  const version = view.getUint32(4);
  if (version !== 2 && version !== 3) {
    throw new Error(`Unsupported packfile version: ${version}`);
  }

  const numObjects = view.getUint32(8);
  const objects: GitObject[] = [];
  // Map from pack offset → decoded object (for ofs_delta resolution)
  const objectsByOffset = new Map<number, GitObject>();

  let offset = 12; // after 12-byte header

  for (let i = 0; i < numObjects; i++) {
    const entryOffset = offset;
    const [type, expectedSize, headerBytes] = readTypeAndSize(data, offset);
    offset += headerBytes;

    if (type >= 1 && type <= 4) {
      // Non-deltified object
      const [inflated, compressedBytes] = await inflateWithConsumed(data, offset, expectedSize);
      offset += compressedBytes;

      const objType = TYPE_MAP[type];
      const objData = inflated.slice(0, expectedSize);
      const sha = await gitObjectSha(objType, objData);

      const obj: GitObject = { sha, type: objType, data: objData };
      objects.push(obj);
      objectsByOffset.set(entryOffset, obj);

    } else if (type === 6) {
      // OFS_DELTA: base is at a negative offset within this pack
      let byte = data[offset];
      let negOffset = byte & 0x7f;
      let deltaHeaderBytes = 1;
      while (byte & 0x80) {
        byte = data[offset + deltaHeaderBytes];
        negOffset = ((negOffset + 1) << 7) | (byte & 0x7f);
        deltaHeaderBytes++;
      }
      offset += deltaHeaderBytes;

      const [deltaData, compressedBytes] = await inflateWithConsumed(data, offset, expectedSize);
      offset += compressedBytes;

      const baseOffset = entryOffset - negOffset;
      const baseObj = objectsByOffset.get(baseOffset);
      if (!baseObj) {
        console.warn(`[packParser] OFS_DELTA base at offset ${baseOffset} not found, skipping`);
        continue;
      }

      const resolved = applyDelta(baseObj.data, deltaData.slice(0, expectedSize));
      const sha = await gitObjectSha(baseObj.type, resolved);
      const obj: GitObject = { sha, type: baseObj.type, data: resolved };
      objects.push(obj);
      objectsByOffset.set(entryOffset, obj);

    } else if (type === 7) {
      // REF_DELTA: base is referenced by SHA
      const baseShaBytes = data.slice(offset, offset + 20);
      const baseSha = Array.from(baseShaBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      offset += 20;

      const [deltaData, compressedBytes] = await inflateWithConsumed(data, offset, expectedSize);
      offset += compressedBytes;

      const baseObj = objects.find((o) => o.sha === baseSha);
      if (!baseObj) {
        console.warn(`[packParser] REF_DELTA base ${baseSha} not found in pack, skipping`);
        continue;
      }

      const resolved = applyDelta(baseObj.data, deltaData.slice(0, expectedSize));
      const sha = await gitObjectSha(baseObj.type, resolved);
      objects.push({ sha, type: baseObj.type, data: resolved });

    } else {
      throw new Error(`Unknown pack object type: ${type} at offset ${entryOffset}`);
    }
  }

  return objects;
}

// ─── Delta Application ───────────────────────────────────────────

/**
 * Read a variable-length integer from delta data.
 * Returns [value, bytes consumed].
 */
function readDeltaVarInt(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let consumed = 0;
  let byte: number;

  do {
    byte = data[offset + consumed];
    value |= (byte & 0x7f) << shift;
    shift += 7;
    consumed++;
  } while (byte & 0x80);

  return [value, consumed];
}

/**
 * Apply a git delta to a base object, producing the result object.
 *
 * Delta format:
 *   - Base object size (varint)
 *   - Result object size (varint)
 *   - Instructions:
 *     - Copy: MSB=1, followed by offset/size bytes (copy from base)
 *     - Insert: MSB=0, byte = count of literal bytes to insert
 */
function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  let dOffset = 0;

  // Read base size (for validation)
  const [_baseSize, baseSizeBytes] = readDeltaVarInt(delta, dOffset);
  dOffset += baseSizeBytes;

  // Read result size
  const [resultSize, resultSizeBytes] = readDeltaVarInt(delta, dOffset);
  dOffset += resultSizeBytes;

  const result = new Uint8Array(resultSize);
  let rOffset = 0;

  while (dOffset < delta.length) {
    const cmd = delta[dOffset++];

    if (cmd & 0x80) {
      // Copy instruction
      let copyOffset = 0;
      let copySize = 0;

      if (cmd & 0x01) copyOffset = delta[dOffset++];
      if (cmd & 0x02) copyOffset |= delta[dOffset++] << 8;
      if (cmd & 0x04) copyOffset |= delta[dOffset++] << 16;
      if (cmd & 0x08) copyOffset |= delta[dOffset++] << 24;

      if (cmd & 0x10) copySize = delta[dOffset++];
      if (cmd & 0x20) copySize |= delta[dOffset++] << 8;
      if (cmd & 0x40) copySize |= delta[dOffset++] << 16;

      if (copySize === 0) copySize = 0x10000;

      result.set(base.slice(copyOffset, copyOffset + copySize), rOffset);
      rOffset += copySize;

    } else if (cmd > 0) {
      // Insert instruction
      result.set(delta.slice(dOffset, dOffset + cmd), rOffset);
      rOffset += cmd;
      dOffset += cmd;
    } else {
      // cmd === 0 is reserved
      throw new Error('Unexpected delta opcode 0');
    }
  }

  return result;
}

// ─── Pack Builder ────────────────────────────────────────────────

/**
 * Encode the type+size varint for a pack entry.
 */
function encodeTypeAndSize(type: number, size: number): Uint8Array {
  const bytes: number[] = [];
  let byte = (type << 4) | (size & 0x0f);
  size >>= 4;

  while (size > 0) {
    bytes.push(byte | 0x80);
    byte = size & 0x7f;
    size >>= 7;
  }

  bytes.push(byte);
  return new Uint8Array(bytes);
}

const REVERSE_TYPE_MAP: Record<GitObjectType, number> = {
  commit: 1,
  tree: 2,
  blob: 3,
  tag: 4,
};

/**
 * Build a git packfile from a set of loose objects.
 * Returns a valid packfile (with header and SHA-1 trailer).
 */
export async function buildPackfile(objects: GitObject[]): Promise<Uint8Array> {
  // Compress all objects first to know total size
  const entries: { header: Uint8Array; compressed: Uint8Array }[] = [];

  for (const obj of objects) {
    const typeNum = REVERSE_TYPE_MAP[obj.type];
    const header = encodeTypeAndSize(typeNum, obj.data.length);
    const compressed = await deflate(obj.data);
    entries.push({ header, compressed });
  }

  // Calculate total size: 12 (header) + entries + 20 (SHA-1 trailer)
  let bodySize = 0;
  for (const entry of entries) {
    bodySize += entry.header.length + entry.compressed.length;
  }

  const totalSize = 12 + bodySize + 20;
  const pack = new Uint8Array(totalSize);
  const packView = new DataView(pack.buffer);

  // Write header
  pack[0] = 0x50; // P
  pack[1] = 0x41; // A
  pack[2] = 0x43; // C
  pack[3] = 0x4b; // K
  packView.setUint32(4, 2); // version 2
  packView.setUint32(8, objects.length);

  // Write entries
  let offset = 12;
  for (const entry of entries) {
    pack.set(entry.header, offset);
    offset += entry.header.length;
    pack.set(entry.compressed, offset);
    offset += entry.compressed.length;
  }

  // Compute and append SHA-1 trailer (hash of everything before the trailer)
  const hashInput = pack.slice(0, offset);
  const hashBuffer = await crypto.subtle.digest('SHA-1', hashInput);
  pack.set(new Uint8Array(hashBuffer), offset);

  return pack;
}

// ─── Pkt-line Utilities ──────────────────────────────────────────

/**
 * Parse the pkt-line command sent before the packfile in a receive-pack request.
 *
 * Format: <4-hex-length><old-sha> <new-sha> <refname>\0<capabilities>\n
 * Followed by 0000 flush, then the packfile data.
 *
 * Returns the parsed command(s) and the offset where packfile data starts.
 */
export interface ReceivePackCommand {
  oldSha: string;
  newSha: string;
  refName: string;
}

export function parseReceivePackInput(data: Uint8Array): { commands: ReceivePackCommand[]; packOffset: number } {
  const commands: ReceivePackCommand[] = [];
  let offset = 0;
  const decoder = new TextDecoder();

  while (offset < data.length) {
    // Read 4-hex length
    const lenHex = decoder.decode(data.slice(offset, offset + 4));
    const len = parseInt(lenHex, 16);

    if (len === 0) {
      // Flush packet — packfile starts after this
      offset += 4;
      break;
    }

    // Read the pkt-line content (len includes the 4-byte length prefix)
    const lineData = decoder.decode(data.slice(offset + 4, offset + len));
    offset += len;

    // Parse: "<old-sha> <new-sha> <refname>\0<caps>\n"
    const nullIdx = lineData.indexOf('\0');
    const commandPart = nullIdx >= 0 ? lineData.substring(0, nullIdx) : lineData.trimEnd();
    const parts = commandPart.split(' ');

    if (parts.length >= 3) {
      commands.push({
        oldSha: parts[0],
        newSha: parts[1],
        refName: parts[2],
      });
    }
  }

  return { commands, packOffset: offset };
}

/**
 * Parse want/have lines from a git-upload-pack POST body.
 * Returns sets of wanted and have SHAs.
 */
export function parseWantHaveLines(data: Uint8Array): { wants: string[]; haves: string[]; done: boolean } {
  const wants: string[] = [];
  const haves: string[] = [];
  let done = false;
  let offset = 0;
  const decoder = new TextDecoder();

  while (offset < data.length) {
    const lenHex = decoder.decode(data.slice(offset, offset + 4));
    const len = parseInt(lenHex, 16);

    if (len === 0) {
      offset += 4;
      continue;
    }

    if (isNaN(len) || len < 4) break;

    const line = decoder.decode(data.slice(offset + 4, offset + len)).trimEnd();
    offset += len;

    if (line.startsWith('want ')) {
      const sha = line.split(' ')[1];
      if (sha) wants.push(sha);
    } else if (line.startsWith('have ')) {
      const sha = line.split(' ')[1];
      if (sha) haves.push(sha);
    } else if (line === 'done') {
      done = true;
    }
  }

  return { wants, haves, done };
}

// ─── Object Graph Walking ────────────────────────────────────────

/**
 * Parse a git commit object to extract referenced SHAs.
 * Returns { tree: sha, parents: sha[] }.
 *
 * Commit format (text):
 *   tree <sha>\n
 *   parent <sha>\n      (zero or more)
 *   author ...\n
 *   committer ...\n
 *   \n
 *   <message>
 */
export function parseCommitRefs(data: Uint8Array): { tree: string; parents: string[] } {
  const text = new TextDecoder().decode(data);
  const lines = text.split('\n');
  let tree = '';
  const parents: string[] = [];

  for (const line of lines) {
    if (line.startsWith('tree ')) {
      tree = line.slice(5).trim();
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7).trim());
    } else if (line === '' || line.startsWith('author ')) {
      break; // Past the header
    }
  }

  return { tree, parents };
}

/**
 * Parse a git tree object to extract entry SHAs.
 * Returns array of { mode, name, sha }.
 *
 * Tree format (binary):
 *   [mode(ASCII) SP name(ASCII) NUL sha(20 bytes raw)] × entries
 */
export function parseTreeEntries(data: Uint8Array): { mode: string; name: string; sha: string }[] {
  const entries: { mode: string; name: string; sha: string }[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Find the space after mode
    let spaceIdx = offset;
    while (spaceIdx < data.length && data[spaceIdx] !== 0x20) spaceIdx++;
    const mode = new TextDecoder().decode(data.slice(offset, spaceIdx));

    // Find the null after name
    let nullIdx = spaceIdx + 1;
    while (nullIdx < data.length && data[nullIdx] !== 0x00) nullIdx++;
    const name = new TextDecoder().decode(data.slice(spaceIdx + 1, nullIdx));

    // Next 20 bytes are the raw SHA
    const shaBytes = data.slice(nullIdx + 1, nullIdx + 21);
    const sha = Array.from(shaBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    entries.push({ mode, name, sha });
    offset = nullIdx + 21;
  }

  return entries;
}

/**
 * Extract all SHAs referenced by a git object.
 * - commit → tree + parents
 * - tree → entries (blobs + subtrees)
 * - blob/tag → [] (no refs)
 */
export function extractObjectRefs(obj: GitObject): string[] {
  if (obj.type === 'commit') {
    const { tree, parents } = parseCommitRefs(obj.data);
    return [tree, ...parents].filter(Boolean);
  }
  if (obj.type === 'tree') {
    return parseTreeEntries(obj.data).map((e) => e.sha);
  }
  return [];
}
