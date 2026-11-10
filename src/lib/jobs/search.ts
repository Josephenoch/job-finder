import type { Job } from "@/lib/types";
import type { NormalizedJob } from "./types";

const SOURCE_HOME: Record<string, string> = {
  "Hacker News": "https://news.ycombinator.com",
  Greenhouse: "https://job-boards.greenhouse.io",
  Lever: "https://jobs.lever.co",
  Ashby: "https://jobs.ashbyhq.com",
  "Remote OK": "https://remoteok.com",
  Remotive: "https://remotive.com",
  Himalayas: "https://himalayas.app",
  "We Work Remotely": "https://weworkremotely.com",
};

function sourceId(source: string): string {
  return source.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function toSearchJobs(jobs: NormalizedJob[], sinceMs: number, now = Date.now()): Job[] {
  const matched: Job[] = [];
  for (const job of jobs) {
    const postedAt = job.postedAt;
    if (!postedAt) continue;
    const posted = postedAt.getTime();
    if (posted < sinceMs || posted > now + 60_000) continue;
    const listing = job.url;
    matched.push({
      id: `${sourceId(job.source)}:${job.externalId}`,
      title: job.title,
      company: job.company,
      url: job.applyUrl || listing,
      description: job.text || job.descriptionSnippet,
      postedAt: postedAt.toISOString(),
      source: job.source,
      sourceUrl: SOURCE_HOME[job.source] ?? listing,
      ...(job.locationText ? { locationText: job.locationText } : {}),
      ...(job.tags.length ? { categories: job.tags } : {}),
      ...(job.salaryMin != null ? { salaryMin: job.salaryMin } : {}),
      ...(job.salaryMax != null ? { salaryMax: job.salaryMax } : {}),
      ...(job.salaryPeriod ? { salaryPeriod: job.salaryPeriod } : {}),
      ...(job.salaryCurrency ? { salaryCurrency: job.salaryCurrency } : {}),
    });
  }
  return matched;
}
