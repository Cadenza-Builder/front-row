// @vitest-environment node
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { pdfTextLayer } from "@/lib/extract/pdf";
import { notesDocx, notesPdf, texToText } from "./export";

const MD = "# Price Elasticity\n\nHow demand answers price.\n\n## Demand\n\nThe slope $\\epsilon = \\frac{dQ}{dP}$ — elastic when > 1.\n\nExam: Elasticity is on the midterm\n\n## Terms\n\n- **elasticity**: responsiveness\n";

test("the Word file carries the section headings as headings and the bold marks dropped", () => {
  const xml = strFromU8(unzipSync(notesDocx(MD))["word/document.xml"]);
  expect(xml).toContain('<w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Demand</w:t>');
  expect(xml).toContain("Terms</w:t>");
  expect(xml).toContain("Price Elasticity");
  expect(xml).toContain("elasticity: responsiveness");
  expect(xml).not.toContain("**");
});

test("the PDF opens and paginates, and survives characters the font cannot draw", async () => {
  const pdf = await PDFDocument.load(await notesPdf(MD + "Σ ∂ 中文\n" + "word ".repeat(3000)));
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getTitle()).toBe("Price Elasticity");
});

test("the PDF prints accents, Greek and formulas as themselves, not ? or LaTeX", async () => {
  const md = "# Café Économie\n\nNiño, über, β and Σ.\n\nThe slope $\\epsilon = \\frac{dQ}{dP}$ is shown.\n\nThe estimate: $$\\hat{\\beta}_1 = \\frac{\\sum x_i}{n}$$ and done.\n";
  const { text } = await pdfTextLayer(await notesPdf(md));
  expect(text).toContain("Café Économie");
  expect(text).toContain("Niño, über, β and Σ.");
  expect(text).toContain("ε = dQ/dP");
  expect(text).not.toMatch(/[?\\$]/);
});

test.each([
  ["\\hat{\\beta}_1 = \\frac{\\sum (x_i-\\bar{x})(y_i-\\bar{y})}{\\sum (x_i-\\bar{x})^2}", "β̂₁ = (Σ (xᵢ-x̄)(yᵢ-ȳ))/(Σ (xᵢ-x̄)²)"],
  ["\\epsilon = \\frac{dQ}{dP}", "ε = dQ/dP"],
  ["y = b_0 + b_1 x + u", "y = b₀ + b₁ x + u"],
  ["\\text{Var}(u \\mid x) = \\sigma^2(x)", "Var(u | x) = σ²(x)"],
  ["\\sqrt{x^2 + y^2} \\leq \\left| x \\right| + |y|", "√(x² + y²) ≤ | x | + |y|"],
  ["a \\times b \\cdot c \\neq d \\approx e \\pm f \\geq g", "a × b · c ≠ d ≈ e ± f ≥ g"],
  ["x_{ij}^{T} \\to \\infty", "xᵢⱼ^(T) → ∞"],
  ["\\frac{1}{2} + \\mathrm{SE}_{b} + \\weird", "1/2 + SE_(b) + weird"],
])("texToText %s", (tex, out) => expect(texToText(tex)).toBe(out));
