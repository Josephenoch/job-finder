import { fetchJson } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, positive, stripHtml } from "../text";

type JobgetherJob = {
  id?: string;
  title?: string;
  company?: string;
  url?: string;
  location?: string;
  remote?: string;
  contractType?: string;
  experience?: string;
  salaryRange?: string;
  jobFunctions?: string[];
  postedAt?: string;
};

export async function loadJobgether(since: number, queries: string[]): Promise<Job[]> {
  const keywords = [...new Set(queries.map((query) => query.trim()).filter(Boolean))].slice(0, 3);
  if (!keywords.length) keywords.push("remote");
  const jobs = new Map<string, Job>();
  for (const keyword of keywords) {
    for (const job of await loadKeyword(keyword, since)) jobs.set(job.id, job);
  }
  return [...jobs.values()];
}

async function loadKeyword(keyword: string, since: number): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = new URL("https://www.jobgether.com/api/v1/jobs");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("locations", "anywhere");
    url.searchParams.set("remoteType", "full-remote");
    url.searchParams.set("sort", "date");
    url.searchParams.set("limit", "25");
    url.searchParams.set("page", String(page));
    const data = await fetchJson<{
      jobs?: JobgetherJob[];
      pagination?: { hasMore?: boolean };
    }>(url.toString());
    let oldest = Number.POSITIVE_INFINITY;
    for (const item of data.jobs ?? []) {
      const posted = Date.parse(item.postedAt ?? "");
      if (Number.isNaN(posted)) continue;
      oldest = Math.min(oldest, posted);
      if (posted < since) continue;
      const link = httpUrl(item.url);
      if (!item.id || !item.title || !link) continue;
      const salary = readSalary(item.salaryRange);
      const functions = (item.jobFunctions ?? []).filter(Boolean);
      jobs.push({
        id: `jobgether:${item.id}`,
        title: stripHtml(item.title),
        company: stripHtml(item.company || "Unknown"),
        url: link,
        description: clip(
          [item.experience, item.contractType, item.remote, functions.join(", ")].filter(Boolean).join(". "),
          1200,
        ),
        postedAt: new Date(posted).toISOString(),
        source: "Jobgether",
        sourceUrl: "https://www.jobgether.com",
        locationText: item.location,
        categories: functions,
        seniority: seniority(item.experience),
        salaryText: item.salaryRange?.trim() || undefined,
        ...salary,
      });
    }
    if (!data.pagination?.hasMore || oldest < since) break;
  }
  return jobs;
}

function seniority(experience: string | undefined): string[] | undefined {
  if (!experience) return undefined;
  if (/senior|expert|staff|principal|lead/i.test(experience)) return ["senior"];
  return [experience];
}

function readSalary(range: string | undefined): Pick<Job, "salaryMin" | "salaryMax" | "salaryPeriod" | "salaryCurrency"> {
  const match = range?.trim().match(/^([\d,.]+)\s*[-–]\s*([\d,.]+)\s+([A-Za-z]{3})$/);
  if (!match) return {};
  const salaryMin = positive(Number(match[1].replace(/,/g, "")));
  const salaryMax = positive(Number(match[2].replace(/,/g, "")));
  if (salaryMin == null && salaryMax == null) return {};
  return {
    salaryMin,
    salaryMax,
    salaryPeriod: "year",
    salaryCurrency: match[3].toUpperCase(),
  };
}
