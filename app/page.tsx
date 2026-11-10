"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { DEFAULT_MAX_AGE_DAYS, DEFAULT_MIN_MONTHLY_USD, MAX_AGE_OPTIONS, PAY_OPTIONS } from "@/lib/jobs";
import { APPLICATION_STATUSES, type ApplicationStatus, type RankedJob } from "@/lib/types";

type SourceReport = { source: string; count: number; error?: string };

type Result = {
  jobs: RankedJob[];
  matched: number;
  ranked: number;
  capped: boolean;
  analysisSkipped?: boolean;
  skipReason?: string;
  summary?: string;
  titles?: string[];
  minMonthlyUsd?: number;
  skipped?: number;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [maxAgeDays, setMaxAgeDays] = useState<number>(DEFAULT_MAX_AGE_DAYS);
  const [minMonthlyUsd, setMinMonthlyUsd] = useState<number>(DEFAULT_MIN_MONTHLY_USD);
  const [sponsoredMove, setSponsoredMove] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Upload a PDF CV, then run a search.");
  const [reports, setReports] = useState<SourceReport[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [jobs, setJobs] = useState<RankedJob[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadJobs(setJobs);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setReports([]);
    setProgress(null);
    setStatus("Reading the CV…");

    try {
      const body = new FormData();
      body.set("cv", file);
      body.set("maxAgeDays", String(maxAgeDays));
      body.set("minMonthlyUsd", String(minMonthlyUsd));
      if (sponsoredMove) body.set("sponsoredMove", "1");
      const response = await fetch("/api/jobs", { method: "POST", body });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Search failed.");
        setStatus("Search stopped.");
        return;
      }
      if (!response.body) {
        setError("Search failed.");
        setStatus("Search stopped.");
        return;
      }
      await readStream(response.body, {
        onStatus: setStatus,
        onSources: setReports,
        onProgress: setProgress,
        onJob: (job) =>
          setJobs((current) =>
            job.status === "saved"
              ? sortJobs([...current.filter((item) => item.id !== job.id), job])
              : current.filter((item) => item.id !== job.id),
          ),
        onResult: (next) => {
          setResult(next);
          void loadJobs(setJobs);
        },
        onError: (message) => {
          setError(message);
          setStatus("Search stopped.");
        },
      });
    } catch {
      setError("Search failed.");
      setStatus("Search stopped.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-12 font-sans">
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Job finder</h1>
          <Link href="/saved" className="text-sm font-medium underline underline-offset-4">
            Saved jobs
          </Link>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Roles posted in the last {ageLabel(maxAgeDays)} that can be done from Nigeria{payPhrase(minMonthlyUsd)}. Your CV is read locally, then each job description is scored for fit.
          {sponsoredMove
            ? " Canadian roles with visa sponsorship or relocation from Job Bank, VanHack, and Relocate.me are included, plus UK roles that state both. LinkedIn, Indeed, Workopolis, Wellfound, Techjobs.ca, Glassdoor, and Google Jobs have no public feed."
            : ""}
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-sm dark:border-zinc-700">
          <span className="font-medium">CV (PDF)</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:text-white dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file ? <span className="text-zinc-500">{file.name}</span> : null}
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Posted within</span>
          <select
            value={maxAgeDays}
            disabled={running}
            onChange={(event) => setMaxAgeDays(Number(event.target.value))}
            className="rounded-full border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700"
          >
            {MAX_AGE_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Monthly pay</span>
          <select
            value={minMonthlyUsd}
            disabled={running}
            onChange={(event) => setMinMonthlyUsd(Number(event.target.value))}
            className="rounded-full border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700"
          >
            {PAY_OPTIONS.map((option) => (
              <option key={option.usd} value={option.usd}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={sponsoredMove}
            disabled={running}
            onChange={(event) => setSponsoredMove(event.target.checked)}
            className="mt-0.5"
          />
          <span>Include Canadian sponsorship and relocation roles</span>
        </label>
        <button
          type="submit"
          disabled={!file || running}
          className="h-11 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {running ? "Searching…" : "Find jobs"}
        </button>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {status}
        {progress ? ` ${progress.done} of ${progress.total}` : ""}
      </p>

      {reports.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          {reports.map((report) => (
            <li key={report.source}>
              {report.source}: {report.error ? report.error : report.count}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-500">{resultLabel(result)}</h2>
          {result.summary ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{result.summary}</p>
          ) : null}
          {result.titles?.length ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Closest titles: {result.titles.join(", ")}
            </p>
          ) : null}
          {result.analysisSkipped && result.skipReason ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{result.skipReason}</p>
          ) : null}
          {result.skipped ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Skipped {result.skipped} {result.skipped === 1 ? "role" : "roles"} already searched.
            </p>
          ) : null}
          {result.jobs.length === 0 && result.matched > 0 ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Those roles did not fit your CV closely enough.
            </p>
          ) : null}
          {result.jobs.length === 0 && result.matched === 0 && !result.skipped ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              No roles from the last {ageLabel(maxAgeDays)} are open to Nigeria
              {sponsoredMove ? " or offer a move to Canada or the UK" : ""}
              {payPhrase(result.minMonthlyUsd ?? minMonthlyUsd)}.
            </p>
          ) : null}
        </section>
      ) : null}

      {jobs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">Not applied</h2>
          <ol className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <article className="rounded-xl border border-zinc-200 px-4 py-4 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium leading-6">{job.title}</h3>
                      <p className="text-sm text-zinc-500">{job.company}</p>
                    </div>
                    {job.score != null ? (
                      <p className="text-lg font-semibold tabular-nums">{job.score}</p>
                    ) : null}
                  </div>
                  {job.reason ? <p className="mt-3 text-sm leading-6">{job.reason}</p> : null}
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    {job.location} · {job.salary} · {postedLabel(job.postedAt)} ·{" "}
                    <a className="underline" href={job.sourceUrl} target="_blank" rel="noreferrer">
                      {job.source}
                    </a>
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500">Status</span>
                      <select
                        value={job.status}
                        disabled={savingId === job.id}
                        onChange={(event) => {
                          const status = event.target.value;
                          if (isStatus(status)) void updateStatus(job.id, status, setJobs, setSavingId, setError);
                        }}
                        className="rounded-full border border-zinc-300 bg-transparent px-3 py-1 dark:border-zinc-700"
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <a className="text-sm font-medium underline" href={job.url} target="_blank" rel="noreferrer">
                      Apply
                    </a>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Not applied",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  not_interested: "Not interested",
};

function ageLabel(days: number): string {
  return MAX_AGE_OPTIONS.find((option) => option.days === days)?.label ?? "3 days";
}

function payPhrase(usd: number): string {
  if (usd <= 0) return "";
  return ` and pay at least $${usd.toLocaleString("en-US")} a month`;
}

function isStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((status) => status === value);
}

async function loadJobs(setJobs: (jobs: RankedJob[]) => void) {
  const response = await fetch("/api/jobs");
  if (!response.ok) return;
  const payload = (await response.json()) as { jobs?: RankedJob[] };
  if (Array.isArray(payload.jobs)) setJobs(payload.jobs.filter((job) => job.status === "saved"));
}

async function updateStatus(
  id: string,
  status: ApplicationStatus,
  setJobs: (update: (jobs: RankedJob[]) => RankedJob[]) => void,
  setSavingId: (id: string | null) => void,
  setError: (message: string | null) => void,
) {
  setSavingId(id);
  setError(null);
  setJobs((current) => {
    const job = current.find((item) => item.id === id);
    return job ? placeJob(current, id, { ...job, status }) : current;
  });
  try {
    const response = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error("status");
    const saved = (await response.json()) as RankedJob;
    setJobs((current) => placeJob(current, id, saved));
  } catch {
    setError("Could not update that status.");
    await loadJobs((jobs) => setJobs(() => jobs));
  } finally {
    setSavingId(null);
  }
}

function resultLabel(result: Result): string {
  if (result.jobs.length === 0) return "No matching roles";
  if (result.analysisSkipped) {
    return result.capped ? `${result.jobs.length} of ${result.matched} listed` : `${result.jobs.length} listed`;
  }
  return result.capped ? `${result.ranked} of ${result.matched} ranked` : `${result.ranked} ranked`;
}

function placeJob(jobs: RankedJob[], id: string, job: RankedJob): RankedJob[] {
  const rest = jobs.filter((item) => item.id !== id);
  return job.status === "saved" ? sortJobs([...rest, job]) : rest;
}

function sortJobs(jobs: RankedJob[]): RankedJob[] {
  return jobs.sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1) || Date.parse(b.postedAt) - Date.parse(a.postedAt),
  );
}

