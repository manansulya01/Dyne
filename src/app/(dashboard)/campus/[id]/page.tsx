import type { Metadata } from "next";
import { BuildingView } from "./BuildingView";

export const metadata: Metadata = { title: "Building — Dyne Campus" };

interface Props { params: Promise<{ id: string }>; }

export default async function BuildingPage({ params }: Props) {
  const { id } = await params;
  return <BuildingView id={id} />;
}
