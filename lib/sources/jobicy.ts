import { fetchJson } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, strings, stripHtml } from "../text";

type JobicyJob = {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  jobIndustry?: string[];
};

export async function loadJobicy(): Promise<Job[]> {
  const jobs: Job[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 2; page++) {
    const url = new URL("https://jobicy.com/api/v2/remote-jobs");
    url.searchParams.set("count", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await fetchJson<{
      jobs?: JobicyJob[];
      nextCursor?: string;
      hasMore?: boolean;
    }>(url.toString());
    for (const item of data.jobs ?? []) {
      const link = httpUrl(item.url);
      if (!item.jobTitle || !link || !item.pubDate) continue;
      const posted = Date.parse(item.pubDate);
      if (Number.isNaN(posted)) continue;
      jobs.push({
        id: `jobicy:${item.id ?? item.jobTitle}`,
        title: stripHtml(item.jobTitle),
        company: stripHtml(item.companyName || "Unknown"),
        url: link,
        description: clip(stripHtml(item.jobDescription || item.jobExcerpt || ""), 1200),
        postedAt: new Date(posted).toISOString(),
        source: "Jobicy",
        sourceUrl: "https://jobicy.com",
        locationText: item.jobGeo,
        seniority: item.jobLevel ? [item.jobLevel] : undefined,
        categories: strings(item.jobIndustry),
      });
    }
    if (!data.hasMore || !data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return jobs;
}