function postedLabel(iso: string): string {
  const posted = Date.parse(iso);
  if (Number.isNaN(posted)) return "Unknown date";
  const hours = Math.max(0, Math.round((Date.now() - posted) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onStatus: (message: string) => void;
    onSources: (sources: SourceReport[]) => void;
    onProgress: (progress: { done: number; total: number }) => void;
    onJob: (job: RankedJob) => void;
    onResult: (result: Result) => void;
    onError: (message: string) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = parseEvent(part);
      if (!event) continue;
      const data = JSON.parse(event.data) as Record<string, unknown>;
      if (event.event === "status" && typeof data.message === "string") handlers.onStatus(data.message);
      if (event.event === "sources" && Array.isArray(data.sources)) {
        handlers.onSources(data.sources as SourceReport[]);
      }
      if (event.event === "progress") {
        handlers.onProgress({ done: Number(data.done), total: Number(data.total) });
      }
      if (event.event === "job" && typeof data.id === "string") handlers.onJob(data as unknown as RankedJob);
      if (event.event === "result") handlers.onResult(data as unknown as Result);
      if (event.event === "error" && typeof data.message === "string") handlers.onError(data.message);
    }
  }
}

function parseEvent(block: string): { event: string; data: string } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  return { event, data: data.join("\n") };
}
