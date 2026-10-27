import { NextResponse } from "next/server";
import { createLecture } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, userId } = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // JSON only: a cross-site form can post text/plain without a preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const out = await createLecture(supabase, userId, body);
  return NextResponse.json(out.body, { status: out.code });
}
