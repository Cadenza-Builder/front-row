import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, type PDFFont } from "pdf-lib";
import { paperDocx } from "@/lib/papers/docx";

// Lecture notes (lib/lecture toMarkdown's output) as a Word file or a PDF. Word keeps math as its LaTeX source; the PDF
// prints it as readable Unicode (texToText), not typeset.

/** Markdown lines as [heading, text] pairs: a `#` line heads the text line after it; `**` marks are dropped. */
function lines(markdown: string) {
  const out: { heading: string; text: string }[] = [];
  let heading = "";
  // A display formula split over lines is one line, so it prints as one formula.
  for (const raw of markdown.replace(/\$\$[\s\S]+?\$\$/g, (m) => m.replace(/\s*\n\s*/g, " ")).split("\n")) {
    const line = raw.replaceAll("**", "").trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (heading) out.push({ heading, text: "" });
      heading = line.replace(/^#+\s*/, "");
    } else {
      out.push({ heading, text: line });
      heading = "";
    }
  }
  if (heading) out.push({ heading, text: "" });
  return out;
}

export function notesDocx(markdown: string): Uint8Array {
  const all = lines(markdown);
  return paperDocx({ title: "", paragraphs: all.map((l) => l.text), headings: all.map((l) => l.heading), style: null, format: {} });
}

const GREEK = "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega";
const SYMBOLS: Record<string, string> = {
  ...Object.fromEntries(GREEK.split(" ").map((name, i) => [name, "αβγδεεζηθϑικλμνξπρστυφφχψωΓΔΘΛΞΠΣΥΦΨΩ"[i]])),
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈",
  sim: "∼", equiv: "≡", propto: "∝", sum: "Σ", prod: "Π", int: "∫", partial: "∂", nabla: "∇", infty: "∞", in: "∈",
  notin: "∉", to: "→", rightarrow: "→", Rightarrow: "⇒", leftarrow: "←", mid: "|", prime: "′", circ: "∘", ldots: "…",
  dots: "…", cdots: "⋯", left: "", right: "", "!": "", ",": " ", ";": " ", ":": " ", " ": " ", quad: " ", qquad: " ", "\\": " ",
};
const UNWRAP = new Set(["text", "mathrm", "mathbf", "mathit", "mathbb", "mathcal", "operatorname", "boldsymbol"]);
// Characters with a Unicode superscript or subscript form, and those forms, index for index.
const SCRIPTS = { "^": ["0123456789+-=()ni", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ"], _: ["0123456789+-=()aehijklmnoprstuvx", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ"] };
const wrap = (s: string) => (/^√?[\p{L}\p{N}\p{M}.]+$/u.test(s) ? s : `(${s})`);

/** LaTeX as readable Unicode: β̂₁ = (Σ xᵢ)/n. Not typesetting; an unknown command prints its name. */
export function texToText(tex: string): string {
  let i = 0;
  const command = (): string => {
    const name = /^\\([a-zA-Z]+|.?)/.exec(tex.slice(i))![1];
    i += name.length + 1;
    if (name === "frac") return `${wrap(arg())}/${wrap(arg())}`;
    if (name === "sqrt") return "√" + wrap(arg());
    if (name === "hat" || name === "bar") return arg() + (name === "hat" ? "̂" : "̄");
    if (UNWRAP.has(name)) return arg();
    if ((name === "left" || name === "right") && tex[i] === ".") i++;
    return SYMBOLS[name] ?? name;
  };
  // One argument, converted: a {group}, a command, or one character.
  const arg = (): string => {
    while (tex[i] === " ") i++;
    if (tex[i] === "{") return (i++, run("}"));
    return tex[i] === "\\" ? command() : (tex[i++] ?? "");
  };
  const run = (end?: string): string => {
    let out = "";
    while (i < tex.length && tex[i] !== end) {
      const c = tex[i];
      if (c === "\\") out += command();
      else if (c === "^" || c === "_") {
        i++;
        const [from, to] = SCRIPTS[c];
        const s = arg();
        out += s && [...s].every((ch) => from.includes(ch)) ? [...s].map((ch) => to[from.indexOf(ch)]).join("") : `${c}(${s})`;
      } else {
        i++;
        if (c === "{") out += run("}");
        else if (c !== "}") out += c;
      }
    }
    i++; // past the closing brace
    return out;
  };
  return run().replace(/\s+/g, " ").trim().normalize("NFC"); // ȳ as one glyph where Unicode has it
}

const inlineMath = (s: string) => s.replace(/\$(?!\s)([^$]+?)(?<!\s)\$(?!\d)/g, (_, tex: string) => texToText(tex));

// DejaVu Sans cut to Latin, Greek, super/subscripts, arrows and math operators, no ligatures (pdf-lib spaced "fi" wrong), ~105 KB each; licence in fonts/LICENSE-DejaVu.txt.
// Read from disk only here; next.config.ts traces the folder into the export route.
// shortcut: a character outside that cut (Chinese, Arabic) prints as an empty box; add a font if notes need those scripts.
const FONTS = path.join(process.cwd(), "lib/lectures/fonts");

export async function notesPdf(markdown: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const [{ default: fontkit }, regular, heavy] = await Promise.all([
    import("@pdf-lib/fontkit"),
    readFile(path.join(FONTS, "DejaVuSans.ttf")),
    readFile(path.join(FONTS, "DejaVuSans-Bold.ttf")),
  ]);
  pdf.registerFontkit(fontkit);
  const [font, bold] = await Promise.all([pdf.embedFont(regular), pdf.embedFont(heavy)]);
  const [W, H, M] = [612, 792, 56]; // US Letter, ~0.8 in margins
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const write = (text: string, f: PDFFont, size: number, gap: number, x = M) => {
    y -= gap;
    // Greedy word wrap; a word wider than the line is drawn as is.
    let line = "";
    const flush = () => {
      if (y < M + size) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      page.drawText(line, { x, y: (y -= size * 1.35), size, font: f });
      line = "";
    };
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && f.widthOfTextAtSize(next, size) > W - M - x) {
        flush();
        line = word;
      } else line = next;
    }
    if (line) flush();
  };
  const all = lines(markdown);
  all.forEach(({ heading, text }, i) => {
    if (heading) write(inlineMath(heading), bold, i === 0 ? 18 : 13, i === 0 ? 0 : 10);
    // Odd parts are $$display$$ formulas: each on its own indented line.
    text.split(/\$\$([\s\S]+?)\$\$/).forEach((part, j) => {
      const s = j % 2 ? texToText(part) : inlineMath(part).trim();
      if (s) write(s, font, 10.5, 4, j % 2 ? M + 24 : M);
    });
  });
  pdf.setTitle(inlineMath(all[0]?.heading ?? "Lecture notes"));
  return pdf.save();
}
