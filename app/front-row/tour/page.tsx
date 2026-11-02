import { notFound } from "next/navigation";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { me } from "../me";
import { Tour } from "./Tour";
import "../back.css";
import "./screen-fr-tour.css";

export const metadata: Metadata = { title: "Front Row" };

export default async function FrontRowTour() {
  if (!frontRowOpen((await getUser()).userId ?? undefined)) notFound();
  const { first } = await me();
  return <Tour first={first} />;
}
