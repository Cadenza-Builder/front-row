import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

// jsdom has no AnimationEvent: without one React listens for a prefixed name and fireEvent drops animationName.
vi.hoisted(() => Object.assign(window, { AnimationEvent: class extends Event {
  animationName: string;
  constructor(type: string, init: AnimationEventInit = {}) {
    super(type, init);
    this.animationName = init.animationName ?? "";
  }
} }));
let reduced = false;
vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce") }));
const fresh = async () => {
  vi.resetModules(); // a new page load: the once-per-load decision starts over
  return (await import("./Intro")).Intro;
};

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  reduced = false;
});

test("the intro plays once per session: not again on the next visit to Home, nor after a reload", async () => {
  let Intro = await fresh();
  render(<Intro />);
  expect(screen.getByText("Front Row")).toBeInTheDocument();
  fireEvent.animationEnd(document.querySelector(".fr-intro")!, { animationName: "fr-out" });
  expect(document.querySelector(".fr-intro")).toBeNull();
  cleanup();
  render(<Intro />); // back to Home without a reload
  expect(document.querySelector(".fr-intro")).toBeNull();
  cleanup();
  Intro = await fresh();
  render(<Intro />);
  expect(document.querySelector(".fr-intro")).toBeNull();
});

test("the intro is skipped under reduced motion", async () => {
  reduced = true;
  const Intro = await fresh();
  render(<Intro />);
  expect(document.querySelector(".fr-intro")).toBeNull();
});

test("Loading drops ?welcome=1 so a reload does not play it again, and lets Home rise in when done", async () => {
  history.replaceState(null, "", "/front-row/home?welcome=1");
  const { Loading } = await import("./Loading");
  render(<Loading />);
  expect(screen.getByText("Opening your courses")).toBeInTheDocument();
  expect(location.search).toBe("");
  fireEvent.animationEnd(document.querySelector(".fr-load")!, { animationName: "fr-out" });
  expect(document.querySelector(".fr-load")).toBeNull();
  expect(document.documentElement.classList.contains("fr-enter")).toBe(true);
});

test("after the sign-in Loading, coming back to Home does not play the intro", async () => {
  history.replaceState(null, "", "/front-row/home?welcome=1");
  const { Loading } = await import("./Loading");
  render(<Loading />);
  cleanup();
  const Intro = await fresh(); // e.g. Delete Course, then router.push("/front-row/home")
  render(<Intro />);
  expect(document.querySelector(".fr-intro")).toBeNull();
});
