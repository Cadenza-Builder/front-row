import { NextResponse } from "next/server";
import { createCourse, listCourses } from "@/lib/lectures/courses";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";

// Home's list. `?tz=` is the browser's time zone, so "usually now" is the student's weekday and hour.
export async function GET(request: Request) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let tz = new URL(request.url).searchParams.get("tz") ?? "America/Toronto";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "America/Toronto";
  }
  const out = await listCourses(supabase, userId, tz);
  return NextResponse.json(out.body, { status: out.code });
}

export async function POST(request: Request) {
  const { userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // JSON only: a cross-site form can post text/plain without a preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 1024) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const out = await createCourse(userId, body);
  return NextResponse.json(out.body, { status: out.code });
}
