"use client";

import { FormEvent, useMemo, useState } from "react";
import type { CheckoutFormData } from "../CheckoutModal";

interface CheckoutStepProps {
  total: string;
  itemSummary: string;
  onComplete: (data: CheckoutFormData) => void;
  onBack: () => void;
  lastCheckout: CheckoutFormData | null;
}

const initialForm: CheckoutFormData = {
  email: "",
  fullName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
};

const createOrderId = () =>
  `12OZ-${Math.floor(Math.random() * 900000 + 100000).toString(16).toUpperCase()}`;

export function CheckoutStep({
  total,
  itemSummary,
  onComplete,
  onBack,
  lastCheckout,
}: CheckoutStepProps) {
  const [form, setForm] = useState<CheckoutFormData>(() => ({ ...initialForm }));
  const [status, setStatus] = useState<"idle" | "submitting" | "complete">("idle");
  const orderId = useMemo(() => createOrderId(), []);

  const inputClassName =
    "mt-1 w-full rounded-xl border border-transparent bg-[var(--bg-soft)] px-3.5 py-2.5 text-[var(--text)] outline-none transition focus:bg-white focus:border-[var(--line)]";

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    await new Promise((resolve) => setTimeout(resolve, 900));
    setStatus("complete");
    onComplete(form);
  };

  if (status === "complete" || lastCheckout) {
    const displayData = lastCheckout ?? form;
    return (
      <section className="panel space-y-4 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Order confirmed</p>
        <h3 className="text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">You&apos;re set.</h3>
        <div className="panel-soft p-4 text-sm text-muted">
          <p className="mb-1 text-[var(--text)]">{itemSummary}</p>
          <p className="mb-1">Order ID: {orderId}</p>
          <p>Total paid: {total}</p>
          <p className="mt-2">Confirmation sent to {displayData.email}</p>
        </div>
        <button type="button" onClick={onBack} className="btn-ghost">
          &larr; Start new order
        </button>
      </section>
    );
  }

  return (
    <section className="panel p-5 sm:p-6">
      <form className="space-y-3.5" onSubmit={submitCheckout}>
        <div className="mb-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Checkout</p>
          <h3 className="text-2xl font-bold tracking-[-0.02em] text-[var(--text)]">Almost there</h3>
        </div>

        <div className="panel-soft p-4 text-sm text-muted">
          <p className="text-[var(--text)]">{itemSummary}</p>
          <p className="mt-1">Total due today: {total}</p>
        </div>

        <label className="block text-sm text-muted">
          Email
          <input type="email" required value={form.email}
            onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
            className={inputClassName} />
        </label>

        <label className="block text-sm text-muted">
          Full name
          <input type="text" required value={form.fullName}
            onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))}
            className={inputClassName} />
        </label>

        <label className="block text-sm text-muted">
          Shipping address
          <input type="text" required value={form.address}
            onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
            className={inputClassName} />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm text-muted">
            City
            <input type="text" required value={form.city}
              onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))}
              className={inputClassName} />
          </label>
          <label className="block text-sm text-muted">
            State
            <input type="text" required value={form.state}
              onChange={(e) => setForm((c) => ({ ...c, state: e.target.value }))}
              className={inputClassName} />
          </label>
          <label className="block text-sm text-muted">
            ZIP
            <input type="text" required value={form.zip}
              onChange={(e) => setForm((c) => ({ ...c, zip: e.target.value }))}
              className={inputClassName} />
          </label>
        </div>

        <button type="submit" disabled={status === "submitting"} className="btn-primary">
          {status === "submitting" ? "Placing order..." : "Place order"}
        </button>
      </form>

      <button type="button" onClick={onBack} className="btn-ghost mt-1">
        &larr; Back to options
      </button>
    </section>
  );
}
