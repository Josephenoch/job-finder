import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fetchText } from "@/lib/http";
import { parseJson } from "../json";
import { asDate, toNormalizedJob } from "../normalize";
import type { NormalizedJob } from "../types";

const SOURCE = "Remotive";
const ENDPOINT = "https://remotive.com/api/remote-jobs";
const CACHE_PATH = path.resolve("data/radar/remotive.json");
const FRESH_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS_PER_DAY = 4;

const responseSchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        url: z.string(),
        title: z.string(),
        company_name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        publication_date: z.string().nullable().optional(),
        candidate_required_location: z.string().nullable().optional(),
        salary: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        job_type: z.string().nullable().optional(),
        tags: z.array(z.string()).nullable().optional(),
      }),
    )
    .default([]),
});

const cacheSchema = z.object({
  fetchedAt: z.string(),
  day: z.string(),
  calls: z.number().int().nonnegative(),
  body: z.unknown(),
});

type CacheFile = z.infer<typeof cacheSchema>;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function jobsFrom(body: unknown): NormalizedJob[] {
  const data = responseSchema.parse(body);
  const jobs: NormalizedJob[] = [];
  for (const item of data.jobs) {
    const salary = item.salary?.trim();
    const text = [item.description || "", salary ? `Salary: ${salary}` : ""].filter(Boolean).join("\n\n");
    const job = toNormalizedJob({
      source: SOURCE,
      externalId: String(item.id),
      title: item.title,
      company: item.company_name || "Unknown",
      url: item.url,
      applyUrl: item.url,
      text: text || item.title,
      locationText: item.candidate_required_location || "",
      tags: [...(item.tags ?? []), ...(item.category ? [item.category] : []), ...(item.job_type ? [item.job_type] : [])],
      postedAt: asDate(item.publication_date),
    });
    if (job) jobs.push(job);
  }
  return jobs;
}

async function readCache(): Promise<CacheFile | null> {
  try {
    return cacheSchema.parse(parseJson(await readFile(CACHE_PATH, "utf8")));
  } catch {
    return null;
  }
}

async function writeCache(cache: CacheFile): Promise<void> {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache));
}

export async function fetchJobs(): Promise<NormalizedJob[]> {
  const now = new Date();
  const cache = await readCache();
  const fetchedAt = cache ? Date.parse(cache.fetchedAt) : Number.NaN;
  if (cache && Number.isFinite(fetchedAt) && now.getTime() - fetchedAt < FRESH_MS) {
    return jobsFrom(cache.body);
  }

  const today = utcDay(now);
  const callsToday = cache && cache.day === today ? cache.calls : 0;
  if (callsToday >= MAX_CALLS_PER_DAY) {
    if (cache) return jobsFrom(cache.body);
    throw new Error("Remotive daily call limit reached");
  }

  let body: unknown;
  try {
    body = parseJson(await fetchText(ENDPOINT));
  } catch (error) {
    if (cache) return jobsFrom(cache.body);
    throw error;
  }

  try {
    const jobs = jobsFrom(body);
    await writeCache({ fetchedAt: now.toISOString(), day: today, calls: callsToday + 1, body });
    return jobs;
  } catch (error) {
    await writeCache({
      fetchedAt: cache?.fetchedAt ?? now.toISOString(),
      day: today,
      calls: callsToday + 1,
      body: cache?.body ?? { jobs: [] },
    });
    throw error;
  }
}
