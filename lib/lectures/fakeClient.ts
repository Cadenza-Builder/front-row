// Test only: fakeDb plus an in-memory `lectures` bucket, as one client for both the RLS and the admin side.
import { vi } from "vitest";
import { fakeDb } from "@/lib/canvas/fakeDb";

export function fakeClient(seed: Parameters<typeof fakeDb>[0], objects: string[] = []) {
  const { db, tables } = fakeDb(seed);
  const stored = new Set(objects);
  const bucket = {
    download: vi.fn(async (p: string) => (stored.has(p) ? { data: new Blob(["RIFF"]), error: null } : { data: null, error: new Error("Object not found") })),
    createSignedUrls: vi.fn(async (ps: string[]) => ({ data: ps.map((p) => ({ path: p, signedUrl: `https://s.test/${p}`, error: null })), error: null })),
    list: vi.fn(async (dir: string, o: { limit: number; offset: number }) => ({
      data: [...stored].filter((n) => n.startsWith(`${dir}/`)).map((n) => ({ name: n.slice(dir.length + 1) })).slice(o.offset, o.offset + o.limit),
      error: null,
    })),
    remove: vi.fn(async (ps: string[]) => (ps.forEach((p) => stored.delete(p)), { data: [], error: null })),
  };
  return { client: { ...(db as object), storage: { from: () => bucket } } as never, tables, stored, bucket };
}
