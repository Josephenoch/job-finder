"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Not applied",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  not_interested: "Not interested",
};

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  saved: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  applied: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  interviewing: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  offer: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  not_interested: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
};

export function StatusSelect({ id, status }: { id: string; status: ApplicationStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setValue(status);
  }, [status]);

  async function onChange(next: string) {
    if (!isStatus(next) || next === value) return;
    const previous = value;
    setValue(next);
    setPending(true);
    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error("status");
      router.refresh();
    } catch {
      setValue(previous);
    } finally {
      setPending(false);
    }
  }

  return (
    <select
      value={value}
      disabled={pending}
      aria-label="Status"
      onChange={(event) => void onChange(event.target.value)}
      className={`rounded-full border border-transparent px-3 py-1 text-sm font-medium ${STATUS_STYLE[value]}`}
    >
      {APPLICATION_STATUSES.map((item) => (
        <option key={item} value={item}>
          {STATUS_LABEL[item]}
        </option>
      ))}
    </select>
  );
}

function isStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((status) => status === value);
}
