import { NextResponse } from "next/server";
import { requestAccess } from "@/lib/lectures/request";

// The /front-row landing's Request Access. Public: a visitor has no account yet (docs/front-row-request-access-plan.md).
export async function POST(request: Request) {
  const { status } = await requestAccess(await request.json().catch(() => null));
  return NextResponse.json({ ok: status === 200 }, { status });
}
