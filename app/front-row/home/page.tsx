import type { Metadata } from "next";
import { me } from "../me";
import { Home } from "./Home";
import "./screen-fr-home.css";

export const metadata: Metadata = { title: "Front Row" };

export default async function FrontRowHome() {
  const { first, last } = await me();
  return <Home initials={`${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?"} name={`${first} ${last}`.trim() || "you"} />;
}
