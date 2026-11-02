import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";
import { me } from "../../me";
import { Account } from "./Account";
import "./screen-fr-account.css";

export const metadata: Metadata = { title: "Account · Front Row" };

export default async function FrontRowAccount() {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) notFound();
  const [{ first, last }, { data }] = await Promise.all([me(), supabase.auth.getClaims()]);
  const email = typeof data?.claims.email === "string" ? data.claims.email : "";
  return <Account first={first} last={last} email={email} />;
}
