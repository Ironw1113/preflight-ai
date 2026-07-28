const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { extractText, wordCount } = require("../lib/fileExtract");

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
