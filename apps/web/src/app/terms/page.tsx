import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { termsMetadata } from "@/lib/site-metadata";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = termsMetadata;

export default function TermsPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-legal">
        <p className="fp-kicker">Legal</p>
        <h1>Terms</h1>
        <p>Last updated 29 October 2026.</p>
        <p>
          These terms of use cover PlayFit Club, the service at <a href="https://playfitclub.com">https://playfitclub.com</a>. The service is offered from India. Using the site, the free demo, or an account the team has opened for you means you accept these terms. If you do not accept them, do not use the service.
        </p>
        <p>
          Contact the PlayFit Club team at <a href="mailto:sharunsharo@gmail.com">sharunsharo@gmail.com</a> or on{" "}
          <a href={whatsappUrl("general")}>WhatsApp +91 95665 51345</a>.
        </p>

        <h2>The service</h2>
        <p>
          PlayFit Club is a fitness game. Fit Run runs on the player&apos;s phone. The phone camera detects a jump, a squat, or a lane move. Video is not stored and is not uploaded. Pose stays on the device. You can mirror the phone to a TV or laptop if you want. Fit Fight and Fit Dance are coming soon and are not playable yet.
        </p>
        <p>
          The website is the service. The PlayFit Club Android app loads that website. A future iOS app is intended to load the same website. The site says PlayFit Club is coming to iOS and Android.
        </p>

        <h2>Accounts</h2>
        <p>
          There is no public self-serve registration. Buttons on the site do not grant paid access by themselves and do not take payment. The PlayFit Club team creates an account after a subscription is confirmed.
        </p>
        <p>
          Account data is kept while the account exists. There is no delete button in the app or on the site. You can ask the team to delete the account by email or WhatsApp using the contact above.
        </p>
        <p>
          Signing in sets a session cookie named fitplay_session. The site also uses analytics, including Google Analytics and Vercel Analytics, as described on the privacy page. That notice is at{" "}
          <a href="https://playfitclub.com/privacy">https://playfitclub.com/privacy</a>.
        </p>
        <p>Use an account only for the people it was opened for.</p>

        <h2>Acceptable use</h2>
        <p>When you use PlayFit Club, you agree that you will not:</p>
        <ul>
          <li>Abuse the camera feature, or try to make the game store, upload, or send video or pose data</li>
          <li>Scrape the site, scores, accounts, or gym data, or use automated access that is not ordinary play</li>
          <li>Misuse gym accounts, including sharing seats the plan does not include or using a gym account or dashboard you were not given</li>
          <li>Interfere with the service, with other players, or with the team&apos;s operation of accounts</li>
          <li>Use the service for anything unlawful</li>
        </ul>

        <h2>Demo and paid plans</h2>
        <p>
          The free demo is ₹0. It is 10 minutes of cumulative active camera time. When that time is used, the demo ends and you can open the pricing page. The demo does not start a paid plan.
        </p>
        <p>The listed subscription prices are:</p>
        <ul>
          <li>Individual Pro, ₹999, for one person</li>
          <li>Gym Starter, ₹19,999, for up to 49 accounts</li>
          <li>Gym Pro, ₹39,999, for 50 to 99 accounts</li>
        </ul>
        <p>
          A button, a WhatsApp message, or the gym form does not grant paid access and does not take payment. The team confirms a subscription and then creates the account.
        </p>
        <p>
          A gym enquiry opens WhatsApp. PlayFit Club does not store that form as a booked demo. Sending it does not reserve a time, take payment, or start a subscription.
        </p>

        <h2>No medical advice</h2>
        <p>
          PlayFit Club is a fitness game. It is not medical advice, not a diagnosis, and not a treatment. Play does not promise a fitness or health result. A calorie figure on a signed-in round, when one is stored, is a play estimate and not a medical result. Stop if you feel unwell, and keep a clear space around you. Health questions belong with a qualified person.
        </p>

        <h2>Intellectual property</h2>
        <p>
          The PlayFit Club name, this website, and the game are part of the service. You may use them to play under these terms. You may not copy the game, resell access, or present the site or the game as a different product.
        </p>

        <h2>Your content</h2>
        <p>
          If you save a display name, a short fitness goal, or other text on an account, or if you send a message to the team, you keep the rights you already have in that text. You let PlayFit Club use it to run the account, reply to you, and operate the service. Camera video is not content you upload. The service does not store it and does not upload it.
        </p>

        <h2>Age</h2>
        <p>PlayFit Club is not directed at young children. The service does not ask for a date of birth.</p>

        <h2>Termination</h2>
        <p>
          You can stop using the service at any time. You can ask the team to delete an account by email or WhatsApp. The team can suspend or close access if these terms are broken, if a subscription is not confirmed, or if the service is no longer offered. Closing access does not by itself delete stored account data. Deletion follows a request to the team, or the team deleting what it holds.
        </p>

        <h2>The game can stop or change</h2>
        <p>
          PlayFit Club can stop or change the game, the site, and access to the demo or a plan. Availability can be interrupted. A listed price is the price on the pricing page. A change on the site does not by itself grant paid access.
        </p>

        <h2>Privacy</h2>
        <p>
          The privacy notice describes the camera, accounts, gym enquiries, the fitplay_session cookie, Google Analytics, and Vercel Analytics. It is at{" "}
          <a href="https://playfitclub.com/privacy">https://playfitclub.com/privacy</a>.
        </p>

        <h2>Disputes</h2>
        <p>
          These terms are for the service offered from India. If you have a dispute, contact the PlayFit Club team first at{" "}
          <a href="mailto:sharunsharo@gmail.com">sharunsharo@gmail.com</a> or <a href={whatsappUrl("general")}>WhatsApp +91 95665 51345</a> so the team can try to resolve it.
        </p>

        <h2>Updates</h2>
        <p>
          PlayFit Club can update these terms by publishing the new text on this page. The date at the top is the date of the current terms. If you keep using the service after this page changes, you accept the terms then shown here.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms go to <a href="mailto:sharunsharo@gmail.com">sharunsharo@gmail.com</a> or{" "}
          <a href={whatsappUrl("general")}>WhatsApp +91 95665 51345</a>.
        </p>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
