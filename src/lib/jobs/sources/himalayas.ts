import { z } from "zod";
import { fetchText } from "@/lib/http";
import { parseJson } from "../json";
import { asDate, toNormalizedJob, periodOf } from "../normalize";
import type { NormalizedJob } from "../types";

const SOURCE = "Himalayas";
const PAGE_SIZE = 20;
const MAX_PAGES = 5;
const DELAY_MS = 400;

const jobSchema = z.object({
  title: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  pubDate: z.number().nullable().optional(),
  applicationLink: z.string().nullable().optional(),
  guid: z.string().nullable().optional(),
  seniority: z.array(z.string()).nullable().optional(),
  parentCategories: z.array(z.string()).nullable().optional(),
  categories: z.array(z.string()).nullable().optional(),
  locationRestrictions: z.array(z.string()).nullable().optional(),
  timezoneRestrictions: z.array(z.number()).nullable().optional(),
  minSalary: z.number().nullable().optional(),
  maxSalary: z.number().nullable().optional(),
  salaryPeriod: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});

const pageSchema = z.object({
  jobs: z.array(jobSchema).default([]),
  nextCursor: z.string().nullable().optional(),
  totalCount: z.number().optional(),
});

type Page = z.infer<typeof pageSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function zones(values: number[] | null | undefined): string {
  if (!values?.length) return "";
  return values.map((zone) => `UTC${zone >= 0 ? "+" : ""}${zone}`).join(", ");
}

function locationText(restrictions: string[] | null | undefined, timezones: number[] | null | undefined): string {
  const places = (restrictions ?? []).map((place) => place.trim()).filter(Boolean);
  const zoneText = zones(timezones);
  const place = places.join(", ");
  if (place && zoneText) return `${place} (${zoneText})`;
  return place || zoneText;
}

async function loadPage(url: string): Promise<Page> {
  return pageSchema.parse(parseJson(await fetchText(url)));
}

function pageUrl(mode: "offset" | "cursor", offset: number, cursor: string | null): string | null {
  const url = new URL("https://himalayas.app/jobs/api");
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (mode === "cursor") {
    if (!cursor) return null;
    url.searchParams.set("cursor", cursor);
  } else {
    url.searchParams.set("offset", String(offset));
  }
  return url.toString();
}

export async function fetchJobs(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  let mode: "offset" | "cursor" = "offset";
  let offset = 0;
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(DELAY_MS);
    const url = pageUrl(mode, offset, cursor);
    if (!url) break;
    let data: Page;
    try {
      data = await loadPage(url);
    } catch (error) {
      if (jobs.length) return jobs;
      throw error;
    }
    const first = data.jobs[0]?.guid;
    if (mode === "offset" && page > 0 && first && seen.has(first)) {
      mode = "cursor";
      page -= 1;
      continue;
    }
    let added = 0;
    for (const item of data.jobs) {
      const key = item.guid || `${item.companyName ?? ""}:${item.title ?? ""}`;
      if (!key || seen.has(key) || !item.title) continue;
      seen.add(key);
      const job = toNormalizedJob({
        source: SOURCE,
        externalId: key,
        title: item.title,
        company: item.companyName || "Unknown",
        url: item.guid || item.applicationLink || "",
        applyUrl: item.applicationLink || item.guid,
        text: item.description || item.excerpt || item.title,
        locationText: locationText(item.locationRestrictions, item.timezoneRestrictions),
        tags: [...(item.seniority ?? []), ...(item.parentCategories ?? []), ...(item.categories ?? [])],
        salaryMin: item.minSalary,
        salaryMax: item.maxSalary,
        salaryCurrency: item.currency,
        salaryPeriod: periodOf(item.salaryPeriod),
        postedAt: asDate(item.pubDate),
      });
      if (!job) continue;
      jobs.push(job);
      added += 1;
    }
    cursor = data.nextCursor ?? null;
    if (added === 0) break;
    if (mode === "offset") {
      offset += data.jobs.length || PAGE_SIZE;
      if (data.totalCount != null && offset >= data.totalCount) break;
    } else if (!cursor) break;
  }
  return jobs;
}
