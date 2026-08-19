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

const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...SPREADSHEET_EXTENSIONS, "pdf", "docx"]);

function isSupportedExtension(filename) {
  return SUPPORTED_EXTENSIONS.has(extOf(filename));
}

// directories nobody wants counted in a project-size estimate — dependency
// trees, build output, VCS internals, caches
const SKIP_PATH_SEGMENTS = new Set([
  "node_modules", ".git", ".svn", ".hg", "dist", "build", "out", ".next",
  ".nuxt", "coverage", ".cache", "vendor", ".venv", "venv", "__pycache__",
  "target", ".pytest_cache", ".turbo", ".parcel-cache"
]);

function shouldSkipPath(relativePath) {
  return String(relativePath).split(/[/\\]/).some((seg) => SKIP_PATH_SEGMENTS.has(seg));
}

const PROJECT_MAX_SNIPPET_CHARS = 4000;
const PROJECT_MAX_LISTED_FILES = 50;

/**
 * Aggregates text across many uploaded files (a project/folder) into a
 * single word count + a bounded context snippet. Unlike extractText(),
 * this never throws for one bad file — junk paths (node_modules, .git,
 * build output, ...) and unsupported extensions are silently skipped, and
 * per-file extraction errors (e.g. a corrupt PDF) are recorded but don't
 * fail the whole batch, since a "whole project" upload naturally contains
 * plenty of files we can't and shouldn't try to read.
 *
 * @param {Array<{buffer: Buffer, originalName: string, mimetype?: string}>} files
 */
async function extractProjectText(files) {
  const included = [];
  const skipped = [];
  const failed = [];

  for (const f of files) {
    if (shouldSkipPath(f.originalName)) {
      skipped.push({ fileName: f.originalName, reason: "excluded path (node_modules/.git/build/etc.)" });
      continue;
    }
    if (!isSupportedExtension(f.originalName)) {
      skipped.push({ fileName: f.originalName, reason: "unsupported file type" });
      continue;
    }
    try {
      const result = await extractText(f.buffer, f.originalName, f.mimetype);
      included.push(result);
    } catch (err) {
      failed.push({ fileName: f.originalName, reason: err.message });
    }
  }

  const totalWordCount = included.reduce((sum, r) => sum + r.wordCount, 0);
  const totalCharCount = included.reduce((sum, r) => sum + r.charCount, 0);

  // bounded context snippet: a file listing, then excerpts from the
  // largest files (most likely to matter) until the budget runs out
  const listing = included
    .slice(0, PROJECT_MAX_LISTED_FILES)
    .map((r) => `- ${r.fileName} (${r.wordCount} words)`)
    .join("\n");
  const moreNote = included.length > PROJECT_MAX_LISTED_FILES ? `\n… and ${included.length - PROJECT_MAX_LISTED_FILES} more files` : "";
  let snippet = `Project files (${included.length} read${skipped.length ? `, ${skipped.length} excluded` : ""}):\n${listing}${moreNote}`;

  const byLargest = [...included].sort((a, b) => b.wordCount - a.wordCount);
  for (const r of byLargest) {
    if (snippet.length >= PROJECT_MAX_SNIPPET_CHARS) break;
    const remaining = PROJECT_MAX_SNIPPET_CHARS - snippet.length;
    if (remaining < 100) break;
    snippet += `\n\n--- ${r.fileName} ---\n${r.preview.slice(0, remaining - 20)}`;
  }
  snippet = snippet.slice(0, PROJECT_MAX_SNIPPET_CHARS);

  return {
    fileCount: included.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    totalWordCount,
    totalCharCount,
    files: included.map((r) => ({ fileName: r.fileName, wordCount: r.wordCount })),
    skipped,
    failed,
    snippet
  };
}

module.exports = {
  extractText, extractProjectText, wordCount,
  isSupportedExtension, shouldSkipPath,
  TEXT_EXTENSIONS, SPREADSHEET_EXTENSIONS, SUPPORTED_EXTENSIONS, SKIP_PATH_SEGMENTS
};
