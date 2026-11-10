import { fetchJson } from "../http";
import type { Job } from "../types";
import { clip, fromUnix, httpUrl, positive, strings, stripHtml } from "../text";

type RemoteOkJob = {
  id?: number | string;
  position?: string;
  company?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  date?: string;
  epoch?: number;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  tags?: string[];
};

export async function loadRemoteOk(): Promise<Job[]> {
  const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
  const jobs: Job[] = [];
  for (const item of data) {
    const url = httpUrl(item.apply_url) ?? httpUrl(item.url);
    if (!item.position || !url) continue;
    const postedAt = item.epoch ? fromUnix(item.epoch) : item.date;
    if (!postedAt || Number.isNaN(Date.parse(postedAt))) continue;
    jobs.push({
      id: `remoteok:${item.id ?? item.position}`,
      title: stripHtml(item.position),
      company: stripHtml(item.company || "Unknown"),
      url,
      description: clip(stripHtml(item.description || ""), 1200),
      postedAt: new Date(postedAt).toISOString(),
      source: "Remote OK",
      sourceUrl: "https://remoteok.com",
      locationText: item.location,
      categories: strings(item.tags),
      salaryMin: positive(item.salary_min),
      salaryMax: positive(item.salary_max),
      salaryPeriod: positive(item.salary_min) || positive(item.salary_max) ? "year" : undefined,
      salaryCurrency: positive(item.salary_min) || positive(item.salary_max) ? "USD" : undefined,
    });
  }
  return jobs;
}
