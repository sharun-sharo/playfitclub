import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { privacyMetadata } from "@/lib/site-metadata";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = privacyMetadata;

export default function PrivacyPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-legal">
        <p className="fp-kicker">Legal</p>
        <h1>Privacy</h1>
        <p>Last updated 28 October 2026.</p>
        <p>
          This is the privacy notice for PlayFit Club, the service at{" "}
          <a href="https://playfitclub.com">playfitclub.com</a>. The PlayFit Club Android app (com.playfitclub.app) opens that site. Contact the team at{" "}
          <a href="mailto:sharunsharo@gmail.com">sharunsharo@gmail.com</a> or on{" "}
          <a href={whatsappUrl("general")}>WhatsApp +91 95665 51345</a>.
        </p>

        <h2 id="camera">Camera</h2>
        <p>
          Fit Run on the phone uses the front camera to see your body. Pose detection runs on the phone and uses that picture to detect a jump, a squat, or a lane move. The video is not stored. The video is not sent to PlayFit Club. Pose points stay on the phone. PlayFit Club does not keep images, recordings, face templates, or body templates.
        </p>
        <p>
          The Android app requests internet access and the camera. It does not request the microphone. Game sound is playback, not a recording.
        </p>
        <p>
          When you are signed in and the site saves a round, the server can store the result of a move: jump, squat, or lane, a confidence number, and game measurements such as time and distance. That record is not the camera picture and it is not the pose points.
        </p>

        <h2>Account, gym, and play</h2>
        <p>
          The team creates an account after a subscription is confirmed. There is no public registration form. Opening WhatsApp does not create an account, take a card payment, or turn a subscription on.
        </p>
        <p>An account can store:</p>
        <ul>
          <li>Email, used to sign in</li>
          <li>Display name</li>
          <li>Phone number, when the team has one for that account</li>
          <li>A password hash, not the password itself</li>
          <li>Role, and whether the account is active</li>
          <li>Gym membership, including the gym name and member role</li>
          <li>Subscription plan, status, amount, and dates. The team can record that a payment was made. The site does not collect a card number.</li>
          <li>Saved round results for a signed-in round: score, jumps, squats, lane moves, distance, duration, tokens, XP, achievements, and daily mission progress</li>
        </ul>
        <p>
          A signed-in person can also save an optional profile: weight in kilograms, a difficulty setting, and a short fitness goal. Fit Run does not give medical advice. If a weight is saved, a finished signed-in round can store a calorie estimate calculated from that weight and the time the camera was in use. That number is a play estimate stored with the round. It is not a medical result.
        </p>
        <p>A round played without an account is not saved to an account. Camera video from that round is not uploaded.</p>

        <h2>Gym enquiries</h2>
        <p>
          The gym form asks for gym name, contact name, phone number, email, city, and a message. Sending it opens WhatsApp with that text. PlayFit Club&apos;s servers do not store the form. If you send the message, WhatsApp receives it. The site does not book a time, take payment, or start a subscription from that form.
        </p>

        <h2>Analytics</h2>
        <p>
          The site measures page views and these actions after they succeed: play, pricing viewed, individual plan selected, gym plan selected, get started, WhatsApp enquiry (player or gym only), login completed, Fit Run selected, phone pairing completed, and game started. Google Analytics uses measurement ID G-736X842XQL when no other measurement ID is configured. Vercel Analytics also receives the page path. Addresses are reduced to a path, and tokens, codes, email addresses, and phone numbers are removed from them.
        </p>
        <p>
          Analytics is not part of the camera or pose processing. Names, phone numbers, emails, sign-in details, camera frames, and pose points are not sent to analytics.
        </p>

        <h2>Cookies and sign-in</h2>
        <p>
          Signing in sets a cookie named fitplay_session. It is an httpOnly cookie, kept for 14 days, and it holds a signed token with the account id, email, display name, and role. It does not hold the password or a camera image. Signing out clears it. Google Analytics can set its own cookies to count visits. Those cookies are separate from fitplay_session.
        </p>

        <h2>Children</h2>
        <p>
          PlayFit Club is not directed at young children. The service does not ask for a date of birth.
        </p>

        <h2>How long data is kept</h2>
        <p>
          Camera video is not kept, because it is not stored. Account data is kept while the account exists. There is no delete button in the app or on the site. You can ask the team to delete the account data they hold by emailing{" "}
          <a href="mailto:sharunsharo@gmail.com">sharunsharo@gmail.com</a> or by WhatsApp at{" "}
          <a href={whatsappUrl("general")}>+91 95665 51345</a>.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this notice go to <a href="mailto:sharunsharo@gmail.com">sharunsharo@gmail.com</a> or{" "}
          <a href={whatsappUrl("general")}>WhatsApp +91 95665 51345</a>. This page is the privacy policy for https://playfitclub.com/privacy.
        </p>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
