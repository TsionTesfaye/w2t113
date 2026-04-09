/**
 * Tests for the pure-JS inflate (RFC 1951) fallback and XLSX parser integration.
 * Verifies that DEFLATE decompression works correctly without DecompressionStream.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync } from '../test-helpers.js';
import { inflate } from '../src/utils/inflate.js';
import { parseExcelFile, isXlsxSupported } from '../src/utils/excelParser.js';
import { deflateRawSync } from 'node:zlib';

export async function runInflateFallbackTests() {
  await describe('inflate — RFC 1951 DEFLATE decompressor', async () => {
    await it('should decompress a simple string', async () => {
      const original = 'Hello, World!';
      const compressed = deflateRawSync(Buffer.from(original));
      const result = inflate(new Uint8Array(compressed));
      assertEqual(new TextDecoder().decode(result), original);
    });

    await it('should decompress data with repeated patterns (LZ77 back-references)', async () => {
      const original = 'ABCDEF'.repeat(200);
      const compressed = deflateRawSync(Buffer.from(original));
      const result = inflate(new Uint8Array(compressed));
      assertEqual(new TextDecoder().decode(result), original);
    });

    await it('should decompress all byte values (0-255)', async () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) original[i] = i;
      const compressed = deflateRawSync(Buffer.from(original));
      const result = inflate(new Uint8Array(compressed));
      assertEqual(result.length, 256);
      for (let i = 0; i < 256; i++) assertEqual(result[i], i);
    });

    await it('should decompress XML-like content (realistic XLSX payload)', async () => {
      const xml = '<?xml version="1.0"?><worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row>' +
        '</sheetData></worksheet>';
      const compressed = deflateRawSync(Buffer.from(xml));
      const result = inflate(new Uint8Array(compressed));
      assertEqual(new TextDecoder().decode(result), xml);
    });

    await it('should handle stored (uncompressed) blocks', async () => {
      // Force stored blocks with no compression
      const original = 'Short';
      const compressed = deflateRawSync(Buffer.from(original), { level: 0 });
      const result = inflate(new Uint8Array(compressed));
      assertEqual(new TextDecoder().decode(result), original);
    });

    await it('should handle empty input after decompression', async () => {
      const original = '';
      const compressed = deflateRawSync(Buffer.from(original));
      const result = inflate(new Uint8Array(compressed));
      assertEqual(result.length, 0);
    });

    await it('should handle large data (10KB+)', async () => {
      let original = '';
      for (let i = 0; i < 500; i++) {
        original += `Row ${i}: questionText,single,answer${i},${(i % 5) + 1},tag1;tag2\n`;
      }
      const compressed = deflateRawSync(Buffer.from(original));
      const result = inflate(new Uint8Array(compressed));
      assertEqual(new TextDecoder().decode(result), original);
    });

    await it('should throw on invalid DEFLATE data', async () => {
      const garbage = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
      let threw = false;
      try { inflate(garbage); } catch { threw = true; }
      assert(threw, 'Expected inflate to throw on invalid data');
    });
  });

  await describe('isXlsxSupported — availability check', async () => {
    await it('should always return true (fallback available)', async () => {
      assertEqual(isXlsxSupported(), true);
    });
  });

  await describe('parseExcelFile — fallback integration', async () => {
    await it('should still reject legacy .xls files', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'test.xls'),
        'Legacy .xls format is not supported'
      );
    });

    await it('should still reject unsupported formats', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'test.csv'),
        'Unsupported file format'
      );
    });

    await it('should still reject corrupted xlsx data', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new Uint8Array(buffer);
      view[0] = 0x00; // Not a ZIP signature
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'test.xlsx'),
        'Failed to parse Excel file'
      );
    });
  });
}
