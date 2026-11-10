import { fetchText } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, stripHtml } from "../text";

export async function loadPythonJobs(since: number): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let page = 1; page <= 5; page++) {
    const html = await fetchText(`https://www.python.org/jobs/?page=${page}`);
    const blocks = [...html.matchAll(/<li>\s*<h2 class="listing-company">([\s\S]*?)<\/li>/g)];
    let sawOld = false;
    for (const match of blocks) {
      const job = parseListing(match[1]);
      if (!job) continue;
      if (Date.parse(job.postedAt) < since) {
        sawOld = true;
        continue;
      }
      jobs.push(job);
    }
    if (sawOld || blocks.length === 0) break;
  }
  let next = 0;
  async function readDescription(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      try {
        const html = await fetchText(job.url);
        const start = html.indexOf('class="job-description"');
        if (start === -1) continue;
        job.description = clip(stripHtml(html.slice(start, start + 6000)), 1200);
      } catch {
        continue;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, () => readDescription()));
  return jobs;
}

function parseListing(block: string): Job | null {
  const link = block.match(/<a href="(\/jobs\/\d+\/)">([^<]+)<\/a>\s*<br\s*\/?>\s*([^<]+)/);
  const postedAt = block.match(/<time datetime="([^"]+)"/)?.[1];
  const url = httpUrl(link ? `https://www.python.org${link[1]}` : undefined);
  if (!link || !postedAt || !url || Number.isNaN(Date.parse(postedAt))) return null;
  const location = block.match(/class="listing-location"[^>]*>\s*<a[^>]*>([^<]+)/)?.[1];
  const types = [...block.matchAll(/class="listing-job-type"[\s\S]*?<\/span>/g)]
    .flatMap((span) => [...span[0].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((anchor) => anchor[1].trim()))
    .filter(Boolean);
  return {
    id: `pythonorg:${link[1]}`,
    title: stripHtml(link[2]),
    company: stripHtml(link[3]),
    url,
    description: clip([location, types.join(", ")].filter(Boolean).join(". "), 1200),
    postedAt: new Date(postedAt).toISOString(),
    source: "Python.org",
    sourceUrl: "https://www.python.org/jobs/",
    locationText: location ? stripHtml(location) : undefined,
    categories: types,
  };
}
