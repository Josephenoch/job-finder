import { fetchJson } from "../http";
import { normalizePeriod } from "../jobs";
import type { Job } from "../types";
import { clip, fromUnix, httpUrl, numbers, positive, strings, stripHtml } from "../text";

type HimalayasJob = {
  title?: string;
  companyName?: string;
  description?: string;
  excerpt?: string;
  pubDate?: number;
  applicationLink?: string;
  guid?: string;
  seniority?: string[];
  parentCategories?: string[];
  categories?: string[];
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string;
  currency?: string;
};

type HimalayasPage = {
  jobs?: HimalayasJob[];
  nextCursor?: string | null;
};

export async function loadHimalayas(
  sinceMs: number,
  onPage?: (page: number) => void,
): Promise<Job[]> {
  const jobs: Job[] = [];
  let cursor: string | undefined;
  for (let page = 1; page <= 80; page++) {
    const url = new URL("https://himalayas.app/jobs/api");
    url.searchParams.set("limit", "20");
    if (cursor) url.searchParams.set("cursor", cursor);
    let data: HimalayasPage;
    try {
      data = await fetchJson<HimalayasPage>(url.toString());
    } catch (error) {
      if (jobs.length) return jobs;
      throw error;
    }
    onPage?.(page);
    const batch = data.jobs ?? [];
    let oldest = Number.POSITIVE_INFINITY;
    for (const item of batch) {
      if (item.pubDate == null || !item.title) continue;
      const postedAt = fromUnix(item.pubDate);
      const postedMs = Date.parse(postedAt);
      oldest = Math.min(oldest, postedMs);
      if (postedMs < sinceMs) continue;
      const link = httpUrl(item.applicationLink);
      if (!link) continue;
      const salaryPeriod = normalizePeriod(item.salaryPeriod);
      jobs.push({
        id: `himalayas:${item.guid || `${item.companyName ?? "company"}-${item.title}`}`,
        title: stripHtml(item.title),
        company: stripHtml(item.companyName || "Unknown"),
        url: link,
        description: clip(stripHtml(item.description || item.excerpt || ""), 1200),
        postedAt,
        source: "Himalayas",
        sourceUrl: "https://himalayas.app",
        locationRestrictions: strings(item.locationRestrictions),
        timezoneRestrictions: numbers(item.timezoneRestrictions),
        seniority: strings(item.seniority),
        categories: [...(strings(item.parentCategories) ?? []), ...(strings(item.categories) ?? [])],
        salaryMin: positive(item.minSalary),
        salaryMax: positive(item.maxSalary),
        salaryPeriod,
        salaryCurrency: item.currency || undefined,
      });
    }
    if (!data.nextCursor || oldest < sinceMs) break;
    cursor = data.nextCursor;
  }
  return jobs;
}
