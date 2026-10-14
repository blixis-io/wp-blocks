/** Number of bytes `text` occupies in UTF-8, without allocating (usable before decoding untrusted input). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // a surrogate pair is one astral code point
        i += 1;
      } else bytes += 3; // lone high surrogate: encoders substitute U+FFFD, 3 bytes
    } else bytes += 3;
  }
  return bytes;
}
