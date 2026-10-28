import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { paperDocx } from "@/lib/papers/docx";

// Lecture notes (lib/lecture toMarkdown's output) as a Word file or a PDF. Math stays as its LaTeX source.

/** Markdown lines as [heading, text] pairs: a `#` line heads the text line after it; `**` marks are dropped. */
function lines(markdown: string) {
  const out: { heading: string; text: string }[] = [];
  let heading = "";
  for (const raw of markdown.split("\n")) {
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

// shortcut: the standard fonts draw Latin-1 only, so Greek and other scripts print as "?"; embed a Unicode font via
// @pdf-lib/fontkit if students export notes in other scripts.
const latin1 = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

export async function notesPdf(markdown: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const [font, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  const [W, H, M] = [612, 792, 56]; // US Letter, ~0.8 in margins
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const write = (text: string, f: PDFFont, size: number, gap: number) => {
    y -= gap;
    // Greedy word wrap; a word wider than the line is drawn as is.
    let line = "";
    const flush = () => {
      if (y < M + size) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      page.drawText(line, { x: M, y: (y -= size * 1.35), size, font: f });
      line = "";
    };
    for (const word of latin1(text).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && f.widthOfTextAtSize(next, size) > W - 2 * M) {
        flush();
        line = word;
      } else line = next;
    }
    if (line) flush();
  };
  const all = lines(markdown);
  all.forEach(({ heading, text }, i) => {
    if (heading) write(heading, bold, i === 0 ? 18 : 13, i === 0 ? 0 : 10);
    if (text) write(text, font, 10.5, 4);
  });
  pdf.setTitle(latin1(all[0]?.heading ?? "Lecture notes"));
  return pdf.save();
}
