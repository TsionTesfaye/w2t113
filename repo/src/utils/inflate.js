/**
 * inflate.js — Minimal RFC 1951 raw DEFLATE decompressor.
 * Pure JavaScript, zero dependencies.
 * Provides fallback decompression when DecompressionStream is unavailable.
 *
 * Handles all three DEFLATE block types:
 *   - Type 0: Stored (no compression)
 *   - Type 1: Fixed Huffman codes
 *   - Type 2: Dynamic Huffman codes
 */

/* Length codes 257-285: base length and extra bits */
const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];

/* Distance codes 0-29: base distance and extra bits */
const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DEXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

/* Order of code length alphabet codes for dynamic Huffman trees */
const CL_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

/**
 * Decompress raw DEFLATE data (no zlib/gzip wrapper).
 * @param {Uint8Array} src — compressed bytes
 * @returns {Uint8Array} decompressed bytes
 */
export function inflate(src) {
  let bitBuf = 0, bitCnt = 0, srcPos = 0;
  let out = new Uint8Array(Math.max(src.length * 3, 512));
  let oPos = 0;

  /* Ensure output buffer has room for n more bytes */
  function ensure(n) {
    if (oPos + n <= out.length) return;
    let sz = out.length;
    while (oPos + n > sz) sz *= 2;
    const b = new Uint8Array(sz);
    b.set(out);
    out = b;
  }

  /* Fill bit buffer to at least n bits */
  function fill(n) {
    while (bitCnt < n && srcPos < src.length) {
      bitBuf |= src[srcPos++] << bitCnt;
      bitCnt += 8;
    }
  }

  /* Read n bits (LSB first) and advance */
  function bits(n) {
    if (n === 0) return 0;
    fill(n);
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  }

  /**
   * Build a Huffman lookup table from an array of code lengths.
   * Returns { t: Int32Array, b: maxBits }.
   * Each table entry encodes (symbol << 4) | codeLength.
   */
  function huffTable(lens) {
    let max = 0;
    for (let i = 0; i < lens.length; i++) {
      if (lens[i] > max) max = lens[i];
    }
    if (max === 0) return { t: new Int32Array(1), b: 0 };

    /* Count codes of each length */
    const cnt = new Uint16Array(max + 1);
    for (let i = 0; i < lens.length; i++) {
      if (lens[i]) cnt[lens[i]]++;
    }

    /* Compute first code value for each length */
    const nxt = new Uint16Array(max + 1);
    let code = 0;
    for (let b = 1; b <= max; b++) {
      code = (code + cnt[b - 1]) << 1;
      nxt[b] = code;
    }

    /* Fill lookup table with bit-reversed codes */
    const sz = 1 << max;
    const t = new Int32Array(sz).fill(-1);
    for (let sym = 0; sym < lens.length; sym++) {
      const len = lens[sym];
      if (!len) continue;
      const c = nxt[len]++;
      let rev = 0;
      for (let b = 0; b < len; b++) {
        rev = (rev << 1) | ((c >> b) & 1);
      }
      const step = 1 << len;
      for (let i = rev; i < sz; i += step) {
        t[i] = (sym << 4) | len;
      }
    }
    return { t, b: max };
  }

  /* Decode one Huffman symbol */
  function sym(ht) {
    fill(ht.b);
    const e = ht.t[bitBuf & ((1 << ht.b) - 1)];
    if (e < 0) throw new Error('Invalid Huffman code in DEFLATE stream');
    const len = e & 0xF;
    bitBuf >>>= len;
    bitCnt -= len;
    return e >> 4;
  }

  /* Build fixed Huffman tables (RFC 1951 §3.2.6) */
  const flLens = new Uint8Array(288);
  for (let i = 0; i <= 143; i++) flLens[i] = 8;
  for (let i = 144; i <= 255; i++) flLens[i] = 9;
  for (let i = 256; i <= 279; i++) flLens[i] = 7;
  for (let i = 280; i <= 287; i++) flLens[i] = 8;
  const fixLit = huffTable(flLens);

  const fdLens = new Uint8Array(32);
  fdLens.fill(5);
  const fixDist = huffTable(fdLens);

  /* Process blocks */
  let bfinal;
  do {
    bfinal = bits(1);
    const btype = bits(2);

    if (btype === 0) {
      /* Stored block — align to byte boundary, read raw data */
      const skip = bitCnt & 7;
      if (skip) { bitBuf >>>= skip; bitCnt -= skip; }
      const len = bits(16);
      bits(16); /* nlen (one's complement, discarded) */
      ensure(len);
      for (let i = 0; i < len; i++) out[oPos++] = bits(8);
    } else if (btype === 1 || btype === 2) {
      let litH, dstH;

      if (btype === 1) {
        /* Fixed Huffman */
        litH = fixLit;
        dstH = fixDist;
      } else {
        /* Dynamic Huffman — read tree definitions */
        const hlit = bits(5) + 257;
        const hdist = bits(5) + 1;
        const hclen = bits(4) + 4;

        const clLens = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clLens[CL_ORDER[i]] = bits(3);
        const clH = huffTable(clLens);

        const all = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < hlit + hdist) {
          const s = sym(clH);
          if (s < 16) {
            all[idx++] = s;
          } else if (s === 16) {
            const rep = bits(2) + 3;
            const val = idx > 0 ? all[idx - 1] : 0;
            for (let j = 0; j < rep; j++) all[idx++] = val;
          } else if (s === 17) {
            idx += bits(3) + 3;
          } else { /* 18 */
            idx += bits(7) + 11;
          }
        }

        litH = huffTable(all.subarray(0, hlit));
        dstH = huffTable(all.subarray(hlit, hlit + hdist));
      }

      /* Decode literal/length + distance symbols */
      while (true) {
        const s = sym(litH);
        if (s === 256) break; /* end of block */
        if (s < 256) {
          ensure(1);
          out[oPos++] = s;
        } else {
          /* Length-distance pair */
          const li = s - 257;
          const length = LBASE[li] + bits(LEXTRA[li]);
          const di = sym(dstH);
          const dist = DBASE[di] + bits(DEXTRA[di]);
          ensure(length);
          for (let i = 0; i < length; i++) {
            out[oPos] = out[oPos - dist];
            oPos++;
          }
        }
      }
    } else {
      throw new Error('Invalid DEFLATE block type');
    }
  } while (!bfinal);

  return out.subarray(0, oPos);
}
