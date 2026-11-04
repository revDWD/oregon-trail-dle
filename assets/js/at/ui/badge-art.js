// Original pixel-art badge sprites (12x12), drawn as SVG rects. Cute, collectible, trail-journal style.
// No external images: every badge is a few rects, crisp at any size, and themable with CSS
// (locked badges are greyed out by the .locked class in at.css).
import { svg } from "./dom.js";

const PALETTE = Object.freeze({
  k: "#3b2f25", w: "#7a5a3c", l: "#b07f4f", c: "#fffaf0", g: "#2f5d46", G: "#5f8a5a", y: "#e0a43a",
  o: "#d96c2c", r: "#a8382a", s: "#8d8273", S: "#c9c2b3", b: "#5c8fb0", n: "#6d4c33", p: "#e6b98f"
});

const forest = (row) => row.repeat(3);

export const SPRITES = Object.freeze({
  boots: ["............", "..kkkk......", "..kwck......", "..kwwk......", "..kwck......", "..kwwk......",
    "..kwwk......", "..kwwkkkk...", "..kwwwwwwk..", "..kwwwwwwwk.", "..kkkkkkkkk.", "............"],
  blaze: ["....gggg....", "...gGGGGg...", "..gGGGGGGg..", "..gGGGGGGg..", "...gggggg...", ".....ww.....",
    "....wccw....", "....wccw....", "....wccw....", "....wccw....", ".....ww.....", "...GGGGGG..."],
  compass: ["....yyyy....", "..yyccccyy..", ".ycccrrcccy.", ".ycccrrcccy.", "yccccrrccccy", "ycccckkccccy",
    "yccccssccccy", ".ycccsscccy.", ".ycccsscccy.", "..yyccccyy..", "....yyyy....", "............"],
  wagon: ["............", "...cccccc...", "..cccccccc..", ".cccccccccc.", ".cccccccccc.", ".wwwwwwwwww.",
    ".wllllllllw.", ".wwwwwwwwww.", "..kk....kk..", ".kwwk..kwwk.", ".kwwk..kwwk.", "..kk....kk.."],
  oxen: ["............", "c..........c", "cc.nnnnnn.cc", ".cnnnnnnnnc.", "..nnnnnnnn..", "..nknnnnkn..",
    "..nnnnnnnn..", "...nppppn...", "...pkppkp...", "...pppppp...", "....pppp....", "............"],
  mountain: ["............", ".....cc.....", "....cccc....", "...ccssss...", "...sssssss..", "..sssssssss.",
    ".sssSssssss.", ".GGsssssGGG.", "GGGGssssGGGG", "GGGGGGGGGGGG", "gggggggggggg", "............"],
  campfire: ["............", ".....o......", ".....oo.....", "....oyo.....", "....oyyo....", "...oyyyo....",
    "...oyccyo...", "....oyyo....", ".ww......ww.", "..wwwwwwww..", ".ww......ww.", "............"],
  bear: ["............", ".nn......nn.", ".nnnnnnnnnn.", ".nnnnnnnnnn.", "nnnknnnnknnn", "nnnnnnnnnnnn",
    "nnnnllllnnnn", ".nnllkkllnn.", ".nnllllllnn.", "..nnnnnnnn..", "....nnnn....", "............"],
  flag: ["..k.........", "..krrrrr....", "..krrrrrrr..", "..krrcrrrr..", "..krrrrrrr..", "..krrrrr....",
    "..k.........", "..k.........", "..k.........", ".GkG........", "GGGGGG......", "............"],
  wheel: ["....wwww....", "..ww.ll.ww..", ".wl..ll..lw.", ".w.l.ll.l.w.", "w...lkkl...w", "wllllkkllllw",
    "wllllkkllllw", "w...lkkl...w", ".w.l.ll.l.w.", ".wl..ll..lw.", "..ww.ll.ww..", "....wwww...."],
  sapling: ["............", "............", "............", "..GG....GG..", "...GG..GG...", "....GwwG....",
    ".....ww.....", ".....ww.....", ".....ww.....", "...llllll...", "..llllllll..", "............"],
  pine: [".....gg.....", "....gGGg....", "...gGGGGg...", "....gGGg....", "...gGGGGg...", "..gGGGGGGg..",
    "...gGGGGg...", "..gGGGGGGg..", ".gGGGGGGGGg.", ".....ww.....", ".....ww.....", "..llllllll.."],
  forest: ["............", "............", ".....gg.....", "....gGGg....", forest(".gg."), forest("gGGg"),
    forest(".gg."), forest("gGGg"), forest("gGGg"), forest(".ww."), "llllllllllll", "............"],
  // Wildlife photography badges.
  camera: ["............", "...kkk......", ".kkkkkkkkkk.", ".kSSSSSSSyk.", ".kSSSkkSSSk.", ".kSSkbbkSSk.",
    ".kSSkbbkSSk.", ".kSSSkkSSSk.", ".kSSSSSSSSk.", ".kkkkkkkkkk.", "............", "............"],
  bird: ["............", ".......bb...", "......bbbb..", "......bkbbkk", "..bbbbbbbb..", ".bbbbbcccc..",
    "bbbbbbcccc..", "..bbbbccc...", "....bbcc....", ".....k.k....", "....kk.kk...", "............"],
  butterfly: ["....k..k....", ".....kk.....", ".kkk.kk.kkk.", "kooookkooook", "kooookkooook", "kocookkoocok",
    ".koookkoook.", "..kookkook..", ".koookkoook.", ".kcookkoock.", "..kkk..kkk..", "............"],
  fern: ["......G.....", ".....GgG....", "...GG.g.GG..", "....GGgGG...", "..GGG.g.GGG.", "...GGGgGGG..",
    ".GGGG.g.GGGG", "..GGGGgGGGG.", "......g.....", ".....gg.....", "....gg......", "............"],
  binoculars: ["............", "............", "..kkk..kkk..", "..kwk..kwk..", ".kkkkkkkkkk.", ".kwwkkkkwwk.",
    "kkwwwkkwwwkk", "kbbbbkkbbbbk", "kbccbkkbccbk", "kbbbbkkbbbbk", ".kkkk..kkkk.", "............"],
  book: ["............", "..kkkkkkkk..", "..kgggggggk.", "..kgyyyyygk.", "..kgggggggk.", "..kggGGGggk.",
    "..kgGGGGGgk.", "..kggGGGggk.", "..kgggggggk.", "..kccccccck.", "..kkkkkkkk..", "............"],
  star: [".....yy.....", ".....yy.....", "....yyyy....", "yyyyyyyyyyyy", ".yyyyccyyyy.", "..yyyyyyyy..",
    "...yyyyyy...", "...yyyyyy...", "..yyy..yyy..", "..yy....yy..", ".yy......yy.", "............"],
  footprint: ["..nn.n.n.n..", "..nn.n.n.n..", "............", "...nnnnnn...", "..nnnnnnnn..", "..nnnnnnnn..",
    "..nnnnnnnn..", "...nnnnnnn..", "...nnnnnn...", "...nnnnnn...", "....nnnn....", "............"],
  paw: ["...nn..nn...", "...nn..nn...", "............", ".nn......nn.", ".nn......nn.", "............",
    "....nnnn....", "...nnnnnn...", "..nnnnnnnn..", "..nnnnnnnn..", "...nn..nn...", "............"],
  frog: ["............", "..GG....GG..", ".GckG..GckG.", ".GGGGGGGGGG.", "GGGGGGGGGGGG", "GGGkkkkkkGGG",
    ".GGGGGGGGGG.", "..GGGGGGGG..", ".gGGyyyyGGg.", "gg.GGGGGG.gg", "g..g....g..g", "............"],
  laurel: ["............", "..g..yy..g..", ".gG..yy..Gg.", "gG.yyyyyy.Gg", "gG..yyyy..Gg", "gG..y..y..Gg",
    ".gG......Gg.", "..gG....Gg..", "...gG..Gg...", "....rrrr....", "...rr..rr...", "............"]
});

