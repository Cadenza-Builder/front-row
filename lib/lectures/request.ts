import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) });

/**
 * The /front-row landing's Request Access (docs/front-row-request-access-plan.md). A visitor has no account yet, so the
 * row has no user_id and only the server writes it. A repeat email answers 200 too: nothing tells who else asked.
 */
export async function requestAccess(input: unknown): Promise<{ status: 200 | 400 | 429 | 500 }> {
  const body = Body.safeParse(input);
  if (!body.success) return { status: 400 };
  const { data, error } = await createAdminClient().rpc("request_front_row_access", { p_email: body.data.email });
  if (error) {
    console.error("[front-row request]", error.message);
    return { status: 500 };
  }
  return { status: data ? 200 : 429 };
}
