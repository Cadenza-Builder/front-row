import { NextResponse } from "next/server";
import { readSyllabus } from "@/lib/lectures/courses";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";

// Extracting a long PDF and one model call.
export const maxDuration = 120;
// Vercel refuses a request body over 4.5 MB before this runs; this says so in words the student can act on.
const MAX_BYTES = 4 * 1024 * 1024;

// Multipart with one `file`. A cross-site form can send multipart, but only into the caller's own course, and the
// result is only that course's keywords and times.
export async function POST(request: Request, ctx: RouteContext<"/api/lecture-courses/[id]/syllabus">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? Infinity) > MAX_BYTES) return NextResponse.json({ error: "This file is larger than 4 MB. Upload a smaller file." }, { status: 413 });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size > MAX_BYTES) return NextResponse.json({ error: "Send a syllabus file under 4 MB." }, { status: 400 });
  const out = await readSyllabus(supabase, userId, (await ctx.params).id, file);
  return NextResponse.json(out.body, { status: out.code });
}
