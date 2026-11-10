import os from "node:os";
import { z } from "zod";
import { fetchText } from "@/lib/http";
import { atsBoards } from "../boards";
import { parseJson } from "../json";
import { asDate, periodOf, toNormalizedJob } from "../normalize";
import type { NormalizedJob, SalaryPeriod } from "../types";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const greenhouseSchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        title: z.string(),
        absolute_url: z.string(),
        content: z.string().nullable().optional(),
        company_name: z.string().nullable().optional(),
        first_published: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
        location: z
          .object({ name: z.string().nullable().optional() })
          .nullable()
          .optional(),
      }),
    )
    .default([]),
});

const leverSalarySchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  currency: z.string().optional(),
  interval: z.string().optional(),
});

const leverSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    applyUrl: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    createdAt: z.number().nullable().optional(),
    workplaceType: z.string().nullable().optional(),
    categories: z
      .object({
        commitment: z.string().nullable().optional(),
        department: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        team: z.string().nullable().optional(),
        allLocations: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
    salaryRange: z.unknown().optional(),
  }),
);

const ashbySchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        location: z.string().nullable().optional(),
        secondaryLocations: z.array(z.unknown()).nullable().optional(),
        descriptionPlain: z.string().nullable().optional(),
        descriptionHtml: z.string().nullable().optional(),
        jobUrl: z.string(),
        applyUrl: z.string().nullable().optional(),
        publishedAt: z.string().nullable().optional(),
        isListed: z.boolean().nullable().optional(),
        isRemote: z.boolean().nullable().optional(),
        department: z.string().nullable().optional(),
        team: z.string().nullable().optional(),
        employmentType: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

function slugOrThrow(slug: string): string {
  const trimmed = slug.trim();
  if (!SLUG.test(trimmed)) throw new Error(`invalid slug "${slug}"`);
  return trimmed;
}

function companyFromSlug(slug: string): string {
  return slug.replace(/[-_]+/g, " ");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "failed";
}

function leverPay(value: unknown): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
} {
  const parsed = leverSalarySchema.safeParse(value);
  if (!parsed.success) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
  }
  return {
    salaryMin: parsed.data.min ?? null,
    salaryMax: parsed.data.max ?? null,
    salaryCurrency: parsed.data.currency ?? null,
    salaryPeriod: periodOf(parsed.data.interval),
  };
}

function placeLabels(values: unknown[] | null | undefined): string[] {
  const labels: string[] = [];
  for (const value of values ?? []) {
    if (typeof value === "string" && value.trim()) labels.push(value.trim());
    else if (value && typeof value === "object" && "location" in value) {
      const location = value.location;
      if (typeof location === "string" && location.trim()) labels.push(location.trim());
    }
  }
  return labels;
}

const TARGET_PER_SEC = 10;
const MB_PER_BOARD = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function maxInFlight(): number {
  const freeMb = os.freemem() / (1024 * 1024);
  const byRam = Math.floor(freeMb / MB_PER_BOARD);
  const byCpu = os.availableParallelism() * 2;
  return Math.max(2, Math.min(TARGET_PER_SEC, byRam, byCpu));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pacer(perSec: number): () => Promise<void> {
  let nextAt = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + 1000 / perSec;
    if (at > now) await delay(at - now);
  };
}

function rateLimited(error: unknown): boolean {
  return error instanceof Error && /\b429\b/.test(error.message);
}

async function runBoard(run: () => Promise<NormalizedJob[]>): Promise<NormalizedJob[]> {
  let waitMs = 1000;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!rateLimited(error) || attempt === 3) throw error;
      await delay(waitMs);
      waitMs *= 2;
    }
  }
}

function inWindow(value: string | number | null | undefined, sinceMs: number, now = Date.now()): boolean {
  const posted = asDate(value);
  if (!posted) return false;
  const time = posted.getTime();
  return time >= sinceMs && time <= now + 60_000;
}

