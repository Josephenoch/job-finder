import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import { listJobs } from "@/lib/store";
import { APPLICATION_STATUSES, type ApplicationStatus, type RankedJob } from "@/lib/types";
import { StatusSelect } from "./status-select";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Not applied",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  not_interested: "Not interested",
};

export const metadata = {
  title: "Saved jobs",
};

export default function SavedJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-12 font-sans">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Saved jobs</h1>
        <Link href="/" className="text-sm font-medium underline underline-offset-4">
          Search
        </Link>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading saved jobs…</p>}>
        <SavedJobs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SavedJobs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await io();
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status : undefined;
  const status = isStatus(requested) ? requested : null;
  const jobs = await listJobs();
  const counts = countByStatus(jobs);
  const visible = status ? jobs.filter((job) => job.status === status) : jobs;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {jobs.length === 0
          ? "Roles you save from a search will show up here."
          : `${jobs.length} ${jobs.length === 1 ? "role" : "roles"} stored, highest score first.`}
      </p>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        <FilterChip href="/saved" active={status === null} label="All" count={jobs.length} />
        {APPLICATION_STATUSES.map((item) => (
          <FilterChip
            key={item}
            href={`/saved?status=${item}`}
            active={status === item}
            label={STATUS_LABEL[item]}
            count={counts[item]}
          />
        ))}
      </nav>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
          {jobs.length === 0 ? "No saved roles yet." : `No roles marked ${STATUS_LABEL[status ?? "saved"].toLowerCase()}.`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Saved jobs and their application status</caption>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase dark:border-zinc-800 dark:bg-zinc-900/70">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Score
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800/80">
                  <td className="px-4 py-3">
                    <a className="font-medium underline-offset-4 hover:underline" href={job.url} target="_blank" rel="noreferrer">
                      {job.title}
                    </a>
                    <p className="mt-0.5 text-zinc-500">{job.company}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {job.location} · {job.salary} · {postedLabel(job.postedAt)} ·{" "}
                      <a className="underline underline-offset-4" href={job.sourceUrl} target="_blank" rel="noreferrer">
                        {job.source}
                      </a>
                    </p>
                    {job.reason ? <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">{job.reason}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{job.score ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusSelect id={job.id} status={job.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
      }`}
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
    </Link>
  );
}

function isStatus(value: string | undefined): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((status) => status === value);
}

function countByStatus(jobs: RankedJob[]): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<ApplicationStatus, number>;
  for (const job of jobs) counts[job.status] += 1;
  return counts;
}

function postedLabel(iso: string): string {
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(posted);
}
