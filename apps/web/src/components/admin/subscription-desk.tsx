"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type Filter = "all" | "active" | "expiring" | "expired" | "payment_pending";
type CustomerType = "player" | "gym";
type PayStatus = "PAID" | "PENDING" | "PARTIAL";
type Period = "MONTHLY" | "QUARTERLY" | "YEARLY";
type Panel = "view" | "renew" | "edit" | "pay" | "extend" | "plan" | "cancel";

interface Preview {
  planName?: string;
  priceLabel?: string;
  amountLabel?: string;
  startsOn: string;
  expiresOn: string;
  durationLabel: string;
  seatText?: string | null;
  statusLabel?: string;
  paymentLabel?: string;
  pendingLabel?: string;
  note?: string;
}

interface Match {
  id: string;
  kind: "player" | "gym";
  name: string;
  phoneLabel: string;
  detail: string;
  usable: boolean;
}

interface DeskRow {
  id: string;
  name: string;
  phoneLabel: string;
  customerType: "Player" | "Gym";
  planName: string;
  expiryLabel: string;
  statusLabel: string;
  paymentLabel: string;
  startsLabel: string;
  remainingLabel: string;
  amountLabel: string;
  paidLabel: string;
  pendingLabel: string;
  amountPendingInr: number;
  amountInr: number;
  gym: null | {
    name: string;
    ownerName: string;
    capacity: number | null;
    assignedPlayers: Array<{ name: string; phoneLabel: string }>;
    availableSeats: number | null;
  };
  history: Array<{ action: string; actor: string; when: string; note: string }>;
  payments: Array<{ amountLabel: string; status: string; method: string; when: string; note: string }>;
}

interface Summary {
  active: number;
  expiringSoon: number;
  expired: number;
  paymentsPending: number;
  revenueCollectedInr: number;
}

interface Delivery {
  temporaryPassword?: string;
  signInEmail?: string;
}

const PLAYER_PLANS = [
  { code: "free_demo", label: "Free demo · ₹0" },
  { code: "individual_pro", label: "Individual Pro · ₹999" },
];
const GYM_PLANS = [
  { code: "gym_starter", label: "Gym Starter · ₹19,999 · up to 49 seats" },
  { code: "gym_pro", label: "Gym Pro · ₹39,999 · 51–99 seats" },
];
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expiring", label: "Expiring" },
  { id: "expired", label: "Expired" },
  { id: "payment_pending", label: "Payment pending" },
];

