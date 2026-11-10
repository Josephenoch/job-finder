import { fetchJson } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, stripHtml } from "../text";

type NomadJob = {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
};

export async function loadWorkingNomads(): Promise<Job[]> {
  const data = await fetchJson<NomadJob[]>("https://www.workingnomads.com/api/exposed_jobs/");
  const jobs: Job[] = [];
  for (const item of data) {
    const url = httpUrl(item.url);
    const posted = Date.parse(item.pub_date ?? "");
    if (!item.title || !url || Number.isNaN(posted)) continue;
    const tags = item.tags
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    jobs.push({
      id: `workingnomads:${url}`,
      title: stripHtml(item.title),
      company: stripHtml(item.company_name || "Unknown"),
      url,
      description: clip(stripHtml(item.description || ""), 1200),
      postedAt: new Date(posted).toISOString(),
      source: "Working Nomads",
      sourceUrl: "https://www.workingnomads.com",
      locationText: item.location,
      categories: [...(item.category_name ? [item.category_name] : []), ...(tags ?? [])],
    });
  }
  return jobs;
}
