import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256HexUtf8 } from './sha256.ts';

const node = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256', () => {
  it('matches the NIST test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('agrees with the platform at every length around the padding boundaries', () => {
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 5000]) {
      const text = 'x'.repeat(length);
      expect(sha256Hex(text), String(length)).toBe(node(text));
      expect(sha256HexUtf8(text), String(length)).toBe(node(text));
    }
  });

  it('the ASCII form refuses other text and the UTF-8 form hashes it like the platform', () => {
    expect(() => sha256Hex('é')).toThrow(RangeError);
    const samples = [
      'café',
      '日本語',
      String.fromCodePoint(0x1f600, 0x20ac, 0x10ffff),
      'á',
      ' \u0085',
      'Hallo wêreld'.repeat(40),
    ];
    for (const text of samples) expect(sha256HexUtf8(text), text).toBe(node(text));
    // lone surrogates encode as U+FFFD, like the platform encoders
    for (const text of ['\ud800', 'a\udc00b', '\ud800\ud800', '\udc00\ud800'])
      expect(sha256HexUtf8(text)).toBe(node(text));
  });
});
