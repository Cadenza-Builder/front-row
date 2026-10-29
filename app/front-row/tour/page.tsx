import type { Metadata } from "next";
import { me } from "../me";
import { Tour } from "./Tour";
import "../back.css";
import "./screen-fr-tour.css";

export const metadata: Metadata = { title: "Front Row" };

export default async function FrontRowTour() {
  const { first } = await me();
  return <Tour first={first} />;
}
