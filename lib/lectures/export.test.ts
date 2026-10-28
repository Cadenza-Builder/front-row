// @vitest-environment node
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { notesDocx, notesPdf } from "./export";

const MD = "# Price Elasticity\n\nHow demand answers price.\n\n## Demand\n\nThe slope $\\epsilon = \\frac{dQ}{dP}$ — elastic when > 1.\n\nExam: Elasticity is on the midterm\n\n## Terms\n\n- **elasticity**: responsiveness\n";

test("the Word file carries the section headings as headings and the bold marks dropped", () => {
  const xml = strFromU8(unzipSync(notesDocx(MD))["word/document.xml"]);
  expect(xml).toContain('<w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Demand</w:t>');
  expect(xml).toContain("Terms</w:t>");
  expect(xml).toContain("Price Elasticity");
  expect(xml).toContain("elasticity: responsiveness");
  expect(xml).not.toContain("**");
});

test("the PDF opens and survives characters Helvetica cannot draw", async () => {
  const pdf = await PDFDocument.load(await notesPdf(MD + "Σ ∂ 中文\n" + "word ".repeat(3000)));
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getTitle()).toBe("Price Elasticity");
});
