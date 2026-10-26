"use client";

import { useId, useState } from "react";

const questions = [
  {
    q: "What is PlayFit Club?",
    a: "PlayFit Club is a fitness game on your phone. Fit Run uses the phone camera. A TV shows it only if you mirror the phone with Smart View, Cast, Screen Mirroring, or HDMI.",
  },
  {
    q: "How do I start?",
    a: "Open PlayFit Club on your phone, tap Play Free, allow the camera, and stand where your body is visible. Then jump, squat, and move left or right.",
  },
  {
    q: "Do I need a console or a pairing code?",
    a: "No. There is no console, no extra sensor, and no pairing code. The phone runs Fit Run.",
  },
  {
    q: "Is mirroring required?",
    a: "No. Mirroring is optional. It uses the phone’s own Smart View, Cast, Screen Mirroring, or HDMI. It is not automatic.",
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
