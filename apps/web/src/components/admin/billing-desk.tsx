"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PaymentDesk, SubscriptionDesk } from "@/components/admin/subscription-desk";

type Section = "users" | "gyms" | "subscriptions" | "payments";

export function BillingDesk({ section }: { section: Section }) {
  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page fp-console">
        <p className="fp-kicker">Super Admin</p>
        <h1 className="fp-title-wide">{title(section)}</h1>
        <nav className="fp-actions" aria-label="Billing">
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin">Overview</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/users">Users</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/gyms">Gyms</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/assignments">Assignments</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/subscriptions">Subscriptions</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/payments">Payments</Link>
        </nav>
        {section === "users" ? <Users /> : null}
        {section === "gyms" ? <Gyms /> : null}
        {section === "subscriptions" ? <SubscriptionDesk /> : null}
        {section === "payments" ? <PaymentDesk /> : null}
      </main>
    </AppShell>
  );
}

function title(section: Section) {
  if (section === "users") return "Users";
  if (section === "gyms") return "Gyms";
  if (section === "subscriptions") return "Subscriptions";
  return "Payments";
}

function Delivery({ value }: { value: { temporaryPassword?: string; activationPath?: string } | null }) {
  if (!value) return null;
  return (
    <p className="fp-note">
      Copy this once. It is not stored and will not be shown again.
      {value.temporaryPassword ? ` Temporary password: ${value.temporaryPassword}` : ""}
      {value.activationPath ? ` Link: ${value.activationPath}` : ""}
    </p>
  );
}

