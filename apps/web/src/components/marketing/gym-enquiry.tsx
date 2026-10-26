"use client";

import { useState } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { whatsappNumber } from "@/lib/whatsapp";

export function GymEnquiry() {
  const [error, setError] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const lines = [
      "PlayFit Club gym demo",
      `Gym name: ${String(form.get("gymName") ?? "").trim()}`,
      `Contact name: ${String(form.get("contactName") ?? "").trim()}`,
      `Phone number: ${String(form.get("phone") ?? "").trim()}`,
      `Email: ${String(form.get("email") ?? "").trim()}`,
      `City: ${String(form.get("city") ?? "").trim()}`,
      `Message: ${String(form.get("message") ?? "").trim()}`,
    ];
    const url = `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(lines.join("\n"))}`;
    trackEvent("whatsapp_enquiry_clicked", { audience: "gym" });
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) setError("The message could not be sent.");
  }

  return (
    <form className="fp-enquiry" id="demo" onSubmit={onSubmit}>
      <div className="fp-form-grid">
        <div className="fp-field">
          <label htmlFor="gym-name">Gym name</label>
          <input id="gym-name" name="gymName" autoComplete="organization" required />
        </div>
        <div className="fp-field">
          <label htmlFor="contact-name">Contact name</label>
          <input id="contact-name" name="contactName" autoComplete="name" required />
        </div>
        <div className="fp-field">
          <label htmlFor="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" required />
        </div>
        <div className="fp-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="fp-field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" autoComplete="address-level2" required />
        </div>
        <div className="fp-field fp-field-wide">
          <label htmlFor="message">Message</label>
          <textarea id="message" name="message" rows={4} required />
        </div>
      </div>
      {error ? (
        <p className="fp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="fp-actions">
        <button className="fp-btn fp-btn-primary" type="submit">
          Request Your Demo
        </button>
      </div>
      <p className="fp-muted">Sending opens WhatsApp with this message. It does not book a time, take payment, or start a subscription.</p>
    </form>
  );
}
