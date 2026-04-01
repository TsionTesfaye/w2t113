/**
 * excelParser — lightweight .xlsx parser using JSZip-style approach.
 * Parses XLSX (Open XML) files by unzipping and reading the XML content.
 * No external dependencies — uses browser APIs only.
 *
 * XLSX structure:
 *   xl/sharedStrings.xml — string table
 *   xl/worksheets/sheet1.xml — cell data
 *
 * Supports: .xlsx files (Office Open XML)
 * For .xls (legacy binary), converts to a user-friendly error.
 */

/**
 * Parse an Excel file (.xlsx) into an array of row objects.
 * The first row is treated as headers.
 *
 * @param {ArrayBuffer} buffer — file contents as ArrayBuffer
 * @param {string} filename — original filename for format detection
 * @returns {Array<Object>} rows as key-value objects using header names
 */
export async function parseExcelFile(buffer, filename) {
  const lower = (filename || '').toLowerCase();

  if (lower.endsWith('.xls') && !lower.endsWith('.xlsx')) {
    throw new Error('Legacy .xls format is not supported. Please save the file as .xlsx and try again.');
  }

  if (!lower.endsWith('.xlsx')) {
    throw new Error('Unsupported file format. Please use .xlsx files.');
  }

  try {
    const entries = await unzip(buffer);
    const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml']);
    const sheetXml = entries['xl/worksheets/sheet1.xml'];
    if (!sheetXml) {
      throw new Error('No worksheet found in Excel file.');
    }
    const rows = parseSheet(sheetXml, sharedStrings);
    if (rows.length < 2) {
      throw new Error('Excel file must have a header row and at least one data row.');
    }

    // First row = headers
    const headers = rows[0].map(h => String(h || '').trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Skip completely empty rows
      if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        if (headers[j]) {
          obj[headers[j]] = row[j] !== undefined ? row[j] : '';
        }
      }
      data.push(obj);
    }
    return data;
  } catch (err) {
    if (err.message.includes('not supported') || err.message.includes('Unsupported') || err.message.includes('header row')) {
      throw err;
    }
    throw new Error(`Failed to parse Excel file: ${err.message}`);
  }
}

/**
 * Minimal ZIP reader — extracts text entries from a ZIP (XLSX) ArrayBuffer.
 */
async function unzip(buffer) {
  const view = new DataView(buffer);
  const entries = {};

  let offset = 0;
  while (offset < buffer.byteLength - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header signature

    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const compressionMethod = view.getUint16(offset + 8, true);

    const nameBytes = new Uint8Array(buffer, offset + 30, nameLen);
    const name = new TextDecoder().decode(nameBytes);

    const dataStart = offset + 30 + nameLen + extraLen;

    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const compressedData = new Uint8Array(buffer, dataStart, compressedSize);

      if (compressionMethod === 0) {
        // Stored (no compression)
        entries[name] = new TextDecoder().decode(compressedData);
      } else if (compressionMethod === 8) {
        // Deflate
        try {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();

          writer.write(compressedData);
          writer.close();

          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const totalLen = chunks.reduce((s, c) => s + c.length, 0);
          const result = new Uint8Array(totalLen);
          let pos = 0;
          for (const chunk of chunks) {
            result.set(chunk, pos);
            pos += chunk.length;
          }
          entries[name] = new TextDecoder().decode(result);
        } catch {
          // Skip entries that fail to decompress
        }
      }
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

/**
 * Parse xl/sharedStrings.xml into an array of strings.
 */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  // Match <si>...<t>...</t>...</si> patterns
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml)) !== null) {
    const siContent = match[1];
    // Extract all <t> values within this <si> and concatenate (handles rich text <r><t>...</t></r>)
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch;
    let value = '';
    while ((tMatch = tRegex.exec(siContent)) !== null) {
      value += tMatch[1];
    }
    strings.push(decodeXmlEntities(value));
  }
  return strings;
}

/**
 * Parse xl/worksheets/sheet1.xml into a 2D array of cell values.
 */
function parseSheet(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowContent = rowMatch[1];
    const cells = [];
    const cellRegex = /<c\s([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const cellContent = cellMatch[2] || '';

      // Get cell reference to determine column index
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      const colIndex = refMatch ? colLetterToIndex(refMatch[1]) : cells.length;

      // Pad with empty cells if needed
      while (cells.length < colIndex) cells.push('');

      // Get type attribute
      const typeMatch = attrs.match(/t="([^"]*)"/);
      const cellType = typeMatch ? typeMatch[1] : '';

      // Extract value
      const vMatch = cellContent.match(/<v>([\s\S]*?)<\/v>/);
      const rawValue = vMatch ? vMatch[1] : '';

      let value;
      if (cellType === 's') {
        // Shared string reference
        const idx = parseInt(rawValue, 10);
        value = sharedStrings[idx] || '';
      } else if (cellType === 'inlineStr') {
        const tMatch = cellContent.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        value = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else {
        value = decodeXmlEntities(rawValue);
      }

      cells.push(value);
    }

    rows.push(cells);
  }

  return rows;
}

/**
 * Convert column letter(s) to 0-based index. A=0, B=1, ..., Z=25, AA=26...
 */
function colLetterToIndex(letters) {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Decode basic XML entities.
 */
function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
