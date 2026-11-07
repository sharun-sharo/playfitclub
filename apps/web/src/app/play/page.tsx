import { ChooseHowYouPlay } from "@/components/play/choose-how-you-play";
import { playMetadata } from "@/lib/site-metadata";
import "@/components/play/choose-how-you-play.css";

export const metadata = playMetadata;

export default function PlayPage() {
  return <ChooseHowYouPlay />;
}
