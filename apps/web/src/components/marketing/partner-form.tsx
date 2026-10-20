"use client";

import { useState } from "react";

const STORAGE_KEY = "fitplay.partnerEnquiry";

interface Fields {
  name: string;
  business: string;
  email: string;
  phone: string;
  locations: string;
  message: string;
}

const empty: Fields = { name: "", business: "", email: "", phone: "", locations: "", message: "" };

function validate(fields: Fields) {
  const errors: Partial<Record<keyof Fields, string>> = {};
  if (fields.name.trim().length < 2) errors.name = "Enter your name.";
  if (fields.business.trim().length < 2) errors.business = "Enter the business or gym name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) errors.email = "Enter a valid work email.";
  if (fields.phone.trim()) {
    const digits = fields.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) errors.phone = "Enter a valid phone number or leave it blank.";
  }
  if (fields.locations.trim()) {
    if (!/^\d{1,4}$/.test(fields.locations.trim()) || Number(fields.locations) < 1) {
      errors.locations = "Enter a whole number of locations or leave it blank.";
    }
  }
  if (fields.message.trim().length < 12) errors.message = "Add a short message (at least 12 characters).";
  return errors;
}

export function PartnerForm() {
  const [fields, setFields] = useState<Fields>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  function update(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus("idle");
      return;
    }
    const entry = {
      name: fields.name.trim(),
      business: fields.business.trim(),
      email: fields.email.trim(),
      phone: fields.phone.trim(),
      locations: fields.locations.trim(),
      message: fields.message.trim(),
      storedAt: new Date().toISOString(),
    };
    try {
      const previous = window.localStorage.getItem(STORAGE_KEY);
      const list = previous ? (JSON.parse(previous) as unknown[]) : [];
      const safeList = Array.isArray(list) ? list : [];
      safeList.push(entry);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeList));
      setFields(empty);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <form className="fp-form" id="partner" noValidate onSubmit={onSubmit}>
      <div className="fp-form-head">
        <p className="fp-kicker">Partnership enquiry</p>
        <h3>Tell us about the gym.</h3>
        <p className="fp-muted">
          Register interest in member seats so people can play FitRunner at home. There is no enquiry API yet, and a full seat signup is not live. Submitting stores a draft in this browser only. PlayFit Club does not email it, and this form does not create a gym account or a subscription.
        </p>
      </div>
      <div className="fp-form-grid">
        <Field id="partner-name" label="Name" value={fields.name} error={errors.name} autoComplete="name" onChange={(value) => update("name", value)} />
        <Field
          id="partner-business"
          label="Business or gym name"
          value={fields.business}
          error={errors.business}
          autoComplete="organization"
          onChange={(value) => update("business", value)}
        />
        <Field
          id="partner-email"
          label="Work email"
          type="email"
          value={fields.email}
          error={errors.email}
          autoComplete="email"
          onChange={(value) => update("email", value)}
        />
        <Field
          id="partner-phone"
          label="Phone number"
          hint="Optional"
          type="tel"
          value={fields.phone}
          error={errors.phone}
          autoComplete="tel"
          onChange={(value) => update("phone", value)}
        />
        <Field
          id="partner-locations"
          label="Number of locations"
          hint="Optional"
          inputMode="numeric"
          value={fields.locations}
          error={errors.locations}
          onChange={(value) => update("locations", value)}
        />
      </div>
      <div className="fp-field fp-field-wide">
        <label htmlFor="partner-message">Message</label>
        <textarea
          id="partner-message"
          name="message"
          rows={5}
          value={fields.message}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "partner-message-error" : undefined}
          onChange={(event) => update("message", event.target.value)}
        />
        {errors.message ? (
          <span id="partner-message-error" className="fp-error">
            {errors.message}
          </span>
        ) : null}
      </div>
      {Object.keys(errors).length > 0 ? (
        <p className="fp-error" role="alert">
          Check the highlighted fields. Nothing was stored.
        </p>
      ) : null}
      {status === "saved" ? (
        <p className="fp-success" role="status">
          Saved in this browser only. This enquiry was not emailed. It is ready for an API and stays on this device until then.
        </p>
      ) : null}
      {status === "failed" ? (
        <p className="fp-error" role="alert">
          Could not store the enquiry in this browser. It was not sent anywhere.
        </p>
      ) : null}
      <button className="fp-btn fp-btn-primary" type="submit">
        Submit enquiry
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  type = "text",
  value,
  error,
  autoComplete,
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  value: string;
  error?: string;
  autoComplete?: string;
  inputMode?: "numeric";
  onChange: (value: string) => void;
}) {
  return (
    <div className="fp-field">
      <label htmlFor={id}>
        {label}
        {hint ? <em> {hint}</em> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={`${id}-error`} className="fp-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