function Users() {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [query, setQuery] = useState({ q: "", role: "", plan: "", status: "" });
  const [delivery, setDelivery] = useState<DeliveryValue>(null);
  const [error, setError] = useState("");

  function load(next = query) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.role) params.set("role", next.role);
    if (next.plan) params.set("plan", next.plan);
    if (next.status) params.set("status", next.status);
    void fetch(`/api/admin/billing/users?${params.toString()}`).then(async (response) => {
      const body = (await response.json()) as { users?: Array<Record<string, unknown>>; message?: string };
      if (!response.ok) setError(body.message ?? "Could not load users.");
      setUsers(body.users ?? []);
    });
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <form className="fp-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next = { q: String(form.get("q") ?? ""), role: String(form.get("role") ?? ""), plan: String(form.get("plan") ?? ""), status: String(form.get("status") ?? "") }; setQuery(next); load(next); }}>
        <div className="fp-form-grid">
          <Field label="Search" name="q" />
          <Select label="Role" name="role" options={["", "INDIVIDUAL", "GYM_OWNER", "SUPER_ADMIN", "PLAYER", "ADMIN"]} />
          <Select label="Plan" name="plan" options={["", "individual_pro", "free_demo"]} />
          <Select label="Status" name="status" options={["", "ACTIVE", "SUSPENDED"]} />
        </div>
        <button className="fp-btn fp-btn-ghost" type="submit">Filter</button>
      </form>
      <form className="fp-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void fetch("/api/admin/billing/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), displayName: form.get("displayName"), role: form.get("role") }) })
          .then(async (response) => {
            const body = (await response.json()) as { message?: string; delivery?: DeliveryValue };
            if (!response.ok) { setError(body.message ?? "Could not create the user."); return; }
            setDelivery(body.delivery ?? null);
            setError("");
            load();
          });
      }}>
        <h2>Create account</h2>
        <div className="fp-form-grid">
          <Field label="Name" name="displayName" />
          <Field label="Email" name="email" type="email" />
          <Select label="Role" name="role" options={["INDIVIDUAL", "GYM_OWNER", "SUPER_ADMIN"]} />
        </div>
        <button className="fp-btn fp-btn-primary" type="submit">Create</button>
      </form>
      <Delivery value={delivery} />
      {error ? <p className="fp-error">{error}</p> : null}
      <ul className="fp-stack">
        {users.map((user) => {
          const sub = (user.individualSubscriptions as Array<Record<string, unknown>> | undefined)?.[0];
          const plan = sub?.plan as { name?: string } | undefined;
          return (
            <li key={String(user.id)} className="fp-list-card">
              <h2>{String(user.displayName)}</h2>
              <p className="fp-status">{String(user.email ?? "No email")} · {String(user.role)} · {String(user.accountStatus)}{plan?.name ? ` · ${plan.name} ${String(sub?.status ?? "")}` : ""}</p>
              <div className="fp-inline-actions">
                <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => void fetch(`/api/admin/billing/users/${String(user.id)}/reset`, { method: "POST" }).then(async (response) => { const body = (await response.json()) as { delivery?: DeliveryValue; message?: string }; if (!response.ok) setError(body.message ?? "Could not reset credentials."); else setDelivery(body.delivery ?? null); })}>Reset credentials</button>
                <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => void fetch(`/api/admin/billing/users/${String(user.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountStatus: user.accountStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" }) }).then(() => load())}>{user.accountStatus === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Gyms() {
  const [gyms, setGyms] = useState<Array<Record<string, unknown>>>([]);
  const [delivery, setDelivery] = useState<DeliveryValue>(null);
  const [error, setError] = useState("");
  function load() {
    void fetch("/api/admin/billing/gyms").then(async (response) => {
      const body = (await response.json()) as { gyms?: Array<Record<string, unknown>>; message?: string };
      if (!response.ok) setError(body.message ?? "Could not load gyms.");
      setGyms(body.gyms ?? []);
    });
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <form className="fp-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void fetch("/api/admin/billing/gyms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), ownerName: form.get("ownerName"), ownerEmail: form.get("ownerEmail"), seatLimit: Number(form.get("seatLimit")), planCode: form.get("planCode") }) })
          .then(async (response) => {
            const body = (await response.json()) as { message?: string; delivery?: DeliveryValue };
            if (!response.ok) { setError(body.message ?? "Could not create the gym."); return; }
            setDelivery(body.delivery ?? null);
            load();
          });
      }}>
        <h2>Create gym</h2>
        <div className="fp-form-grid">
          <Field label="Gym name" name="name" />
          <Field label="Owner name" name="ownerName" />
          <Field label="Owner email" name="ownerEmail" type="email" />
          <Field label="Seat limit" name="seatLimit" type="number" />
          <Select label="Plan" name="planCode" options={["gym_starter", "gym_pro"]} />
        </div>
        <button className="fp-btn fp-btn-primary" type="submit">Create gym</button>
      </form>
      <Delivery value={delivery} />
      {error ? <p className="fp-error">{error}</p> : null}
      <ul className="fp-stack">
        {gyms.map((gym) => {
          const owner = gym.owner as { displayName?: string; email?: string | null };
          const available = gym.seatLimit === null ? "no allocation" : `${Number(gym.seatLimit) - Number(gym.occupiedSeats)} available`;
          return (
            <li key={String(gym.id)} className="fp-list-card">
              <h2>{String(gym.name)}</h2>
              <p className="fp-status">{owner?.displayName} · {owner?.email} · {String(gym.subscriptionStatus)} · {String(gym.occupiedSeats)} occupied · {available}</p>
              <div className="fp-inline-actions">
                {(["ACTIVE", "TRIALING", "EXPIRED"] as const).map((status) => (
                  <button key={status} type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => void fetch(`/api/admin/gyms/${String(gym.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscriptionStatus: status }) }).then(async (response) => { if (!response.ok) { const body = (await response.json()) as { message?: string }; setError(body.message ?? "Could not update the gym."); } else load(); })}>{status}</button>
                ))}
              </div>
              <form className="fp-inline-actions" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void fetch(`/api/admin/billing/gyms/${String(gym.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seatLimit: Number(form.get("seatLimit")), planCode: form.get("planCode") }) }).then(() => load()); }}>
                <input name="seatLimit" type="number" min={1} defaultValue={Number(gym.seatLimit ?? 49)} aria-label="Seat limit" />
                <select name="planCode" defaultValue="gym_starter" aria-label="Plan for seat limit"><option value="gym_starter">Gym Starter</option><option value="gym_pro">Gym Pro</option></select>
                <button className="fp-btn fp-btn-ghost fp-btn-sm" type="submit">Save seats</button>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type DeliveryValue = { temporaryPassword?: string; activationPath?: string } | null;

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <div className="fp-field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} />
    </div>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <div className="fp-field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={options[0]}>
        {options.map((option) => <option key={option || "any"} value={option}>{option || "Any"}</option>)}
      </select>
    </div>
  );
}
