// Renders the safe Markdown tree from engine/markdown.js with DOM nodes only (no HTML strings).
import { h } from "./dom.js";
import { parseMarkdown } from "../engine/markdown.js";

function inline(nodes) {
  return nodes.map((n) => {
    if (n.type === "strong") return h("strong", {}, n.text);
    if (n.type === "em") return h("em", {}, n.text);
    if (n.type === "link") return h("a", { href: n.href, target: "_blank", rel: "noopener noreferrer nofollow" }, n.text, h("span", { class: "sr-only" }, " (opens in a new tab)"));
    return n.text;
  });
}

const withBreaks = (lines) => lines.flatMap((line, i) => (i ? [h("br"), ...inline(line)] : inline(line)));

export function renderMarkdown(source, { className = "rich" } = {}) {
  return h("div", { class: className }, parseMarkdown(source).map((block) => {
    if (block.type === "h") return h("h3", {}, inline(block.lines[0]));
    if (block.type === "ul" || block.type === "ol") return h(block.type, {}, block.items.map((item) => h("li", {}, inline(item))));
    if (block.type === "quote") return h("blockquote", {}, withBreaks(block.lines));
    return h("p", {}, withBreaks(block.lines));
  }));
}
