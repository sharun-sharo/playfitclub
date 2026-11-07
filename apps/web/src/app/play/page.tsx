import { ChooseHowYouPlay } from "@/components/play/choose-how-you-play";
import { noIndex } from "@/lib/site-metadata";
import "@/components/play/choose-how-you-play.css";

export const metadata = noIndex(
  "Choose Your Play Mode",
  "No controllers. No wearables. Just you and your movements. Pick phone or laptop Fit Run.",
);

export default function PlayPage() {
  return <ChooseHowYouPlay />;
}
