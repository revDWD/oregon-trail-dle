import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseInline, safeUrl, plainText } from "../../assets/js/at/engine/markdown.js";

test("paragraphs, line breaks, headings, lists and quotes", () => {
  const blocks = parseMarkdown("### Big news\nWe made it\nto Damascus!\n\n- snacks\n- naps\n\n1. one\n2. two\n\n> keep going");
  assert.deepEqual(blocks.map((b) => b.type), ["h", "p", "ul", "ol", "quote"]);
  assert.equal(blocks[1].lines.length, 2);
  assert.deepEqual(blocks[2].items.map((i) => i[0].text), ["snacks", "naps"]);
  assert.deepEqual(blocks[3].items.map((i) => i[0].text), ["one", "two"]);
});

test("inline bold, italic and https links", () => {
  assert.deepEqual(parseInline("a **b** *c* _d_ [e](https://example.com/x)"), [
    { type: "text", text: "a " }, { type: "strong", text: "b" }, { type: "text", text: " " },
    { type: "em", text: "c" }, { type: "text", text: " " }, { type: "em", text: "d" }, { type: "text", text: " " },
    { type: "link", text: "e", href: "https://example.com/x" }
  ]);
  assert.deepEqual(parseInline("snake_case_name"), [{ type: "text", text: "snake_case_name" }]);
});

test("unsafe links degrade to plain text", () => {
  for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)"]) {
    assert.ok(parseInline(`[click](${url})`).every((n) => n.type === "text"), url);
  }
  for (const url of ["javascript:void", "http://example.com", "data:text/html,hi", "//evil.example", "vbscript:x"]) {
    const nodes = parseInline(`[click](${url})`);
    assert.deepEqual(nodes, [{ type: "text", text: "click" }], url);
  }
  assert.equal(safeUrl("https://ok.example/a?b=1"), "https://ok.example/a?b=1");
  assert.equal(safeUrl("nope"), null);
});

test("HTML in a dispatch stays literal text", () => {
  const blocks = parseMarkdown("<script>alert(1)</script>\n<img src=x onerror=alert(1)>");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lines[0][0].text, "<script>alert(1)</script>");
  assert.equal(blocks[0].lines[0][0].type, "text");
});

test("plain-text preview strips formatting and trims at a word", () => {
  assert.equal(plainText("**Hello** _trail_ friends"), "Hello trail friends");
  const long = plainText("word ".repeat(100), 40);
  assert.ok(long.length <= 41 && long.endsWith("…"));
  assert.equal(plainText(""), "");
});
