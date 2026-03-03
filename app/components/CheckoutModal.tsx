"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export interface CheckoutFormData {
  email: string;
  fullName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface CheckoutModalProps {
  isOpen: boolean;
  total: string;
  itemSummary: string;
  onClose: () => void;
  onComplete: (data: CheckoutFormData) => void;
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

export function CheckoutModal({
  isOpen,
  total,
  itemSummary,
  onClose,
  onComplete,
}: CheckoutModalProps) {
  const [form, setForm] = useState<CheckoutFormData>(() => ({ ...initialForm }));
  const [status, setStatus] = useState<"idle" | "submitting" | "complete">("idle");
  const orderId = useMemo(() => createOrderId(), []);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    await new Promise((resolve) => setTimeout(resolve, 950));
    setStatus("complete");
    onComplete(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/72 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="surface w-full max-w-lg rounded-3xl p-5 sm:p-6">
        {status === "complete" ? (
          <div className="space-y-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Order confirmed</p>
            <h3 className="text-3xl font-semibold">You&apos;re set.</h3>
            <div className="surface-soft rounded-2xl p-4 text-sm text-muted">
              <p className="mb-1 text-white/95">{itemSummary}</p>
              <p className="mb-1">Order ID: {orderId}</p>
              <p>Paid: {total}</p>
              <p className="mt-2">Receipt sent to {form.email}</p>
            </div>
            <p className="text-sm text-muted">Mock checkout complete.</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full border border-[#ff935f] bg-ember px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#ff7b42]"
            >
              Done
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submitCheckout}>
            <div className="mb-1 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Checkout</p>
                <h3 className="text-2xl font-semibold">Almost there</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/24 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-white/45 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="surface-soft rounded-2xl p-4 text-sm text-muted">
              <p className="text-white/95">{itemSummary}</p>
              <p className="mt-1">Total due today: {total}</p>
            </div>

            <label className="block text-sm text-muted">
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-white/18 bg-black/28 px-3 py-2 text-white outline-none transition focus:border-[#ff935f]"
              />
            </label>

            <label className="block text-sm text-muted">
              Full name
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fullName: event.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-white/18 bg-black/28 px-3 py-2 text-white outline-none transition focus:border-[#ff935f]"
              />
            </label>

            <label className="block text-sm text-muted">
              Shipping address
              <input
                type="text"
                required
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-white/18 bg-black/28 px-3 py-2 text-white outline-none transition focus:border-[#ff935f]"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm text-muted">
                City
                <input
                  type="text"
                  required
                  value={form.city}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, city: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/18 bg-black/28 px-3 py-2 text-white outline-none transition focus:border-[#ff935f]"
                />
              </label>

              <label className="block text-sm text-muted">
                State
                <input
                  type="text"
                  required
                  value={form.state}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, state: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/18 bg-black/28 px-3 py-2 text-white outline-none transition focus:border-[#ff935f]"
                />
              </label>

              <label className="block text-sm text-muted">
                ZIP
                <input
                  type="text"
                  required
                  value={form.zip}
                  onChange={(event) => setForm((current) => ({ ...current, zip: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/18 bg-black/28 px-3 py-2 text-white outline-none transition focus:border-[#ff935f]"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-full border border-[#ff935f] bg-ember px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#ff7b42] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "submitting" ? "Placing order..." : "Place order"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
