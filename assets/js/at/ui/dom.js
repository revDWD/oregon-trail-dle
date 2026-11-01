// Tiny DOM helper. Text is only ever set with textContent / text nodes, never innerHTML.

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.setAttribute("class", value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "text") el.textContent = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
}

function append(el, children) {
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function formatMiles(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} mi`;
}
