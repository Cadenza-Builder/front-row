import { notFound, redirect } from "next/navigation";
import { listCourses } from "@/lib/lectures/courses";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { me } from "../../me";
import { Home, type Course, type Recent } from "./Home";
import "./screen-fr-home.css";

export const metadata: Metadata = { title: "Front Row" };

export default async function FrontRowHome() {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) notFound();
  if (!userId) redirect("/sign-in?from=front-row");
  // Home shows no "usually now", so listCourses' time zone does not matter here.
  const [{ first, last }, { body }] = await Promise.all([me(), listCourses(supabase, userId, "America/Toronto")]);
  return <Home first={first} initials={`${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?"} data={body as { courses: Course[]; recent: Recent[] }} />;
}
