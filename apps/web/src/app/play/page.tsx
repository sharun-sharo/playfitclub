import type { Metadata } from "next";
import { PlayLobby } from "@/components/play/play-lobby";

export const metadata: Metadata = {
  title: "Play — PlayFit Club",
  description: "The PlayFit Club game is being rebuilt. Open a session so a phone can join and run pose detection.",
};

export default function PlayPage() {
  return <PlayLobby />;
}
