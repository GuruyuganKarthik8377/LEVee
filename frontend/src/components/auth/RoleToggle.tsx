"use client";

import { motion } from "motion/react";

export type Role = "donor" | "responder";

const ROLES: { id: Role; label: string; sub: string }[] = [
  { id: "donor", label: "I'm a donor", sub: "Pledge and get receipts" },
  { id: "responder", label: "I'm a responder", sub: "Receive funds, upload proof" },
];

/** Two-way switch between the donor app and the responder console, with the same sliding pill as the nav. */
export default function RoleToggle({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1 ring-1 ring-inset ring-ice">
      {ROLES.map((r) => {
        const selected = value === r.id;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(r.id)}
            className="relative rounded-xl px-4 py-2.5 text-left"
          >
            {selected && (
              <motion.span
                layoutId="role-pill"
                className="absolute inset-0 rounded-xl bg-white shadow-[0_6px_18px_rgba(0,28,100,0.10)] ring-1 ring-ice"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative block">
              <span className={`block text-[14px] font-semibold ${selected ? "text-link" : "text-ink"}`}>{r.label}</span>
              <span className="block text-[12px] text-[#5f6b7a]">{r.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
