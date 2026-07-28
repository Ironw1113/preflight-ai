/**
 * Server-side text extraction for the file-upload task estimator. Files are
 * processed entirely in memory (multer memoryStorage) and never written to
 * disk — we only need the extracted word count and a bounded snippet for
 * classification, not the file itself.
 */
const mammoth = require("mammoth");
const { PDFParse } = require("pdf-parse");
const { unzipSync, strFromU8 } = require("fflate");

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json",
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "java", "c", "cpp", "h", "hpp",
  "cs", "php", "html", "css", "yml", "yaml", "xml", "sql", "sh"
]);
const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls"]);
const MAX_SNIPPET_CHARS = 4000;
const MAX_PREVIEW_CHARS = 500;

function extOf(filename) {
  return (String(filename).split(".").pop() || "").toLowerCase();
}

function wordCount(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// pulls every <t>...</t> text node out of a chunk of spreadsheet XML —
// covers both inline-string cells and the sharedStrings.xml table
function extractTagTexts(xml) {
  const texts = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) texts.push(decodeXmlEntities(m[1]));
  return texts;
}

/**
 * .xlsx is a zip of XML parts. Rather than pull in a full spreadsheet
 * library (the maintained npm option for reading, `xlsx`, has unpatched
 * high-severity advisories; `exceljs` drags in a vulnerable writer-only
 * dependency chain we'd never use) we only need *text content* for word
 * counting and classification context, so we unzip with fflate (small,
 * no advisories) and pull text directly out of the worksheet/sharedStrings
 * XML — full cell typing/formulas are out of scope for that purpose.
 */
function extractSpreadsheetText(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const sharedStrings = files["xl/sharedStrings.xml"] ? extractTagTexts(strFromU8(files["xl/sharedStrings.xml"])) : [];

  const sheetNames = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort();
  if (sheetNames.length === 0) throw new Error("No worksheets found in spreadsheet");

  const sheetTexts = sheetNames.map((name) => {
    const xml = strFromU8(files[name]);
    const sharedRefs = [];
    const cellRe = /<c\b[^>]*\bt="s"[^>]*>\s*<v>(\d+)<\/v>\s*<\/c>/g;
    let m;
    while ((m = cellRe.exec(xml))) {
      const idx = Number(m[1]);
      if (sharedStrings[idx] !== undefined) sharedRefs.push(sharedStrings[idx]);
    }
    const inlineTexts = extractTagTexts(xml); // inline-string cells (t="inlineStr")
    return [...sharedRefs, ...inlineTexts].join(", ");
  });

  return sheetTexts.join("\n\n");
}

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} [mimetype]
 */
async function extractText(buffer, originalName, mimetype) {
  const ext = extOf(originalName);
  let text;

  if (ext === "pdf" || mimetype === "application/pdf") {
    text = await extractPdfText(buffer);
  } else if (ext === "docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = await extractDocxText(buffer);
  } else if (SPREADSHEET_EXTENSIONS.has(ext)) {
    text = await extractSpreadsheetText(buffer);
  } else if (TEXT_EXTENSIONS.has(ext) || (mimetype && mimetype.startsWith("text/")) || mimetype === "application/json") {
    text = buffer.toString("utf8");
  } else {
    throw new Error(`Unsupported file type: .${ext || "unknown"}`);
  }

  return {
    fileName: originalName,
    wordCount: wordCount(text),
    charCount: text.length,
    preview: text.trim().slice(0, MAX_PREVIEW_CHARS),
    snippet: text.trim().slice(0, MAX_SNIPPET_CHARS)
  };
}

module.exports = { extractText, wordCount, TEXT_EXTENSIONS, SPREADSHEET_EXTENSIONS };
