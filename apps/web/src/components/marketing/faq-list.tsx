"use client";

import { useId, useState } from "react";

const questions = [
  {
    q: "What is PlayFit Club?",
    a: "PlayFit Club is a fitness arcade. Fit Run, a three-lane 3D run, plays on your phone. The front camera tracks your body. A TV or laptop shows the game only when you mirror that phone.",
  },
  {
    q: "How does camera-based gameplay work?",
    a: "Open the game on your phone, tap Play Demo, and allow the camera. The phone estimates your pose in the browser. Frames stay on the phone. Turn sideways, stand so your body is in frame, wait for the countdown, then lean, jump, and squat. A phone camera estimates a jump. It does not measure jump height, and it does not give medical advice.",
  },
  {
    q: "Do I need a special controller?",
    a: "No. There is no console, no extra sensor, and no pairing code. The phone runs Fit Run. Tap Play Demo, allow the front camera, and turn the phone sideways.",
  },
  {
    q: "Can I play using my phone and a TV?",
    a: "Yes. The game stays on the phone. Mirror that phone with Smart View, Cast, Screen Mirroring, or HDMI. The camera needs a secure page.",
  },
  {
    q: "What devices are supported?",
    a: "Use a phone with a front camera. Play in landscape in the phone browser or the installed page, with your body in frame from head through knees, good light, and space to jump and squat. If the camera misses you, allow the camera, turn sideways, and step back until your body fits.",
  },
  {
    q: "Can I play with friends?",
    a: "Fit Run is single player. One phone runs the game. A second phone does not join the same run. Mirroring only copies that phone’s screen.",
  },
  {
    q: "Is PlayFit Club suitable for gyms?",
    a: "A gym can buy member accounts so people play Fit Run at home on their own phones. Gym Starter is ₹19,999 per year for up to 49 accounts. Gym Pro is ₹39,999 per year for 50 to 99 accounts. The gym does not host the game. A WhatsApp enquiry does not assign accounts or start a subscription.",
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