// Runs of same-coloured pixels on a row become one rect (fewer nodes, same picture).
function pixels(rows, silhouette = null) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      if (PALETTE[ch]) rects.push(svg("rect", { x: x + 2, y: y + 2, width: end - x, height: 1, fill: silhouette || PALETTE[ch] }));
      x = end;
    }
  });
  return rects;
}

// A round medallion with the sprite on it. Decorative: the badge's text label carries the meaning.
// prestige: an earned top-honour badge gets a gold, double-ringed medallion.
export function badgeArt(name, { earned = true, size = 56, prestige = false } = {}) {
  const rows = SPRITES[name] || SPRITES.blaze;
  const gold = earned && prestige;
  return svg("svg", { class: `badge-art${earned ? "" : " locked"}${gold ? " prestige" : ""}`, viewBox: "0 0 16 16", width: size, height: size,
    "aria-hidden": "true", focusable: "false", "shape-rendering": "crispEdges" },
  svg("circle", { cx: 8, cy: 8, r: 7.6, fill: gold ? "#ffe9a8" : earned ? "#f4e3b5" : "#e7e2d8", stroke: gold ? "#b8860b" : earned ? "#7a5a3c" : "#a69c8c", "stroke-width": gold ? 0.8 : 0.6 }),
  ...(gold ? [svg("circle", { cx: 8, cy: 8, r: 6.7, fill: "none", stroke: "#b8860b", "stroke-width": 0.3 })] : []),
  ...pixels(rows, earned ? null : "#8a8072"));
}
