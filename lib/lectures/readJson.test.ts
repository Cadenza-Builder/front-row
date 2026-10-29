// @vitest-environment node
import { NextResponse } from "next/server";
import { expect, test } from "vitest";
import { readJson } from "./readJson";

const req = (body: string, type = "application/json") => new Request("http://x", { method: "POST", headers: { "content-type": type }, body });

test("a cross-site form's text/plain is refused with 415", async () => {
  expect(((await readJson(req('{"a":1}', "text/plain"), 100)) as NextResponse).status).toBe(415);
});

test("a body over the limit is refused with 413", async () => {
  expect(((await readJson(req(`"${"x".repeat(100)}"`), 100)) as NextResponse).status).toBe(413);
});

test("JSON is parsed, and broken JSON is a null body", async () => {
  expect(await readJson(req('{"a":1}'), 100)).toEqual({ body: { a: 1 } });
  expect(await readJson(req("{a"), 100)).toEqual({ body: null });
});