function rupees(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

async function read(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export function SubscriptionDesk() {
  const [rows, setRows] = useState<DeskRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [windowDays, setWindowDays] = useState(14);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("view");
  const [customerType, setCustomerType] = useState<CustomerType>("player");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planCode, setPlanCode] = useState("individual_pro");
  const [paymentStatus, setPaymentStatus] = useState<PayStatus>("PENDING");
  const [received, setReceived] = useState("");
  const [period, setPeriod] = useState<Period>("YEARLY");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [seatLimit, setSeatLimit] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [choiceMessage, setChoiceMessage] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const plans = customerType === "gym" ? GYM_PLANS : PLAYER_PLANS;

  function load(nextQuery = query, nextFilter = filter, keepId = selectedId) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextFilter !== "all") params.set("filter", nextFilter);
    void fetch(`/api/admin/billing/subscriptions?${params.toString()}`).then(async (response) => {
      const body = await read(response);
      if (!response.ok) {
        setError(String(body.message ?? "Could not load subscriptions."));
        return;
      }
      const list = (body.subscriptions as DeskRow[] | undefined) ?? [];
      setRows(list);
      setSummary((body.summary as Summary | undefined) ?? null);
      setWindowDays(Number(body.expiringWithinDays ?? 14));
      if (keepId && !list.some((row) => row.id === keepId)) setSelectedId(null);
    });
  }

  useEffect(() => { load("", "all", null); }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetch("/api/admin/billing/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "preview",
          customerType,
          name: name || "Preview",
          phone: phone || "+91 90000 00000",
          planCode,
          paymentStatus,
          period,
          startsOn: startsOn || undefined,
          endsOn: endsOn || undefined,
          seatLimit: seatLimit ? Number(seatLimit) : undefined,
          receivedInr: paymentStatus === "PARTIAL" && received ? Number(received) : undefined,
        }),
      }).then(async (response) => {
        const body = await read(response);
        if (!response.ok) {
          setPreview(null);
          return;
        }
        setPreview((body.preview as Preview | undefined) ?? null);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [customerType, planCode, paymentStatus, period, startsOn, endsOn, seatLimit, received]);

  function open(row: DeskRow, next: Panel) {
    setSelectedId(row.id);
    setPanel(next);
    setError("");
  }

  function resetChoice() {
    setConfirmedId(null);
    setMatches([]);
    setChoiceMessage("");
    setCanCreate(false);
  }

  async function checkCustomer() {
    setError("");
    setConfirmedId(null);
    const params = new URLSearchParams({ type: customerType, name, phone });
    const response = await fetch(`/api/admin/billing/customers?${params.toString()}`);
    const body = await read(response);
    if (!response.ok) {
      setError(String(body.message ?? "Could not check that customer."));
      return;
    }
    setChoiceMessage(String(body.message ?? ""));
    setCanCreate(Boolean(body.canCreate));
    setMatches((body.matches as Match[] | undefined) ?? []);
  }

  async function save(createAccount: boolean) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/billing/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerType,
        name,
        phone,
        planCode,
        paymentStatus,
        period,
        startsOn: startsOn || undefined,
        endsOn: endsOn || undefined,
        seatLimit: seatLimit ? Number(seatLimit) : undefined,
        receivedInr: paymentStatus === "PARTIAL" && received ? Number(received) : undefined,
        confirmedId,
        createAccount,
      }),
    });
    const body = await read(response);
    setBusy(false);
    if (!response.ok) {
      setError(String(body.message ?? "Could not save the subscription."));
      return;
    }
    if (body.needsChoice) {
      setChoiceMessage(String(body.message ?? ""));
      setCanCreate(Boolean(body.canCreate));
      setMatches((body.matches as Match[] | undefined) ?? []);
      return;
    }
    if (body.alreadyOpen && typeof body.subscriptionId === "string") {
      setNotice(String(body.message ?? "This customer already has a subscription."));
      setSelectedId(body.subscriptionId);
      setPanel("view");
      load(query, "all", body.subscriptionId);
      return;
    }
    setDelivery((body.delivery as Delivery | null) ?? null);
    setNotice(String(body.message ?? "Subscription saved."));
    setName("");
    setPhone("");
    resetChoice();
    const createdId = typeof body.id === "string" ? body.id : null;
    if (createdId) {
      setSelectedId(createdId);
      setPanel("view");
    }
    load("", "all", createdId);
    setQuery("");
    setFilter("all");
  }

  return (
    <>
      <p className="fp-note">WhatsApp renewal: +91 95665 51345. Opening WhatsApp does not record a payment or renew a subscription. Recording a payment here is a ledger entry, not a charge.</p>
      <div className="fp-stats">
        <button type="button" className="fp-stat" aria-pressed={filter === "active"} onClick={() => { setFilter("active"); load(query, "active"); }}>
          <span className="fp-kicker">Active subscriptions</span>
          <strong>{summary ? summary.active : "—"}</strong>
          <span className="fp-status">Still in force, including those expiring soon</span>
        </button>
        <button type="button" className="fp-stat" aria-pressed={filter === "expiring"} onClick={() => { setFilter("expiring"); load(query, "expiring"); }}>
          <span className="fp-kicker">Expiring soon</span>
          <strong>{summary ? summary.expiringSoon : "—"}</strong>
          <span className="fp-status">Within {windowDays} days</span>
        </button>
        <button type="button" className="fp-stat" aria-pressed={filter === "expired"} onClick={() => { setFilter("expired"); load(query, "expired"); }}>
          <span className="fp-kicker">Expired</span>
          <strong>{summary ? summary.expired : "—"}</strong>
          <span className="fp-status">End date has passed</span>
        </button>
        <button type="button" className="fp-stat" aria-pressed={filter === "payment_pending"} onClick={() => { setFilter("payment_pending"); load(query, "payment_pending"); }}>
          <span className="fp-kicker">Payments pending</span>
          <strong>{summary ? summary.paymentsPending : "—"}</strong>
          <span className="fp-status">Ledger balance still due</span>
        </button>
        <article className="fp-stat">
          <span className="fp-kicker">Revenue collected</span>
          <strong>{summary ? rupees(summary.revenueCollectedInr) : "—"}</strong>
          <span className="fp-status">Sum of paid and partial payments in the ledger</span>
        </article>
      </div>

      <form className="fp-form" onSubmit={(event) => { event.preventDefault(); load(query, filter); }}>
        <div className="fp-field">
          <label htmlFor="subscription-search">Search by name or phone</label>
          <input id="subscription-search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button className="fp-btn fp-btn-ghost" type="submit">Search</button>
      </form>
      <div className="fp-filters" role="toolbar" aria-label="Subscription filters">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className="fp-btn fp-btn-ghost fp-btn-sm" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); load(query, item.id); }}>{item.label}</button>
        ))}
      </div>

      <div className="fp-table-wrap">
        <table className="fp-table">
          <caption className="fp-muted">Subscriptions</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Player or gym</th>
              <th>Plan</th>
              <th>Expiry date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>No subscriptions match this search. Create one with a name and phone.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.phoneLabel}</td>
                <td>{row.customerType}</td>
                <td>{row.planName}</td>
                <td>{row.expiryLabel}</td>
                <td>{row.statusLabel}</td>
                <td>
                  <div className="fp-inline-actions">
                    <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => open(row, "view")}>View</button>
                    <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => open(row, "renew")}>Renew</button>
                    <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => open(row, "edit")}>Edit</button>
                    <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => open(row, "pay")}>Record payment</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? <CustomerPanel row={selected} panel={panel} setPanel={setPanel} onDone={(message) => { setNotice(message); load(query, filter, selected.id); }} onError={setError} /> : null}

      <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <h2>Create subscription</h2>
        <p className="fp-status">Price, start date, expiry, duration, seats, and status are calculated. A new account shows a temporary password once. It is not emailed.</p>
        <div className="fp-form-grid">
          <div className="fp-field">
            <label htmlFor="customer-type">Customer type</label>
            <select id="customer-type" value={customerType} onChange={(event) => { const next = event.target.value as CustomerType; setCustomerType(next); setPlanCode(next === "gym" ? "gym_starter" : "individual_pro"); resetChoice(); }}>
              <option value="player">Player</option>
              <option value="gym">Gym</option>
            </select>
          </div>
          <div className="fp-field">
            <label htmlFor="customer-name">Name</label>
            <input id="customer-name" value={name} onChange={(event) => { setName(event.target.value); resetChoice(); }} required />
          </div>
          <div className="fp-field">
            <label htmlFor="customer-phone">Phone</label>
            <input id="customer-phone" value={phone} onChange={(event) => { setPhone(event.target.value); resetChoice(); }} inputMode="tel" autoComplete="tel" required />
          </div>
          <div className="fp-field">
            <label htmlFor="customer-plan">Plan</label>
            <select id="customer-plan" value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
              {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.label}</option>)}
            </select>
          </div>
          <div className="fp-field">
            <label htmlFor="customer-payment">Payment status</label>
            <select id="customer-payment" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PayStatus)}>
              <option value="PAID">Paid</option>
              <option value="PENDING">Payment pending</option>
              <option value="PARTIAL">Partial payment</option>
            </select>
          </div>
          {paymentStatus === "PARTIAL" ? (
            <div className="fp-field">
              <label htmlFor="amount-received">Amount received (INR)</label>
              <input id="amount-received" type="number" min={1} value={received} onChange={(event) => setReceived(event.target.value)} />
            </div>
          ) : null}
        </div>
        {customerType === "gym" ? <p className="fp-status">{planCode === "gym_pro" ? "Gym Pro includes 51–99 seats." : "Gym Starter includes up to 49 seats."}</p> : null}
        {preview ? (
          <div className="fp-quote">
            <p>{preview.planName} · {preview.priceLabel} · starts {preview.startsOn} · expires {preview.expiresOn} · {preview.durationLabel}</p>
            <p>{preview.statusLabel} · {preview.paymentLabel}{preview.pendingLabel ? ` · pending ${preview.pendingLabel}` : ""}{preview.seatText ? ` · ${preview.seatText}` : ""}</p>
          </div>
        ) : null}
        <details className="fp-advanced">
          <summary>Advanced</summary>
          <div className="fp-form-grid">
            <div className="fp-field">
              <label htmlFor="subscription-length">Subscription length</label>
              <select id="subscription-length" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
                <option value="YEARLY">Yearly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div className="fp-field">
              <label htmlFor="start-date">Start date</label>
              <input id="start-date" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
            </div>
            <div className="fp-field">
              <label htmlFor="expiry-date">Expiry date</label>
              <input id="expiry-date" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
            </div>
            {customerType === "gym" ? (
              <div className="fp-field">
                <label htmlFor="seat-limit">Seat limit</label>
                <input id="seat-limit" type="number" min={1} value={seatLimit} onChange={(event) => setSeatLimit(event.target.value)} />
              </div>
            ) : null}
          </div>
        </details>
        <div className="fp-actions">
          <button className="fp-btn fp-btn-ghost" type="button" onClick={() => void checkCustomer()}>Check name and phone</button>
          <button className="fp-btn fp-btn-primary" type="submit" disabled={busy}>{busy ? "Saving" : "Save subscription"}</button>
          {canCreate ? <button className="fp-btn fp-btn-primary" type="button" disabled={busy} onClick={() => void save(true)}>Create account and subscription</button> : null}
        </div>
        {choiceMessage ? <p className="fp-status" role="status">{choiceMessage}</p> : null}
        {matches.length > 0 ? (
          <ul className="fp-stack">
            {matches.map((match) => (
              <li key={`${match.kind}-${match.id}`} className="fp-list-card">
                <h3>{match.name}</h3>
                <p className="fp-status">{match.phoneLabel} · {match.detail}</p>
                {match.usable ? <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setConfirmedId(match.id)}>Use this customer</button> : null}
                {confirmedId === match.id ? <p className="fp-success">Using {match.name}. Save the subscription to continue.</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      {delivery ? (
        <p className="fp-note" role="status">
          Copy this once. It is not stored and will not be shown again. It was not emailed.
          {delivery.signInEmail ? ` Sign-in email: ${delivery.signInEmail}.` : ""}
          {delivery.temporaryPassword ? ` Temporary password: ${delivery.temporaryPassword}` : ""}
        </p>
      ) : null}
      {notice ? <p className="fp-success" role="status">{notice}</p> : null}
      {error ? <p className="fp-error">{error}</p> : null}
    </>
  );
}

function CustomerPanel({ row, panel, setPanel, onDone, onError }: { row: DeskRow; panel: Panel; setPanel: (panel: Panel) => void; onDone: (message: string) => void; onError: (message: string) => void }) {
  const [review, setReview] = useState<Preview | null>(null);
  const [period, setPeriod] = useState<Period>("YEARLY");
  const [renewPayment, setRenewPayment] = useState<"NONE" | "PAID" | "PENDING">("NONE");
  const [days, setDays] = useState(14);
  const [planCode, setPlanCode] = useState(row.customerType === "Gym" ? "gym_starter" : "individual_pro");
  const [editName, setEditName] = useState(row.name);
  const [editPhone, setEditPhone] = useState(row.phoneLabel === "No phone yet" ? "" : row.phoneLabel);
  const [amount, setAmount] = useState(String(row.amountPendingInr || row.amountInr));
  const [method, setMethod] = useState("UPI");
  const [payStatus, setPayStatus] = useState("PAID");
  const [paidAt, setPaidAt] = useState(localDateTimeValue());
  const [payNote, setPayNote] = useState("");

  useEffect(() => {
    setEditName(row.name);
    setEditPhone(row.phoneLabel === "No phone yet" ? "" : row.phoneLabel);
    setAmount(String(row.amountPendingInr || row.amountInr));
    setPlanCode(row.customerType === "Gym" ? "gym_starter" : "individual_pro");
  }, [row]);

  useEffect(() => {
    if (panel !== "renew" && panel !== "extend" && panel !== "plan") {
      setReview(null);
      return;
    }
    setReview(null);
    const params = new URLSearchParams({ preview: panel === "plan" ? "plan" : panel });
    if (panel === "renew") params.set("period", period);
    if (panel === "extend") params.set("days", String(days));
    if (panel === "plan") params.set("planCode", planCode);
    void fetch(`/api/admin/billing/subscriptions/${row.id}?${params.toString()}`).then(async (response) => {
      const body = await read(response);
      if (!response.ok) {
        onError(String(body.message ?? "Could not calculate that change."));
        setReview(null);
        return;
      }
      setReview((body.preview as Preview | undefined) ?? null);
    });
  }, [panel, period, days, planCode, row.id]);

  async function patch(body: Record<string, unknown>, success: string) {
    const response = await fetch(`/api/admin/billing/subscriptions/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await read(response);
    if (!response.ok) {
      onError(String(payload.message ?? "Could not save that change."));
      return;
    }
    onError("");
    onDone(success);
    setPanel("view");
  }

  async function record() {
    const response = await fetch("/api/admin/billing/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscriptionId: row.id,
        amountInr: Number(amount),
        paidAt,
        method,
        status: payStatus,
        notes: payNote || "Admin ledger entry. No card or payment provider was charged.",
        transactionRef: "",
        invoiceRef: "",
      }),
    });
    const payload = await read(response);
    if (!response.ok) {
      onError(String(payload.message ?? "Could not record the payment."));
      return;
    }
    onError("");
    onDone("Payment recorded in the ledger. It was not charged to a card.");
    setPanel("view");
  }

  const plans = row.customerType === "Gym" ? GYM_PLANS : PLAYER_PLANS;

  return (
    <section className="fp-panel" id="customer-panel" aria-labelledby="customer-panel-title">
      <h2 id="customer-panel-title">{row.name}</h2>
      <dl className="fp-status">
        <div>Phone: {row.phoneLabel}</div>
        <div>Type: {row.customerType}</div>
        <div>Plan: {row.planName}</div>
        <div>Start: {row.startsLabel}</div>
        <div>Expiry: {row.expiryLabel}</div>
        <div>{row.remainingLabel}</div>
        <div>Payment: {row.paymentLabel}</div>
        <div>Amount paid: {row.paidLabel}</div>
        <div>Amount pending: {row.pendingLabel}</div>
      </dl>
      {row.gym ? (
        <div>
          <h3>{row.gym.name}</h3>
          <p className="fp-status">Owner {row.gym.ownerName}</p>
          <p className="fp-status">Capacity {row.gym.capacity ?? "not allocated"} · assigned {row.gym.assignedPlayers.length} · available {row.gym.availableSeats ?? "none"}</p>
          <ul className="fp-stack">
            {row.gym.assignedPlayers.length === 0 ? <li className="fp-muted">No players assigned yet.</li> : null}
            {row.gym.assignedPlayers.map((player) => (
              <li key={`${player.name}-${player.phoneLabel}`}>{player.name} · {player.phoneLabel}</li>
            ))}
          </ul>
          <p className="fp-status">Assign players by name, phone, and gym name on Gym assignments. Owners still see only their own gym.</p>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/assignments">Assign players</Link>
        </div>
      ) : null}
      <div className="fp-actions">
        <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setPanel("renew")}>Renew</button>
        <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setPanel("plan")}>Change plan</button>
        <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setPanel("pay")}>Record payment</button>
        <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setPanel("extend")}>Extend</button>
        <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setPanel("cancel")}>Cancel</button>
        <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => setPanel("edit")}>Edit</button>
      </div>

      {panel === "renew" ? (
        <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void patch({ action: "renew", period, paymentStatus: renewPayment }, "Renewed. The new expiry is saved and the earlier history stays."); }}>
          <h3>Renew</h3>
          <div className="fp-field">
            <label htmlFor="renew-period">Period</label>
            <select id="renew-period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="YEARLY">Yearly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div className="fp-field">
            <label htmlFor="renew-payment">Payment</label>
            <select id="renew-payment" value={renewPayment} onChange={(event) => setRenewPayment(event.target.value as "NONE" | "PAID" | "PENDING")}>
              <option value="NONE">Leave payment history as it is</option>
              <option value="PAID">Record this amount as paid</option>
              <option value="PENDING">Record this amount as payment pending</option>
            </select>
          </div>
          {review ? <p className="fp-quote">Amount {review.amountLabel}. New expiry {review.expiresOn}. Length {review.durationLabel}. {review.note}</p> : null}
          <button className="fp-btn fp-btn-primary" type="submit">Confirm renewal</button>
        </form>
      ) : null}

      {panel === "extend" ? (
        <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void patch({ action: "extend", days }, "Extended. Earlier history stays."); }}>
          <h3>Extend</h3>
          <div className="fp-actions">
            {[7, 14, 30].map((option) => (
              <button key={option} type="button" className="fp-btn fp-btn-ghost fp-btn-sm" aria-pressed={days === option} onClick={() => setDays(option)}>{option} days</button>
            ))}
          </div>
          <div className="fp-field">
            <label htmlFor="extend-days">Days</label>
            <input id="extend-days" type="number" min={1} max={3650} value={days} onChange={(event) => setDays(Number(event.target.value))} />
          </div>
          {review ? <p className="fp-quote">New expiry {review.expiresOn}. {review.note}</p> : null}
          <button className="fp-btn fp-btn-primary" type="submit">Confirm extension</button>
        </form>
      ) : null}

      {panel === "plan" ? (
        <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void patch({ action: "change_plan", planCode }, "Plan updated."); }}>
          <h3>Change plan</h3>
          <div className="fp-field">
            <label htmlFor="next-plan">Plan</label>
            <select id="next-plan" value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
              {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.label}</option>)}
            </select>
          </div>
          {review ? <p className="fp-quote">{review.note} Amount {review.amountLabel}. Expiry stays {review.expiresOn}.</p> : null}
          <button className="fp-btn fp-btn-primary" type="submit">Confirm plan change</button>
        </form>
      ) : null}

      {panel === "pay" ? (
        <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void record(); }}>
          <h3>Record payment</h3>
          <p className="fp-status">This writes a ledger entry for {row.name}. It does not charge a card, and it does not turn play on by itself.</p>
          <div className="fp-form-grid">
            <div className="fp-field">
              <label htmlFor="pay-amount">Amount INR</label>
              <input id="pay-amount" type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="fp-field">
              <label htmlFor="pay-method">Method</label>
              <select id="pay-method" value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="fp-field">
              <label htmlFor="pay-status">Status</label>
              <select id="pay-status" value={payStatus} onChange={(event) => setPayStatus(event.target.value)}>
                <option value="PAID">Paid</option>
                <option value="PENDING">Payment pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
            <div className="fp-field">
              <label htmlFor="pay-date">Date</label>
              <input id="pay-date" type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </div>
            <div className="fp-field">
              <label htmlFor="pay-note">Note</label>
              <input id="pay-note" value={payNote} onChange={(event) => setPayNote(event.target.value)} />
            </div>
          </div>
          <button className="fp-btn fp-btn-primary" type="submit">Record payment</button>
        </form>
      ) : null}

      {panel === "edit" ? (
        <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void patch({ action: "edit_contact", name: editName, phone: editPhone }, "Name and phone saved."); }}>
          <h3>Edit</h3>
          <div className="fp-form-grid">
            <div className="fp-field">
              <label htmlFor="edit-name">Name</label>
              <input id="edit-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div className="fp-field">
              <label htmlFor="edit-phone">Phone</label>
              <input id="edit-phone" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} inputMode="tel" />
            </div>
          </div>
          <button className="fp-btn fp-btn-primary" type="submit">Save name and phone</button>
        </form>
      ) : null}

      {panel === "cancel" ? (
        <form className="fp-form" onSubmit={(event) => { event.preventDefault(); void patch({ action: "cancel" }, "Cancelled. Payments and earlier history stay."); }}>
          <h3>Cancel</h3>
          <p>Cancel {row.name}&apos;s subscription? Payments and the renewal history stay. Play stops until someone renews it.</p>
          <button className="fp-btn fp-btn-primary" type="submit">Confirm cancel</button>
        </form>
      ) : null}

      {row.history.length > 0 ? (
        <>
          <h3>History</h3>
          <ul className="fp-stack">
            {row.history.map((event, index) => (
              <li key={`${event.action}-${event.when}-${index}`}>{event.action} · {event.actor} · {event.when}{event.note ? ` · ${event.note}` : ""}</li>
            ))}
          </ul>
        </>
      ) : null}
      {row.payments.length > 0 ? (
        <>
          <h3>Payments</h3>
          <ul className="fp-stack">
            {row.payments.map((payment, index) => (
              <li key={`${payment.when}-${payment.amountLabel}-${index}`}>{payment.amountLabel} · {payment.status} · {payment.method} · {payment.when}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PaymentDesk() {
  const [rows, setRows] = useState<Array<{ account: string; phone: string | null; planName: string; amountInr: number; status: string; method: string; paidAt: string; recordedBy: string }>>([]);
  const [found, setFound] = useState<DeskRow[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<DeskRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [status, setStatus] = useState("PAID");
  const [paidAt, setPaidAt] = useState(localDateTimeValue());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    void fetch("/api/admin/billing/payments").then(async (response) => {
      const body = await read(response);
      if (!response.ok) setError(String(body.message ?? "Could not load payments."));
      setRows((body.payments as typeof rows | undefined) ?? []);
    });
  }

  useEffect(() => { load(); }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/admin/billing/subscriptions?q=${encodeURIComponent(query)}`);
    const body = await read(response);
    if (!response.ok) {
      setError(String(body.message ?? "Could not search."));
      return;
    }
    setFound((body.subscriptions as DeskRow[] | undefined) ?? []);
    setPicked(null);
  }

  async function record(event: FormEvent) {
    event.preventDefault();
    if (!picked) return;
    const response = await fetch("/api/admin/billing/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscriptionId: picked.id,
        amountInr: Number(amount),
        paidAt,
        method,
        status,
        notes: "Admin ledger entry. No card or payment provider was charged.",
        transactionRef: "",
        invoiceRef: "",
      }),
    });
    const body = await read(response);
    if (!response.ok) {
      setError(String(body.message ?? "Could not record the payment."));
      return;
    }
    setError("");
    setNotice(`Recorded ${rupees(Number(amount))} for ${picked.name}. This is a ledger entry, not a charge.`);
    setPicked(null);
    setAmount("");
    load();
  }

  return (
    <>
      <p className="fp-note">Recording a payment does not charge a card and does not, by itself, turn play back on. WhatsApp renewal: +91 95665 51345.</p>
      <form className="fp-form" onSubmit={(event) => void search(event)}>
        <h2>Record a payment</h2>
        <div className="fp-field">
          <label htmlFor="payment-search">Find the customer by name or phone</label>
          <input id="payment-search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button className="fp-btn fp-btn-ghost" type="submit">Search</button>
      </form>
      {found.length > 0 ? (
        <ul className="fp-stack">
          {found.map((row) => (
            <li key={row.id} className="fp-list-card">
              <h3>{row.name}</h3>
              <p className="fp-status">{row.phoneLabel} · {row.customerType} · {row.planName} · expires {row.expiryLabel}</p>
              <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => { setPicked(row); setAmount(String(row.amountPendingInr || row.amountInr)); }}>Record for this customer</button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked ? (
        <form className="fp-form" onSubmit={(event) => void record(event)}>
          <h3>Ledger entry for {picked.name}</h3>
          <div className="fp-form-grid">
            <div className="fp-field">
              <label htmlFor="ledger-amount">Amount INR</label>
              <input id="ledger-amount" type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="fp-field">
              <label htmlFor="ledger-method">Method</label>
              <select id="ledger-method" value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="fp-field">
              <label htmlFor="ledger-status">Status</label>
              <select id="ledger-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="PAID">Paid</option>
                <option value="PENDING">Payment pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
            <div className="fp-field">
              <label htmlFor="ledger-date">Date</label>
              <input id="ledger-date" type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </div>
          </div>
          <button className="fp-btn fp-btn-primary" type="submit">Record payment</button>
        </form>
      ) : null}
      {notice ? <p className="fp-success">{notice}</p> : null}
      {error ? <p className="fp-error">{error}</p> : null}
      <div className="fp-table-wrap">
        <table className="fp-table">
          <caption className="fp-muted">Recorded payments</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Method</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7}>No payments recorded yet.</td></tr> : null}
            {rows.map((row, index) => (
              <tr key={`${row.account}-${row.paidAt}-${index}`}>
                <td>{row.account}</td>
                <td>{showPhone(row.phone)}</td>
                <td>{row.planName}</td>
                <td>{rupees(row.amountInr)}</td>
                <td>{paymentWord(row.status)}</td>
                <td>{methodWord(row.method)}</td>
                <td>{row.paidAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function showPhone(phone: string | null) {
  if (!phone) return "No phone yet";
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  if (!match) return phone;
  return `+91 ${match[1]} ${match[2]}`;
}

function paymentWord(status: string) {
  if (status === "PAID") return "Paid";
  if (status === "PENDING") return "Payment pending";
  if (status === "PARTIAL") return "Partial";
  if (status === "REFUNDED") return "Refunded";
  return status;
}

function methodWord(method: string) {
  if (method === "BANK_TRANSFER") return "Bank transfer";
  if (method === "CASH") return "Cash";
  if (method === "CARD") return "Card";
  if (method === "OTHER") return "Other";
  return "UPI";
}
