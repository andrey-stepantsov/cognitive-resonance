import { describe, it, expect } from 'vitest';
import {
  parsePackfile,
  buildPackfile,
  gitObjectSha,
  parseReceivePackInput,
  parseWantHaveLines,
  parseCommitRefs,
  parseTreeEntries,
  extractObjectRefs,
  type GitObject,
} from '../packParser';

describe('packParser', () => {
  describe('gitObjectSha', () => {
    it('computes correct SHA for a known blob', async () => {
      const data = new TextEncoder().encode('hello world\n');
      const sha = await gitObjectSha('blob', data);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(sha).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad');
    });

    it('computes different SHA for different types', async () => {
      const data = new TextEncoder().encode('test');
      const blobSha = await gitObjectSha('blob', data);
      const commitSha = await gitObjectSha('commit', data);
      expect(blobSha).not.toBe(commitSha);
    });
  });

  describe('parsePackfile + buildPackfile round-trip', () => {
    it('round-trips a single blob object', async () => {
      const blobData = new TextEncoder().encode('Hello from packParser test!');
      const blobSha = await gitObjectSha('blob', blobData);
      const original: GitObject = { sha: blobSha, type: 'blob', data: blobData };

      const pack = await buildPackfile([original]);
      expect(String.fromCharCode(pack[0], pack[1], pack[2], pack[3])).toBe('PACK');
      const view = new DataView(pack.buffer);
      expect(view.getUint32(4)).toBe(2);
      expect(view.getUint32(8)).toBe(1);

      const parsed = await parsePackfile(pack.buffer);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].sha).toBe(blobSha);
      expect(parsed[0].type).toBe('blob');
      expect(new TextDecoder().decode(parsed[0].data)).toBe('Hello from packParser test!');
    });

    it('round-trips multiple objects of different types', async () => {
      const blob = {
        sha: await gitObjectSha('blob', new TextEncoder().encode('file content')),
        type: 'blob' as const,
        data: new TextEncoder().encode('file content'),
      };
      const treeData = new TextEncoder().encode('100644 file.txt\0' + 'A'.repeat(20));
      const tree = {
        sha: await gitObjectSha('tree', treeData),
        type: 'tree' as const,
        data: treeData,
      };
      const commitData = new TextEncoder().encode(
        `tree ${tree.sha}\nauthor Test <test@test.com> 1000 +0000\ncommitter Test <test@test.com> 1000 +0000\n\ntest commit\n`
      );
      const commit = {
        sha: await gitObjectSha('commit', commitData),
        type: 'commit' as const,
        data: commitData,
      };

      const pack = await buildPackfile([blob, tree, commit]);
      const parsed = await parsePackfile(pack.buffer);
      expect(parsed).toHaveLength(3);
      expect(parsed.map((o) => o.type).sort()).toEqual(['blob', 'commit', 'tree']);
      expect(parsed.map((o) => o.sha).sort()).toEqual([blob.sha, tree.sha, commit.sha].sort());
    });

    it('handles empty data blob', async () => {
      const emptyData = new Uint8Array(0);
      const sha = await gitObjectSha('blob', emptyData);
      const obj: GitObject = { sha, type: 'blob', data: emptyData };

      const pack = await buildPackfile([obj]);
      const parsed = await parsePackfile(pack.buffer);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].sha).toBe(sha);
      expect(parsed[0].data.length).toBe(0);
    });
  });

  describe('parsePackfile error handling', () => {
    it('throws on invalid magic header', async () => {
      const badPack = new TextEncoder().encode('NOTAPACK');
      await expect(parsePackfile(badPack.buffer)).rejects.toThrow('Invalid packfile');
    });

    it('throws on unsupported version', async () => {
      const pack = new Uint8Array(12);
      pack[0] = 0x50; pack[1] = 0x41; pack[2] = 0x43; pack[3] = 0x4b;
      const view = new DataView(pack.buffer);
      view.setUint32(4, 99);
      view.setUint32(8, 0);
      await expect(parsePackfile(pack.buffer)).rejects.toThrow('Unsupported packfile version');
    });

    it('handles pack with zero objects', async () => {
      const header = new Uint8Array(12);
      header[0] = 0x50; header[1] = 0x41; header[2] = 0x43; header[3] = 0x4b;
      const view = new DataView(header.buffer);
      view.setUint32(4, 2);
      view.setUint32(8, 0);
      const hash = await crypto.subtle.digest('SHA-1', header);
      const full = new Uint8Array(32);
      full.set(header);
      full.set(new Uint8Array(hash), 12);
      const parsed = await parsePackfile(full.buffer);
      expect(parsed).toHaveLength(0);
    });
  });

  describe('parseReceivePackInput', () => {
    it('parses a single command line', () => {
      const oldSha = '0'.repeat(40);
      const newSha = 'a'.repeat(40);
      const line = `${oldSha} ${newSha} refs/heads/main\0report-status\n`;
      const lenHex = (line.length + 4).toString(16).padStart(4, '0');
      const input = new TextEncoder().encode(`${lenHex}${line}0000PACKDATA`);
      const { commands, packOffset } = parseReceivePackInput(input);
      expect(commands).toHaveLength(1);
      expect(commands[0].oldSha).toBe(oldSha);
      expect(commands[0].newSha).toBe(newSha);
      expect(commands[0].refName).toBe('refs/heads/main');
      expect(packOffset).toBe(lenHex.length + line.length + 4);
    });

    it('handles empty input gracefully', () => {
      const input = new TextEncoder().encode('0000');
      const { commands, packOffset } = parseReceivePackInput(input);
      expect(commands).toHaveLength(0);
      expect(packOffset).toBe(4);
    });
  });

  describe('parseWantHaveLines', () => {
    it('parses want and have lines', () => {
      const wantSha = 'a'.repeat(40);
      const haveSha = 'b'.repeat(40);
      const wantLine = `want ${wantSha}\n`;
      const wantLen = (wantLine.length + 4).toString(16).padStart(4, '0');
      const haveLine = `have ${haveSha}\n`;
      const haveLen = (haveLine.length + 4).toString(16).padStart(4, '0');
      const doneLine = 'done\n';
      const doneLen = (doneLine.length + 4).toString(16).padStart(4, '0');
      const input = new TextEncoder().encode(
        `${wantLen}${wantLine}0000${haveLen}${haveLine}${doneLen}${doneLine}0000`
      );
      const { wants, haves, done } = parseWantHaveLines(input);
      expect(wants).toEqual([wantSha]);
      expect(haves).toEqual([haveSha]);
      expect(done).toBe(true);
    });

    it('handles wants only (no haves)', () => {
      const wantSha = 'c'.repeat(40);
      const wantLine = `want ${wantSha}\n`;
      const wantLen = (wantLine.length + 4).toString(16).padStart(4, '0');
      const doneLine = 'done\n';
      const doneLen = (doneLine.length + 4).toString(16).padStart(4, '0');
      const input = new TextEncoder().encode(
        `${wantLen}${wantLine}0000${doneLen}${doneLine}0000`
      );
      const { wants, haves, done } = parseWantHaveLines(input);
      expect(wants).toEqual([wantSha]);
      expect(haves).toEqual([]);
      expect(done).toBe(true);
    });
  });

  // ─── Graph Walking ──────────────────────────────────────────────

  describe('parseCommitRefs', () => {
    it('extracts tree and parent SHAs from a commit', () => {
      const treeSha = 'a'.repeat(40);
      const parentSha = 'b'.repeat(40);
      const data = new TextEncoder().encode(
        `tree ${treeSha}\nparent ${parentSha}\nauthor Test <t@t> 1000 +0000\ncommitter Test <t@t> 1000 +0000\n\ncommit message\n`
      );
      const { tree, parents } = parseCommitRefs(data);
      expect(tree).toBe(treeSha);
      expect(parents).toEqual([parentSha]);
    });

    it('handles root commit (no parents)', () => {
      const treeSha = 'c'.repeat(40);
      const data = new TextEncoder().encode(
        `tree ${treeSha}\nauthor Test <t@t> 1000 +0000\ncommitter Test <t@t> 1000 +0000\n\ninitial commit\n`
      );
      const { tree, parents } = parseCommitRefs(data);
      expect(tree).toBe(treeSha);
      expect(parents).toEqual([]);
    });

    it('handles merge commit (multiple parents)', () => {
      const treeSha = 'd'.repeat(40);
      const parent1 = 'e'.repeat(40);
      const parent2 = 'f'.repeat(40);
      const data = new TextEncoder().encode(
        `tree ${treeSha}\nparent ${parent1}\nparent ${parent2}\nauthor Test <t@t> 1000 +0000\n\nmerge\n`
      );
      const { tree, parents } = parseCommitRefs(data);
      expect(tree).toBe(treeSha);
      expect(parents).toEqual([parent1, parent2]);
    });
  });

  describe('parseTreeEntries', () => {
    it('extracts entries from a binary tree object', () => {
      const sha = new Uint8Array(20).fill(0xab);
      const expectedShaHex = Array.from(sha).map(b => b.toString(16).padStart(2, '0')).join('');
      const modeAndName = new TextEncoder().encode('100644 hello.txt\0');
      const treeData = new Uint8Array(modeAndName.length + 20);
      treeData.set(modeAndName);
      treeData.set(sha, modeAndName.length);

      const entries = parseTreeEntries(treeData);
      expect(entries).toHaveLength(1);
      expect(entries[0].mode).toBe('100644');
      expect(entries[0].name).toBe('hello.txt');
      expect(entries[0].sha).toBe(expectedShaHex);
    });

    it('handles multiple entries', () => {
      const sha1 = new Uint8Array(20).fill(0x01);
      const sha2 = new Uint8Array(20).fill(0x02);
      const entry1 = new TextEncoder().encode('100644 a.txt\0');
      const entry2 = new TextEncoder().encode('40000 subdir\0');
      const treeData = new Uint8Array(entry1.length + 20 + entry2.length + 20);
      let offset = 0;
      treeData.set(entry1, offset); offset += entry1.length;
      treeData.set(sha1, offset); offset += 20;
      treeData.set(entry2, offset); offset += entry2.length;
      treeData.set(sha2, offset);

      const entries = parseTreeEntries(treeData);
      expect(entries).toHaveLength(2);
      expect(entries[0].mode).toBe('100644');
      expect(entries[0].name).toBe('a.txt');
      expect(entries[1].mode).toBe('40000');
      expect(entries[1].name).toBe('subdir');
    });
  });

  describe('extractObjectRefs', () => {
    it('returns tree + parents for commits', () => {
      const treeSha = 'a'.repeat(40);
      const parentSha = 'b'.repeat(40);
      const data = new TextEncoder().encode(
        `tree ${treeSha}\nparent ${parentSha}\nauthor Test <t@t> 1000 +0000\n\nmsg\n`
      );
      const obj: GitObject = { sha: 'x'.repeat(40), type: 'commit', data };
      const refs = extractObjectRefs(obj);
      expect(refs).toContain(treeSha);
      expect(refs).toContain(parentSha);
    });

    it('returns entry SHAs for trees', () => {
      const sha = new Uint8Array(20).fill(0xcc);
      const entry = new TextEncoder().encode('100644 file\0');
      const treeData = new Uint8Array(entry.length + 20);
      treeData.set(entry);
      treeData.set(sha, entry.length);
      const obj: GitObject = { sha: 'y'.repeat(40), type: 'tree', data: treeData };
      const refs = extractObjectRefs(obj);
      expect(refs).toHaveLength(1);
    });

    it('returns empty for blobs', () => {
      const obj: GitObject = { sha: 'z'.repeat(40), type: 'blob', data: new Uint8Array(10) };
      expect(extractObjectRefs(obj)).toEqual([]);
    });
  });
});
