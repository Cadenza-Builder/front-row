// Front Row's drawings for the landing's two scroll scenes (mockups/front-row/find.html), drawn by LandingMotion in fine
// lines as you scroll. Each line carries its slice of the scroll [a, b].
type Line = (d: string, a: number, b: number, cls?: string) => Element;
type Shapes = { R: (x: number, y: number, w: number, h: number) => string; O: (x: number, y: number, r: number) => string; RR: (x: number, y: number, w: number, h: number, r: number) => string };

export const FR_SUN: [number, number, number] = [560, 190, 130];

// How it works: the front of a lecture hall. A board with the lecture on it, the lectern, rows of desks, and a phone on a
// stand in the front row, its view drawn as two fine lines up to the board.
export function FR_HALL(line: Line, { R, O, RR }: Shapes) {
  const shape = (d: string, a: number, b: number) => line(d, a, b, "solid");
  line("M20 560H780", 0, .1);
  shape(R(110, 110, 580, 270), .04, .2);
  line("M100 380H700M100 390H700", .08, .2);
  line("M150 160H330", .14, .22, "hot");
  line("M150 200c12-14 22 14 34 0s22-14 34 0M236 200h18M262 200c10-12 20 12 30 0", .16, .26);
  line("M150 240h40M200 232v16M210 240h50M280 240c10-10 20 10 30 0", .18, .28);
  line("M150 290c14-10 30-10 44 0M206 290h80", .2, .3, "fine");
  line("M420 340V170M420 340H640", .22, .3);
  for (let k = 0; k < 26; k++) { const x = 430 + k * 8, sp = 6 + k * 2.6, y = 330 - k * 5; line(`M${x} ${y - sp}v.1M${x + 3} ${y + sp * .6}v.1`, .26 + k * .004, .3 + k * .004, "hot"); }
  shape("M300 560V450H380V560M290 450H390", .24, .36);
  line("M300 470H380", .3, .38, "fine");
  for (let r = 0; r < 3; r++) line(`M${40 - r * 30} ${490 + r * 26}H${250 - r * 10}M${470 + r * 10} ${490 + r * 26}H${760 + r * 30}`, .3 + r * .03, .42 + r * .03, "fine");
  shape(RR(600, 420, 56, 96, 10), .38, .48);
  line("M628 516V560M606 560H650", .4, .5);
  line(O(628, 440, 6), .44, .5, "hot");
  line("M628 440L380 240M628 440L560 200", .48, .6, "fine");
}

// Inside your notes: one drawing per feature, each across its quarter of the pin.
export const FR_KIT: ((l: Line, a: number, g: Element, s: Shapes) => void)[] = [
  (l, a, g, { R }) => { // the board, read: a board, the maths on it, the camera's frame around it
    l(R(170, 140, 460, 300), a, a + .06, "solid");
    l("M210 190H380", a + .03, a + .07, "hot");
    l("M210 240c14-16 26 16 40 0s26-16 40 0M306 240h20M340 240c12-14 24 14 36 0", a + .05, a + .1);
    l("M210 290h46M268 280v20M282 290h60M360 290c12-12 24 12 36 0", a + .06, a + .11);
    l("M210 350c16-12 34-12 50 0M276 350h90", a + .07, a + .12, "fine");
    l("M150 150v-30h30M620 120h30v30M650 430v30h-30M180 460h-30v-30", a + .09, a + .14, "hot");
  },
  (l, a) => { // every word heard: a sound wave becoming lines of text
    l("M150 300" + Array.from({ length: 24 }, (_, k) => { const h = [20, 50, 30, 80, 45, 100, 60, 35, 90, 55, 25, 70][k % 12]; return `L${160 + k * 9} ${300 - h / 2}L${164 + k * 9} ${300 + h / 2}`; }).join("") + "L380 300", a, a + .07, "hot");
    l("M410 300h30M432 290l10 10-10 10", a + .05, a + .08);
    l("M470 220H650M470 260H630M470 300H650M470 340H600M470 380H640", a + .06, a + .12);
    l("M470 220H520", a + .1, a + .14, "hot");
  },
  (l, a, g, { R, O }) => { // sections written: a page of notes, numbered
    l(R(240, 80, 320, 440), a, a + .06, "solid");
    for (let k = 0; k < 3; k++) { const y = 140 + k * 125, d = a + .03 + k * .025; l(O(285, y, 14), d, d + .04, k === 0 ? "hot" : ""); l(`M315 ${y - 6}H${500 - k * 30}`, d + .01, d + .05, k === 0 ? "hot" : ""); l(`M315 ${y + 24}H520M315 ${y + 48}H${480 - k * 20}`, d + .02, d + .06, "fine"); }
  },
  (l, a, g, { R }) => { // exam hints: a flag planted on the page
    l(R(220, 120, 280, 380), a, a + .06, "solid");
    l("M260 180H460M260 210H420M260 260H460M260 290H400M260 340H450M260 370H380", a + .03, a + .09, "fine");
    l("M520 470V130", a + .06, a + .1, "solid");
    l("M520 140H640L612 190L640 240H520", a + .08, a + .13, "hot");
    l("M250 330H470", a + .1, a + .14, "hot");
  },
];
