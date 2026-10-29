import { ADMIN_USER_ID } from "@/lib/admin/id";

/**
 * Front Row is hidden until launch (spec, "Locked until launch"). shortcut: the one env flag in the repo, a deliberate
 * exception to "no env flags"; delete it and this file once Front Row is public. The admin always sees it.
 */
export function frontRowOpen(userId?: string): boolean {
  return process.env.FRONT_ROW_PUBLIC === "1" || (Boolean(ADMIN_USER_ID) && userId === ADMIN_USER_ID);
}