async function loadGreenhouse(token: string, content: boolean) {
  const query = content ? "?content=true" : "";
  return greenhouseSchema.parse(
    parseJson(await fetchText(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs${query}`)),
  );
}

async function fetchGreenhouse(slug: string, sinceMs: number): Promise<NormalizedJob[]> {
  const token = slugOrThrow(slug);
  const listed = await loadGreenhouse(token, false);
  if (!listed.jobs.some((job) => inWindow(job.updated_at, sinceMs))) return [];
  const data = await loadGreenhouse(token, true);
  const jobs: NormalizedJob[] = [];
  for (const item of data.jobs) {
    const postedAt = asDate(item.first_published);
    if (!inWindow(item.first_published, sinceMs)) continue;
    const job = toNormalizedJob({
      source: "Greenhouse",
      externalId: `${token}:${item.id}`,
      title: item.title,
      company: item.company_name || companyFromSlug(token),
      url: item.absolute_url,
      applyUrl: item.absolute_url,
      text: item.content || item.title,
      locationText: item.location?.name || "",
      postedAt,
    });
    if (job) jobs.push(job);
  }
  return jobs;
}

async function fetchLever(slug: string, sinceMs: number): Promise<NormalizedJob[]> {
  const company = slugOrThrow(slug);
  const data = leverSchema.parse(
    parseJson(await fetchText(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`)),
  );
  const jobs: NormalizedJob[] = [];
  for (const item of data) {
    const places = [item.categories?.location, ...(item.categories?.allLocations ?? [])].filter(
      (place): place is string => Boolean(place?.trim()),
    );
    const postedAt = asDate(item.createdAt);
    if (!inWindow(item.createdAt, sinceMs)) continue;
    const pay = leverPay(item.salaryRange);
    const job = toNormalizedJob({
      source: "Lever",
      externalId: `${company}:${item.id}`,
      title: item.text,
      company: companyFromSlug(company),
      url: item.hostedUrl,
      applyUrl: item.applyUrl || item.hostedUrl,
      text: item.descriptionPlain || item.text,
      locationText: [...new Set(places)].join(", ") || item.workplaceType || "",
      tags: [item.categories?.commitment, item.categories?.department, item.categories?.team, item.workplaceType].filter(
        (tag): tag is string => Boolean(tag?.trim()),
      ),
      ...pay,
      postedAt,
    });
    if (job) jobs.push(job);
  }
  return jobs;
}

async function fetchAshby(slug: string, sinceMs: number): Promise<NormalizedJob[]> {
  const name = slugOrThrow(slug);
  const data = ashbySchema.parse(
    parseJson(await fetchText(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(name)}`)),
  );
  const jobs: NormalizedJob[] = [];
  for (const item of data.jobs) {
    if (item.isListed === false || !inWindow(item.publishedAt, sinceMs)) continue;
    const places = [item.location, ...placeLabels(item.secondaryLocations)].filter((place): place is string =>
      Boolean(place?.trim()),
    );
    const job = toNormalizedJob({
      source: "Ashby",
      externalId: `${name}:${item.id}`,
      title: item.title,
      company: companyFromSlug(name),
      url: item.jobUrl,
      applyUrl: item.applyUrl || item.jobUrl,
      text: item.descriptionPlain || item.descriptionHtml || item.title,
      locationText: [...new Set(places)].join(", ") || (item.isRemote ? "Remote" : ""),
      tags: [item.department, item.team, item.employmentType].filter((tag): tag is string => Boolean(tag?.trim())),
      postedAt: asDate(item.publishedAt),
    });
    if (job) jobs.push(job);
  }
  return jobs;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

export async function fetchJobs(
  sinceMs = Date.now() - WEEK_MS,
  onStatus?: (message: string) => void,
  onJobs?: (jobs: NormalizedJob[]) => void,
): Promise<NormalizedJob[]> {
  const boards: { label: string; run: () => Promise<NormalizedJob[]> }[] = [
    ...atsBoards.greenhouse.map((slug) => ({ label: `Greenhouse ${slug}`, run: () => fetchGreenhouse(slug, sinceMs) })),
    ...atsBoards.lever.map((slug) => ({ label: `Lever ${slug}`, run: () => fetchLever(slug, sinceMs) })),
    ...atsBoards.ashby.map((slug) => ({ label: `Ashby ${slug}`, run: () => fetchAshby(slug, sinceMs) })),
  ];
  if (!boards.length) return [];
  const collected: NormalizedJob[] = [];
  const errors: string[] = [];
  let done = 0;
  onStatus?.(`Reading company boards, 0 of ${boards.length}…`);
  await mapPool(
    boards,
    async (board) => {
      try {
        const jobs = await runBoard(board.run);
        if (onJobs) {
          if (jobs.length) onJobs(jobs);
        } else if (jobs.length) collected.push(...jobs);
      } catch (error) {
        errors.push(`${board.label}: ${message(error)}`);
      } finally {
        done += 1;
        if (onStatus && (done === boards.length || done % 50 === 0)) {
          onStatus(`Reading company boards, ${done} of ${boards.length}…`);
        }
      }
    },
  );
  if (errors.length === boards.length) throw new Error(`${errors.length} company boards failed. ${errors[0]}`);
  return collected;
}
