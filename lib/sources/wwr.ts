import { fetchText } from "../http";
import type { Job } from "../types";
import { clip, httpUrl, stripHtml } from "../text";
import { rssItems, rssTag } from "./rss";

const FEEDS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-design-jobs.rss",
  "https://weworkremotely.com/categories/remote-product-jobs.rss",
  "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss",
  "https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss",
  "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
  "https://weworkremotely.com/categories/remote-copywriting-jobs.rss",
  "https://weworkremotely.com/categories/remote-business-jobs.rss",
  "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
];

export async function loadWwr(): Promise<Job[]> {
  const seen = new Set<string>();
  const jobs: Job[] = [];
  let failure: unknown = null;
  for (const feed of FEEDS) {
    let xml: string;
    try {
      xml = await fetchText(feed);
    } catch (error) {
      failure = error;
      continue;
    }
    for (const block of rssItems(xml)) {
      const rawTitle = rssTag(block, "title");
      const url = httpUrl(rssTag(block, "link")) ?? httpUrl(rssTag(block, "guid"));
      const pubDate = rssTag(block, "pubDate");
      if (!rawTitle || !url || !pubDate || seen.has(url)) continue;
      const posted = Date.parse(pubDate);
      if (Number.isNaN(posted)) continue;
      seen.add(url);
      const splitAt = rawTitle.indexOf(":");
      const company = splitAt === -1 ? "Unknown" : rawTitle.slice(0, splitAt).trim();
      const title = splitAt === -1 ? rawTitle.trim() : rawTitle.slice(splitAt + 1).trim();
      const category = rssTag(block, "category");
      jobs.push({
        id: `wwr:${url}`,
        title: stripHtml(title),
        company: stripHtml(company),
        url,
        description: clip(stripHtml(rssTag(block, "description")), 1200),
        postedAt: new Date(posted).toISOString(),
        source: "We Work Remotely",
        sourceUrl: "https://weworkremotely.com",
        locationText: rssTag(block, "region") || undefined,
        categories: category ? [category] : undefined,
      });
    }
  }
  if (!jobs.length && failure) throw failure;
  return jobs;
}
