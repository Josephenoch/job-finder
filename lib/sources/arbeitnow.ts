import { fetchJson } from "../http";
import type { Job } from "../types";
import { clip, fromUnix, httpUrl, strings, stripHtml } from "../text";

type ArbeitnowJob = {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean | string;
  url?: string;
  tags?: string[];
  location?: string;
  created_at?: number;
};

export async function loadArbeitnow(): Promise<Job[]> {
  const data = await fetchJson<{ data?: ArbeitnowJob[] }>(
    "https://www.arbeitnow.com/api/job-board-api",
  );
  const jobs: Job[] = [];
  for (const item of data.data ?? []) {
    if (item.remote !== true && item.remote !== "true") continue;
    const url = httpUrl(item.url);
    if (!item.title || !url || item.created_at == null) continue;
    jobs.push({
      id: `arbeitnow:${item.slug || item.title}`,
      title: stripHtml(item.title),
      company: stripHtml(item.company_name || "Unknown"),
      url,
      description: clip(stripHtml(item.description || ""), 1200),
      postedAt: fromUnix(item.created_at),
      source: "Arbeitnow",
      sourceUrl: "https://www.arbeitnow.com",
      locationText: item.location,
      categories: strings(item.tags),
    });
  }
  return jobs;
}
