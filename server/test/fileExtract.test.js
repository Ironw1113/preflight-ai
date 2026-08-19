const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { extractText, extractProjectText, wordCount, isSupportedExtension, shouldSkipPath } = require("../lib/fileExtract");

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name));

test("wordCount handles empty and whitespace-only text", () => {
  assert.strictEqual(wordCount(""), 0);
  assert.strictEqual(wordCount("   \n\t  "), 0);
  assert.strictEqual(wordCount("one two three"), 3);
});

test("extracts plain text files directly", async () => {
  const buf = Buffer.from("Reformat this report into three bullet points.");
  const result = await extractText(buf, "notes.txt", "text/plain");
  assert.strictEqual(result.wordCount, 7);
  assert.strictEqual(result.fileName, "notes.txt");
  assert.match(result.preview, /Reformat this report/);
});

test("extracts JSON files directly", async () => {
  const buf = Buffer.from(JSON.stringify({ hello: "world" }));
  const result = await extractText(buf, "data.json", "application/json");
  assert.ok(result.wordCount > 0);
});

test("extracts text from a real PDF", async () => {
  const result = await extractText(fixture("sample.pdf"), "sample.pdf", "application/pdf");
  assert.match(result.snippet, /test document for the file upload estimator/);
  assert.ok(result.wordCount > 15);
});

test("extracts text from a real DOCX", async () => {
  const result = await extractText(fixture("sample.docx"), "sample.docx");
  assert.match(result.snippet, /test document for the file upload estimator/);
  assert.ok(result.wordCount > 15);
});

test("extracts inline-string cell text from a real XLSX", async () => {
  const result = await extractText(fixture("sample.xlsx"), "sample.xlsx");
  assert.match(result.snippet, /Vendor/);
  assert.match(result.snippet, /Acme Corp/);
});

test("extracts shared-string-table cell text from a real XLSX", async () => {
  const result = await extractText(fixture("sample-shared-strings.xlsx"), "sample-shared-strings.xlsx");
  assert.match(result.snippet, /Task Description/);
  assert.match(result.snippet, /Refactor the auth module to use JWT instead of sessions/);
});

test("rejects unsupported file extensions", async () => {
  await assert.rejects(
    () => extractText(Buffer.from("binary junk"), "archive.zip"),
    /Unsupported file type/
  );
});

test("snippet is bounded even for large text", async () => {
  const bigText = "word ".repeat(10000);
  const result = await extractText(Buffer.from(bigText), "big.txt", "text/plain");
  assert.ok(result.snippet.length <= 4000);
  assert.ok(result.preview.length <= 500);
  assert.strictEqual(result.wordCount, 10000);
});

// --- project (multi-file / folder) upload ---

test("shouldSkipPath excludes junk directories at any depth", () => {
  assert.ok(shouldSkipPath("node_modules/lodash/index.js"));
  assert.ok(shouldSkipPath("packages/app/node_modules/foo/bar.js"));
  assert.ok(shouldSkipPath(".git/HEAD"));
  assert.ok(shouldSkipPath("frontend/dist/bundle.js"));
  assert.ok(!shouldSkipPath("src/components/Widget.jsx"));
});

test("isSupportedExtension matches the extraction pipeline's coverage", () => {
  assert.ok(isSupportedExtension("index.js"));
  assert.ok(isSupportedExtension("report.pdf"));
  assert.ok(isSupportedExtension("data.xlsx"));
  assert.ok(!isSupportedExtension("logo.png"));
  assert.ok(!isSupportedExtension("archive.zip"));
});

test("extractProjectText sums word counts and excludes junk paths / unsupported files", async () => {
  const files = [
    { originalName: "src/index.js", buffer: Buffer.from("function main() { return 1; }") },
    { originalName: "src/utils/foo.js", buffer: Buffer.from("export function foo(a, b) { return a + b; }") },
    { originalName: "node_modules/lodash/index.js", buffer: Buffer.from("junk ".repeat(500)) },
    { originalName: ".git/HEAD", buffer: Buffer.from("ref: refs/heads/main") },
    { originalName: "assets/logo.png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { originalName: "README.md", buffer: Buffer.from("# Demo\n\nA small demo project.") }
  ];
  const result = await extractProjectText(files);
  assert.strictEqual(result.fileCount, 3);
  assert.strictEqual(result.skippedCount, 3);
  assert.strictEqual(result.failedCount, 0);
  assert.ok(result.totalWordCount > 0);
  assert.deepStrictEqual(result.files.map((f) => f.fileName).sort(), ["README.md", "src/index.js", "src/utils/foo.js"]);
  assert.match(result.snippet, /src\/index\.js/);
});

test("extractProjectText records per-file failures without failing the whole batch", async () => {
  const files = [
    { originalName: "good.txt", buffer: Buffer.from("This file reads fine.") },
    { originalName: "bad.pdf", buffer: Buffer.from("not actually a pdf") }
  ];
  const result = await extractProjectText(files);
  assert.strictEqual(result.fileCount, 1);
  assert.strictEqual(result.failedCount, 1);
  assert.strictEqual(result.failed[0].fileName, "bad.pdf");
});

test("extractProjectText handles an empty file list", async () => {
  const result = await extractProjectText([]);
  assert.strictEqual(result.fileCount, 0);
  assert.strictEqual(result.totalWordCount, 0);
});

test("extractProjectText caps the snippet and prioritizes larger files", async () => {
  const files = Array.from({ length: 5 }, (_, i) => ({
    originalName: `file${i}.txt`,
    buffer: Buffer.from(`word `.repeat(2000 * (i + 1)))
  }));
  const result = await extractProjectText(files);
  assert.ok(result.snippet.length <= 4000);
  assert.strictEqual(result.fileCount, 5);
});
