import { fetchJson } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, strings, stripHtml } from "../text";

type RemotiveJob = {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  tags?: string[];
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  category?: string;
};

export async function loadRemotive(): Promise<Job[]> {
  const data = await fetchJson<{ jobs?: RemotiveJob[] }>(
    "https://remotive.com/api/remote-jobs",
  );
  const jobs: Job[] = [];
  for (const item of data.jobs ?? []) {
    const url = httpUrl(item.url);
    if (!item.title || !url || !item.publication_date) continue;
    const posted = Date.parse(item.publication_date);
    if (Number.isNaN(posted)) continue;
    jobs.push({
      id: `remotive:${item.id ?? item.title}`,
      title: stripHtml(item.title),
      company: stripHtml(item.company_name || "Unknown"),
      url,
      description: clip(stripHtml(item.description || ""), 1200),
      postedAt: new Date(posted).toISOString(),
      source: "Remotive",
      sourceUrl: "https://remotive.com",
      locationText: item.candidate_required_location,
      categories: [...(strings(item.tags) ?? []), ...(item.category ? [item.category] : [])],
      salaryText: item.salary?.trim() || undefined,
    });
  }
  return jobs;
}
