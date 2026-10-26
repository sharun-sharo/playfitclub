"use client";

import { useId, useState } from "react";

const questions = [
  {
    q: "What is PlayFit Club?",
    a: "PlayFit Club is a fitness arcade in the browser. Fit Run, a three-lane endless run, plays on your phone. Mirror that phone screen to a TV or laptop with Smart View, Cast, or Screen Mirroring.",
  },
  {
    q: "How does camera-based gameplay work?",
    a: "After you allow the camera, the phone estimates your pose in the browser with MediaPipe. Frames stay on the phone. They are not uploaded or stored, and PlayFit Club does not keep biometric templates. You calibrate a neutral stance, then lean, jump, and squat. Lighting, distance, and a full-body view change how well that works. A phone camera estimates a jump. It does not measure jump height.",
  },
  {
    q: "Do I need a special controller?",
    a: "No. There is no console and no extra sensor. The phone runs Fit Run. Open https://playfitclub.com/play/phone, allow the front camera, and mirror that phone screen to a TV or laptop.",
  },
  {
    q: "Can I play using my phone and a TV?",
    a: "Yes. Play on your phone at https://playfitclub.com/play/phone, then mirror that phone screen to the TV or laptop with Smart View, Cast, or Screen Mirroring. The game is on the phone. The camera needs a secure page.",
  },
  {
    q: "What devices are supported?",
    a: "A current browser for the screen, and a phone browser that can access a camera. Pose tracking has not been signed off on a physical phone by this project’s automated tests. You start the camera yourself with Turn camera on. Front and rear cameras can be switched when the browser allows it. Keep shoulders, hips, knees, and ankles in frame.",
  },
  {
    q: "Can I play with friends?",
    a: "These games are single player. One phone runs Fit Run. Mirror that phone screen to a TV or laptop. A second phone does not join the same run.",
  },
  {
    q: "Is PlayFit Club suitable for gyms?",
    a: "A gym buys member seats so people can play FitRunner at home on a television or laptop and a phone camera. The gym does not host the game. A full seat signup is not live yet. Proposed seat packages are listed on Pricing and are not charged there.",
  },
  {
    q: "Is PlayFit Club free to play?",
    a: "You can open a home session without an account. Pricing lists proposed amounts only. Nothing on that page takes payment or starts a subscription.",
  },
];

export function FaqList() {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = questions.length - 1;
    const next =
      event.key === "ArrowDown" ? (index + 1) % questions.length : event.key === "ArrowUp" ? (index - 1 + questions.length) % questions.length : event.key === "Home" ? 0 : last;
    document.getElementById(`${baseId}-q-${next}`)?.focus();
  }

  return (
    <div className="fp-faq">
      {questions.map((item, index) => {
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
