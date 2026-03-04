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
    "mt-1 w-full rounded-xl border border-[#dfdfdf] bg-white px-3 py-2 text-[#171717] outline-none transition focus:border-[#b7b7b7]";

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
      <section className="panel p-5 sm:p-6 space-y-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Order confirmed</p>
        <h3 className="text-3xl font-semibold text-[#171717]">You&apos;re set.</h3>
        <div className="panel-soft p-4 text-sm text-muted">
          <p className="mb-1 text-[#171717]">{itemSummary}</p>
          <p className="mb-1">Order ID: {orderId}</p>
          <p>Total paid: {total}</p>
          <p className="mt-2">Confirmation sent to {displayData.email}</p>
        </div>
        <button type="button" onClick={onBack}
          className="w-full text-center text-sm text-muted transition hover:text-[#171717]">
          ← Start new order
        </button>
      </section>
    );
  }

  return (
    <section className="panel p-5 sm:p-6">
      <form className="space-y-3.5" onSubmit={submitCheckout}>
        <div className="mb-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Checkout</p>
          <h3 className="text-2xl font-semibold text-[#171717]">Almost there</h3>
        </div>

        <div className="panel-soft p-4 text-sm text-muted">
          <p className="text-[#171717]">{itemSummary}</p>
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

        <button type="submit" disabled={status === "submitting"}
          className="w-full rounded-full border border-[#ff935f] bg-[#ff6a2d] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#ff7a42] disabled:cursor-not-allowed disabled:opacity-70">
          {status === "submitting" ? "Placing order..." : "Place order"}
        </button>
      </form>

      <button type="button" onClick={onBack}
        className="mt-3 w-full text-center text-sm text-muted transition hover:text-[#171717]">
        ← Back to options
      </button>
    </section>
  );
}
