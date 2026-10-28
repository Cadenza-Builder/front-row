import type { Lecture, Shot } from "../lectures/[id]/LectureNotes";

// The public sample lecture (mockups/front-row/read.html and wait.html): what the landing page's See Sample Notes opens.
// Board photos are crops of one 1280 × 854 frame, public/front-row/sample-board.jpg.
const shot = (t: number, [x, y, w, h]: number[], alt: string): Shot => ({ t, src: "/front-row/sample-board.jpg", board: { x1: x, y1: y, x2: x + w, y2: y + h, w: 1280, h: 854 }, alt });
const WHOLE = [200, 80, 620, 470];

export const SAMPLE: Lecture = {
  id: null,
  course: "ECO220",
  number: 9,
  label: "ECO220 · Lecture 9 · Mon Oct 27 · 52 min",
  seconds: 3120,
  linked: null,
  shots: [
    shot(4, WHOLE, "The board titled Lecture: Linear Regression."),
    shot(400, [200, 90, 820, 330], "The regression model y = b0 + b1 x + u."),
    shot(712, WHOLE, "Var(u | x) = sigma squared of x."),
    shot(790, [200, 230, 560, 130], "Residual = y minus y-hat."),
    shot(860, [300, 300, 460, 250], "A residual plot of residuals against fitted values that fans out."),
    shot(905, WHOLE, "Variance increases as fitted value goes up."),
  ],
  turns: [
    { start: 4, text: "Today we look at heteroskedasticity. When the variance of the error term depends on X, the fan shape appears in the residual plot." },
    { start: 400, text: "So the model is y equals b-zero plus b-one x plus u. Everything we don't see lives in u." },
    { start: 712, text: "Now, the variance of u given x. If that's a function of x, the spread changes as x changes." },
    { start: 790, text: "Take this and move it here. That gap, y minus y-hat, is the residual." },
    { start: 860, text: "If you see this picture, the fan, this will be on the midterm." },
    { start: 905, text: "Small fitted values, small spread. Bigger fitted values, the spread gets much larger." },
  ],
  notes: {
    title: "Linear Regression",
    summary: "When the variance of the error depends on $x$, the residual plot fans out, and that fan is on the midterm.",
    sections: [
      {
        heading: "The regression model",
        body:
          "The model says $y$ depends on $x$ through an intercept $b_0$ and a slope $b_1$. One more unit of $x$ moves $y$ by $b_1$ on average. Everything else that moves $y$, all the things the line cannot see, sits in the error $u$.\n\n" +
          "The professor wrote the model first and left it up for the whole hour: every later idea on the board is about $u$.",
        snaps: [1],
        exam: [],
        boxes: [
          {
            kind: "formula",
            tex: "y = b_0 + b_1 x + u",
            symbols: [
              { sym: "b_0", meaning: "intercept, $y$ when $x = 0$" },
              { sym: "b_1", meaning: "slope, change in $y$ per unit of $x$" },
              { sym: "u", meaning: "error, everything else that moves $y$" },
            ],
          },
        ],
      },
      {
        heading: "Residuals",
        body:
          "We never see $u$, so we look at what the fitted line misses instead. For one point, the residual is the real $y$ minus the line's prediction $\\hat{y}$. On the board: “take this and move it here”, the gap between the point and the line.\n\n" +
          "With an intercept in the model the residuals add up to zero, so their average tells you nothing. Their spread does.",
        snaps: [3],
        exam: [],
        boxes: [
          {
            kind: "formula",
            tex: "e = y - \\hat{y}",
            symbols: [
              { sym: "e", meaning: "residual for one point" },
              { sym: "y", meaning: "the value observed" },
              { sym: "\\hat{y}", meaning: "the value the line predicts" },
            ],
          },
          {
            kind: "example",
            question: "The fitted line is $\\hat{y} = 2 + 0.5x$. A student who studied $x = 4$ hours scored $y = 5.5$. What is the residual?",
            steps: ["Put $x = 4$ into the line to get the prediction. $$\\hat{y} = 2 + 0.5(4) = 4$$", "Subtract the prediction from what was observed. $$e = 5.5 - 4 = 1.5$$"],
            answer: "The residual is $1.5$: the student scored 1.5 points above the line.",
          },
        ],
      },
      {
        heading: "When the spread changes",
        body:
          "Plot each residual against its fitted value. If the points stay in an even band around zero, the variance of $u$ is constant. If the band widens as the fitted value grows, the variance depends on $x$: this is heteroskedasticity.\n\n" +
          "The board note read “variance increases as fitted value ↑”, next to a plot that fans out to the right.",
        snaps: [4],
        exam: [{ quote: "If you see this picture, the fan, that is on the midterm.", t: 860 }],
        boxes: [
          {
            kind: "graph",
            title: "Residuals vs fitted values",
            x: "fitted value",
            y: "residual",
            series: [
              {
                label: "residuals",
                // The mockup's fan: spread growing with the fitted value.
                points: [
                  [0.4, -0.2], [0.6, 0.25], [0.8, -0.17], [1, -0.29], [1.2, 0.28], [1.4, 0.05], [1.6, -0.27], [1.8, 0.45], [2, 0.51], [2.2, 0.09],
                  [2.4, 0.44], [2.6, 0.35], [2.8, 0.89], [3, -0.77], [3.2, -0.4], [3.4, 0.71], [3.6, 0.71], [3.8, -1.7], [4, 0.74], [4.2, -0.13],
                  [4.4, 1.86], [4.6, 1.41], [4.8, -1.81], [5, 0.07], [5.2, 2.2], [5.4, 1.02], [5.6, 0.81], [5.8, 0.45], [6, 2.47], [6.2, 2.53],
                  [6.4, -0.82], [6.6, -1.09], [6.8, 2.29], [7, -1.17], [7.2, -2.5], [7.4, -1.5], [7.6, -0.54], [7.8, -1.6], [8, 3.5], [8.2, 0.47],
                  [8.4, 1.93], [8.6, 3.25], [8.8, -3.88], [9, -2.04], [9.2, 0.56], [9.4, 0.08],
                ],
              },
            ],
          },
          { kind: "mistake", text: "Reading the fan as a bad line. The line can be right on average; what breaks is the spread, so the constant-variance assumption fails, not the fit." },
        ],
      },
    ],
    words: [
      { term: "Heteroskedasticity", meaning: "error variance depends on the regressor, $\\text{Var}(u \\mid x) = \\sigma^2(x)$." },
      { term: "Residual", meaning: "observed minus fitted, $y - \\hat{y}$." },
      { term: "Residual plot", meaning: "residuals against fitted values, to check constant variance." },
    ],
    together:
      "The model splits $y$ into a line and an error $u$. Residuals stand in for $u$, and plotting them against fitted values shows whether its variance is constant: an even band means yes, a fan means heteroskedasticity.",
  },
};
