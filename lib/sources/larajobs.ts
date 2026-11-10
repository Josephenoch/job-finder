import { fetchText } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, stripHtml } from "../text";
import { rssItems, rssTag } from "./rss";

export async function loadLaraJobs(): Promise<Job[]> {
  const xml = await fetchText("https://larajobs.com/feed");
  const jobs: Job[] = [];
  for (const block of rssItems(xml)) {
    const title = rssTag(block, "title");
    const url = httpUrl(rssTag(block, "link"));
    const pubDate = rssTag(block, "pubDate");
    const posted = Date.parse(pubDate);
    if (!title || !url || Number.isNaN(posted)) continue;
    const tags = rssTag(block, "job:tags")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const salary = stripHtml(rssTag(block, "job:salary"));
    const description = stripHtml(rssTag(block, "description"));
    jobs.push({
      id: `larajobs:${url}`,
      title: stripHtml(title),
      company: stripHtml(rssTag(block, "job:company") || "Unknown"),
      url,
      description: clip(description || [salary, tags.join(", ")].filter(Boolean).join(". "), 1200),
      postedAt: new Date(posted).toISOString(),
      source: "Laravel Jobs",
      sourceUrl: "https://larajobs.com",
      locationText: stripHtml(rssTag(block, "job:location")) || undefined,
      categories: tags,
      salaryText: salary || undefined,
    });
  }
  return jobs;
}
