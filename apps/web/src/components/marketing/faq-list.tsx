"use client";

import { useId, useState } from "react";

const questions = [
  {
    q: "What is PlayFit Club?",
    a: "PlayFit Club is a fitness arcade in the browser. A screen runs the game, and a phone joins that session so body movement becomes the control. The game you can play now is FitRunner, a three-lane endless run.",
  },
  {
    q: "How does camera-based gameplay work?",
    a: "After you allow the camera, the phone estimates your pose in the browser with MediaPipe. Frames stay on the phone. They are not uploaded or stored, and PlayFit Club does not keep biometric templates. You calibrate a neutral stance, then lean, jump, and squat. Lighting, distance, and a full-body view change how well that works. A phone camera estimates a jump. It does not measure jump height.",
  },
  {
    q: "Do I need a special controller?",
    a: "No. There is no console and no extra sensor. The phone is the controller. If the camera cannot be used, the TV offers a keyboard fallback. That fallback is labeled as a test control, not as camera tracking.",
  },
  {
    q: "Can I play using my phone and a TV?",
    a: "Yes. Open /play on the television or computer. The lobby shows a QR code and a join code. The phone opens the matching /join page. The camera needs a secure page. https://localhost works on the same computer. A phone on another device needs HTTPS, or the browser blocks the camera.",
  },
  {
    q: "What devices are supported?",
    a: "A current browser for the screen, and a phone browser that can access a camera. Pose tracking has not been signed off on a physical phone by this project’s automated tests. You start the camera yourself with Turn camera on. Front and rear cameras can be switched when the browser allows it. Keep shoulders, hips, knees, and ankles in frame.",
  },
  {
    q: "Can I play with friends?",
    a: "Yes. One TV session accepts two players. Each person uses their own phone. One camera does not track two people. Both players share the same obstacle pattern and race the score.",
  },
  {
    q: "Is PlayFit Club suitable for gyms?",
    a: "A gym buys member seats so people can play FitRunner at home on a television or laptop and a phone camera. The gym does not host the game. A full seat signup is not live yet. The enquiry form on this page stores a draft in this browser and does not email it. Proposed seat packages are listed on Pricing and are not charged there.",
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
