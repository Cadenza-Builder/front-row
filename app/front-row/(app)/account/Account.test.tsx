import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
const { Account } = await import("./Account");

const props = { first: "Maya", last: "Chen", email: "maya@example.com" };

beforeEach(() => {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) });
  document.documentElement.dataset.theme = "dark";
  vi.stubGlobal("location", { assign: vi.fn() });
  // jsdom has no modal dialogs
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
});

describe("Front Row Account", () => {
  it("Light writes fr-theme and flips data-theme, Dark flips it back", () => {
    render(<Account {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(localStorage.getItem("fr-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Light", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(localStorage.getItem("fr-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Delete Account sends nothing until DELETE is typed", () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    render(<Account {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    const go = screen.getAllByRole("button", { name: "Delete Account" }).at(-1) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(go.disabled).toBe(true);
    fireEvent.click(go);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    expect(go.disabled).toBe(false);
    fireEvent.submit(go.closest("form")!);
    expect(fetch).toHaveBeenCalledWith("/api/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
  });
});
