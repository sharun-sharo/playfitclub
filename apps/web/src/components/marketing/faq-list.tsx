"use client";

import { useId, useState } from "react";

const questions = [
  {
    q: "What is PlayFit Club?",
    a: "PlayFit Club is a fitness arcade. Fit Run, a three-lane 3D run, plays in the browser on a laptop or phone. The camera on that device tracks your body. For a bigger picture, mirror the phone to a TV. There is no separate TV browser game.",
  },
  {
    q: "How does camera-based gameplay work?",
    a: "Choose Laptop, Mobile Only, or Phone+TV mirror, allow the camera, and stand so your body is in frame. The device estimates your pose in the browser. Frames stay on that device. Wait for the countdown, then lean, jump, and squat. A camera estimates a jump. It does not measure jump height, and it does not give medical advice.",
  },
  {
    q: "Do I need a special controller?",
    a: "No. There is no console, no extra sensor, and no pairing code. Your laptop webcam or phone camera runs Fit Run in the browser. Tap Play Now, choose a play mode, and allow the camera.",
  },
  {
    q: "Can I play using my phone and a TV?",
    a: "Yes. The game and camera stay on the phone. Mirror that phone with Smart View, Cast, Screen Mirroring, or HDMI. PlayFit does not run a separate game in a TV browser. The camera needs a secure page.",
  },
  {
    q: "What devices are supported?",
    a: "Use a laptop with a webcam, or a phone with a front camera, in the browser or installed page. Keep your body in frame from head through knees, with good light and space to jump and squat. Mobile Only plays in portrait. Laptop and Phone+TV mirror use landscape. If the camera misses you, allow the camera and step back until your body fits.",
  },
  {
    q: "Can I play with friends?",
    a: "Fit Run is single player. One laptop or phone runs the game. A second device does not join the same run. Mirroring only copies that phone’s screen.",
  },
  {
    q: "Is PlayFit Club suitable for gyms?",
    a: "A gym can buy member accounts so people play Fit Run at home on their own laptop or phone. Gym Starter is ₹19,999 per year for up to 49 accounts. Gym Pro is ₹39,999 per year for 50 to 99 accounts. The gym does not host the game. A WhatsApp enquiry does not assign accounts or start a subscription.",
  },
  {
    q: "Is PlayFit Club free to play?",
    a: "The free demo is ₹0 and includes 10 minutes of cumulative active time. When that time is used, demo time is over and Buy Plan opens Pricing. Fit Run is the playable game. Fit Fight and Fit Dance are coming soon. Nothing on the pricing page takes payment or starts a paid plan.",
  },
];

export function FaqList({ items = questions }: { items?: ReadonlyArray<{ q: string; a: string }> }) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = items.length - 1;
    const next =
      event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : last;
    document.getElementById(`${baseId}-q-${next}`)?.focus();
  }

  return (
    <div className="fp-faq">
      {items.map((item, index) => {
        const open = openIndex === index;
        const panelId = `${baseId}-a-${index}`;
        const buttonId = `${baseId}-q-${index}`;
        return (
          <div key={item.q} className="fp-faq-item">
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span>{item.q}</span>
                <span className="fp-faq-icon" aria-hidden="true">
                  {open ? "–" : "+"}
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
