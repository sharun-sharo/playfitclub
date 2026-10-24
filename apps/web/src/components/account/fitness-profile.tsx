"use client";

import { useEffect, useState } from "react";

type Profile = {
  weightKg: number | null;
  difficulty: string | null;
  fitnessGoal: string | null;
};

export function FitnessProfile() {
  const [profile, setProfile] = useState<Profile>({ weightKg: null, difficulty: null, fitnessGoal: null });
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(true);

  useEffect(() => {
    void fetch("/api/me/profile").then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { profile?: Profile };
      if (body.profile) setProfile(body.profile);
      setLoaded(true);
    });
  }, []);

  return (
    <form
      key={loaded ? "saved" : "blank"}
      className="fp-form fp-form-narrow"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const weight = String(form.get("weightKg") ?? "").trim();
        void fetch("/api/me/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            weightKg: weight === "" ? null : Number(weight),
            difficulty: form.get("difficulty") || null,
            fitnessGoal: form.get("fitnessGoal") || null,
          }),
        }).then(async (response) => {
          const body = (await response.json()) as { message?: string; profile?: Profile };
          setOk(response.ok);
          setMessage(response.ok ? "Fitness profile saved." : body.message ?? "Could not save.");
          if (body.profile) setProfile(body.profile);
        });
      }}
    >
      <p className="fp-muted">Optional. Used only for your own workout estimates. Weight is never guessed.</p>
      <div className="fp-form-grid">
        <div className="fp-field">
          <label htmlFor="weightKg">Weight (kg)</label>
          <input id="weightKg" name="weightKg" type="number" min={30} max={250} step={0.1} defaultValue={profile.weightKg ?? ""} placeholder="30–250" />
        </div>
        <div className="fp-field">
          <label htmlFor="difficulty">Difficulty</label>
          <select id="difficulty" name="difficulty" defaultValue={profile.difficulty ?? ""}>
            <option value="">Not set</option>
            <option value="easy">Easy</option>
            <option value="steady">Steady</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="fp-field fp-field-wide">
          <label htmlFor="fitnessGoal">Fitness goal</label>
          <input id="fitnessGoal" name="fitnessGoal" maxLength={80} defaultValue={profile.fitnessGoal ?? ""} />
        </div>
      </div>
      <div className="fp-actions">
        <button className="fp-btn fp-btn-primary" type="submit">Save fitness profile</button>
      </div>
      {message ? <p className={ok ? "fp-success" : "fp-error"}>{message}</p> : null}
    </form>
  );
}
