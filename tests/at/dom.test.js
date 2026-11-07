import test from "node:test";
import assert from "node:assert/strict";

// A minimal stand-in for the browser DOM: just enough for dom.js.
class FakeNode {
  constructor(text) { this.text = text; this.kids = []; }
  append(...nodes) { this.kids.push(...nodes); }
  replaceChildren(...nodes) { this.kids = nodes; }
}
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => Object.assign(new FakeNode(), { tag, setAttribute() {}, addEventListener() {} }),
  createTextNode: (text) => new FakeNode(text)
};
const { h, fill } = await import("../../assets/js/at/ui/dom.js");

test("fill() replaces children, flattening nested lists and skipping empty values like h()", () => {
  const body = h("div", {}, "old");
  const groups = [h("details", {}), [h("details", {})]];
  fill(body, [h("p", {}), null, false, groups, undefined, "tail"]);
  assert.deepEqual(body.kids.map((k) => k.tag || `"${k.text}"`), ["p", "details", "details", "\"tail\""]);
});
