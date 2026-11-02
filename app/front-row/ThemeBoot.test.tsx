import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeBoot } from "./ThemeBoot";

it("applies the saved theme and Larger text when mounted by a client navigation (no inline script runs then)", () => {
  const kept = new Map([["fr-theme", "light"], ["fr-big", "1"]]);
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null });
  render(<ThemeBoot />);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.classList.contains("fr-big")).toBe(true);
});
