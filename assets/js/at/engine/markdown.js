// Safe Markdown subset for Trail Dispatches. Pure: turns text into a small tree that the UI renders
// with DOM text nodes. Nothing here produces HTML, so stored text can never become markup.
//
// Supported: paragraphs (blank line separated; single newlines become line breaks), headings
// (#, ## or ### all render as one sub-heading level), "- " / "* " bullet lists, "1. " numbered lists,
// "> " quotes, **bold**, *italic* / _italic_, and [links](https://...). Links must be https.

const INLINE = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|(?<![\w])_([^_\n]+?)_(?![\w])|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function parseInline(text) {
  const out = [];
  let last = 0;
  const push = (node) => {
    const prev = out[out.length - 1];
    if (node.type === "text" && prev && prev.type === "text") prev.text += node.text; else out.push(node);
  };
  for (const m of String(text).matchAll(INLINE)) {
    if (m.index > last) push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) push({ type: "strong", text: m[1] });
    else if (m[2] !== undefined) push({ type: "em", text: m[2] });
    else if (m[3] !== undefined) push({ type: "em", text: m[3] });
    else {
      const href = safeUrl(m[5]);
      push(href ? { type: "link", text: m[4], href } : { type: "text", text: m[4] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) push({ type: "text", text: text.slice(last) });
  return out;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,3}\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

// Returns an array of blocks: { type: "p"|"h"|"quote", lines: [inline[]] } or { type: "ul"|"ol", items: [inline[]] }.
export function parseMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let current = null;
  const close = () => { current = null; };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { close(); continue; }
    let m;
    if ((m = line.match(HEADING))) { close(); blocks.push({ type: "h", lines: [parseInline(m[1])] }); continue; }
    if ((m = line.match(BULLET)) || (m = line.match(NUMBER))) {
      const type = BULLET.test(line) ? "ul" : "ol";
      if (!current || current.type !== type) { current = { type, items: [] }; blocks.push(current); }
      current.items.push(parseInline(m[1]));
      continue;
    }
    if ((m = line.match(QUOTE))) {
      if (!current || current.type !== "quote") { current = { type: "quote", lines: [] }; blocks.push(current); }
      current.lines.push(parseInline(m[1]));
      continue;
    }
    if (!current || current.type !== "p") { current = { type: "p", lines: [] }; blocks.push(current); }
    current.lines.push(parseInline(line.trim()));
  }
  return blocks;
}

// Plain-text preview (no formatting characters), cut at a word boundary.
export function plainText(source, max = 160) {
  const text = parseMarkdown(source)
    .flatMap((b) => (b.items || b.lines).map((inl) => inl.map((n) => n.text).join("")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trim()}…`;
}
