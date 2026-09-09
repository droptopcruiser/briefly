/**
 * A tiny, dependency-free .docx (OOXML) writer — pure and client-safe.
 *
 * #3 (export): counsel wants the disclosure note and the request letter as Word files
 * she can open without it "smelling of a chat panel" — Times New Roman, no cover page,
 * no colour. A .docx is just a ZIP of a few XML parts, so we build both the ZIP (stored,
 * uncompressed — Word opens it fine) and the XML by hand. No new runtime dependency.
 *
 * The content is supplied as a flat list of paragraph Blocks; whoever calls this maps
 * the exact exported text into blocks, so the .docx carries the same content as the .txt.
 */

export interface Block {
  /** Paragraph text. Empty string → a blank line. */
  text: string;
  /** Bold section label (e.g. "WHAT'S NEW"). */
  bold?: boolean;
  /** Document/section heading — bold, slightly larger, a little space above. */
  heading?: boolean;
}

// ── ZIP (stored / no compression) ─────────────────────────────────────────────

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

  const meta = entries.map((e) => ({
    nameBytes: enc.encode(e.name),
    crc: crc32(e.data),
    data: e.data,
    offset: 0,
  }));

  for (const m of meta) {
    m.offset = out.length;
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(0); // flags
    u16(0); // stored
    u16(0); // mod time
    u16(0x21); // mod date (1980-01-01)
    u32(m.crc);
    u32(m.data.length); // compressed size
    u32(m.data.length); // uncompressed size
    u16(m.nameBytes.length);
    u16(0); // extra len
    for (const b of m.nameBytes) out.push(b);
    for (const b of m.data) out.push(b);
  }

  const cdStart = out.length;
  for (const m of meta) {
    u32(0x02014b50); // central directory header
    u16(20); // version made by
    u16(20); // version needed
    u16(0); // flags
    u16(0); // stored
    u16(0); // mod time
    u16(0x21); // mod date
    u32(m.crc);
    u32(m.data.length);
    u32(m.data.length);
    u16(m.nameBytes.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number
    u16(0); // internal attrs
    u32(0); // external attrs
    u32(m.offset);
    for (const b of m.nameBytes) out.push(b);
  }
  const cdSize = out.length - cdStart;

  u32(0x06054b50); // end of central directory
  u16(0); // disk
  u16(0); // cd start disk
  u16(meta.length);
  u16(meta.length);
  u32(cdSize);
  u32(cdStart);
  u16(0); // comment length

  return Uint8Array.from(out);
}

// ── OOXML parts ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const FONT = 'w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"';

function paragraph(b: Block): string {
  const sz = b.heading ? 28 : 24; // half-points → 14pt heading, 12pt body
  const bold = b.bold || b.heading ? "<w:b/>" : "";
  const rPr = `<w:rPr><w:rFonts ${FONT}/>${bold}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
  const spacing = b.heading ? '<w:spacing w:before="200" w:after="80"/>' : '<w:spacing w:after="0"/>';
  const pPr = `<w:pPr>${spacing}<w:rPr><w:rFonts ${FONT}/></w:rPr></w:pPr>`;
  const run = b.text.length ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(b.text)}</w:t></w:r>` : "";
  return `<w:p>${pPr}${run}</w:p>`;
}

function documentXml(blocks: Block[]): string {
  const body = blocks.map(paragraph).join("");
  const sect =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<w:document xmlns:w="${W_NS}"><w:body>${body}${sect}</w:body></w:document>`
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  `<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts ${FONT}/>` +
  '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
  '</w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOC_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

/** Build a complete .docx as bytes from a flat list of paragraph blocks. */
export function buildDocx(blocks: Block[]): Uint8Array {
  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(DOC_RELS) },
    { name: "word/document.xml", data: enc.encode(documentXml(blocks)) },
    { name: "word/styles.xml", data: enc.encode(STYLES_XML) },
  ]);
}
