import { db } from "@/src/prisma/db";
import { APPLICATION_STATUSES, type ApplicationStatus, type RankedJob } from "@/lib/types";

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((status) => status === value);
}

export async function listJobs(): Promise<RankedJob[]> {
  const rows = await db.orm.Job.all();
  return rows.map(toRanked).sort(byRank);
}

export async function clearSavedRecommendations(): Promise<void> {
  await db.orm.Job.where({ status: "saved" }).deleteAll();
}

export function roleKey(company: string, title: string): string {
  return `${company} ${title}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function loadSearched(): Promise<{ ids: Set<string>; roles: Set<string> }> {
  const [searched, jobs] = await Promise.all([
    db.orm.SearchedListing.select("externalId").all(),
    db.orm.Job.select("externalId", "company", "title").all(),
  ]);
  const ids = new Set(searched.map((row) => row.externalId));
  const roles = new Set<string>();
  for (const job of jobs) {
    ids.add(job.externalId);
    roles.add(roleKey(job.company, job.title));
  }
  return { ids, roles };
}

export async function rememberSearched(externalId: string): Promise<void> {
  await db.orm.SearchedListing.upsert({
    create: { externalId },
    update: { searchedAt: new Date() },
    conflictOn: { externalId },
  });
}

export async function replaceOpenRecommendations(jobs: RankedJob[]): Promise<RankedJob[]> {
  await db.orm.Job.where({ status: "saved" }).deleteAll();
  if (!jobs.length) return [];
  return saveJobs(jobs);
}

export async function saveJobs(jobs: RankedJob[]): Promise<RankedJob[]> {
  const saved: RankedJob[] = [];
  for (const job of jobs) {
    const listing = {
      title: job.title,
      company: job.company,
      url: job.url,
      source: job.source,
      sourceUrl: job.sourceUrl,
      postedAt: new Date(job.postedAt),
      location: job.location,
      salary: job.salary,
    };
    const ranking = {
      ...(job.score != null ? { score: job.score } : {}),
      ...(job.reason != null ? { reason: job.reason } : {}),
    };
    const row = await db.orm.Job.upsert({
      create: {
        externalId: job.id,
        ...listing,
        ...ranking,
        status: "saved",
      },
      update: {
        ...listing,
        ...ranking,
      },
      conflictOn: { externalId: job.id },
    });
    saved.push(toRanked(row));
  }
  return saved.sort(byRank);
}

export async function setJobStatus(id: string, status: ApplicationStatus): Promise<RankedJob | null> {
  const row = await db.orm.Job.where({ id }).update({ status });
  return row ? toRanked(row) : null;
}

function toRanked(row: {
  id: string;
  title: string;
  company: string;
  url: string;
  source: string;
  sourceUrl: string;
  postedAt: Date | string;
  location: string;
  salary: string;
  score: number | null;
  reason: string | null;
  status: ApplicationStatus;
}): RankedJob {
  const postedAt = row.postedAt instanceof Date ? row.postedAt.toISOString() : new Date(row.postedAt).toISOString();
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    source: row.source,
    sourceUrl: row.sourceUrl,
    postedAt,
    location: row.location,
    salary: row.salary,
    score: row.score,
    reason: row.reason,
    status: row.status,
  };
}

function byRank(a: RankedJob, b: RankedJob): number {
  return (b.score ?? -1) - (a.score ?? -1) || Date.parse(b.postedAt) - Date.parse(a.postedAt);
}
