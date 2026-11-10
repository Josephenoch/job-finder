import { toSearchJobs } from "@/src/lib/jobs/search";
import { fetchJobs as fetchAtsBoards } from "@/src/lib/jobs/sources/ats-boards";
import { fetchJobs as fetchHackerNews } from "@/src/lib/jobs/sources/hackernews";
import { DEFAULT_MAX_AGE_DAYS, maxAgeMs } from "../jobs";
import type { Job, SourceReport } from "../types";
import { loadArbeitnow } from "./arbeitnow";
import { loadHimalayas } from "./himalayas";
import { loadJobgether } from "./jobgether";
import { loadJobicy } from "./jobicy";
import { loadLaraJobs } from "./larajobs";
import { loadPythonJobs } from "./pythonorg";
import { loadRemoteOk } from "./remoteok";
import { loadRemotive } from "./remotive";
import { loadWorkingNomads } from "./workingnomads";
import { loadJobBank } from "./jobbank";
import { loadRelocate } from "./relocate";
import { loadVanhack } from "./vanhack";
import { loadWwr } from "./wwr";

const UNFETCHABLE: SourceReport[] = [
  { source: "LinkedIn", count: 0, error: "No public feed. Search visa sponsorship, relocation, and LMIA there yourself." },
  { source: "Indeed Canada", count: 0, error: "No public feed." },
  { source: "Workopolis", count: 0, error: "Blocked by Cloudflare." },
  { source: "Wellfound", count: 0, error: "No public feed." },
  { source: "Techjobs.ca", count: 0, error: "Blocked by Cloudflare." },
  { source: "Glassdoor", count: 0, error: "No public feed." },
  { source: "Google Jobs", count: 0, error: "No public feed." },
];

export async function loadAllFeeds(
  onStatus: (message: string) => void,
  since = Date.now() - maxAgeMs(DEFAULT_MAX_AGE_DAYS),
  onJobs?: (jobs: Job[]) => void,
  options?: { sponsoredMove?: boolean; queries?: string[] },
): Promise<{
  jobs: Job[];
  reports: SourceReport[];
}> {
  const tasks: { source: string; run: () => Promise<number> }[] = [
    { source: "Remote OK", run: () => emit(loadRemoteOk(), onJobs) },
    { source: "Remotive", run: () => emit(loadRemotive(), onJobs) },
    { source: "Arbeitnow", run: () => emit(loadArbeitnow(), onJobs) },
    { source: "Jobicy", run: () => emit(loadJobicy(), onJobs) },
    { source: "We Work Remotely", run: () => emit(loadWwr(), onJobs) },
    { source: "Jobgether", run: () => emit(loadJobgether(since, options?.queries ?? []), onJobs) },
    { source: "Working Nomads", run: () => emit(loadWorkingNomads(), onJobs) },
    { source: "Python.org", run: () => emit(loadPythonJobs(since), onJobs) },
    { source: "Laravel Jobs", run: () => emit(loadLaraJobs(), onJobs) },
    {
      source: "Himalayas",
      run: () => emit(loadHimalayas(since, (page) => onStatus(`Reading Himalayas, page ${page}…`)), onJobs),
    },
    { source: "Hacker News", run: () => emit(fetchHackerNews().then((jobs) => toSearchJobs(jobs, since)), onJobs) },
    ...(options?.sponsoredMove
      ? [
          { source: "VanHack", run: () => emit(loadVanhack(), onJobs) },
          { source: "Relocate.me", run: () => emit(loadRelocate(), onJobs) },
          { source: "Canada Job Bank", run: () => emit(loadJobBank(), onJobs) },
        ]
      : []),
    {
      source: "ATS boards",
      run: async () => {
        let count = 0;
        await fetchAtsBoards(since, onStatus, (batch) => {
          const jobs = toSearchJobs(batch, since);
          count += jobs.length;
          if (jobs.length) onJobs?.(jobs);
        });
        return count;
      },
    },
  ];

  const reports = new Array<SourceReport>(tasks.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      const task = tasks[index];
      try {
        const count = await task.run();
        reports[index] = { source: task.source, count };
      } catch (error) {
        reports[index] = {
          source: task.source,
          count: 0,
          error: error instanceof Error ? error.message : "failed",
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, () => run()));

  if (options?.sponsoredMove) reports.push(...UNFETCHABLE);
  return { jobs: [], reports };
}

async function emit(pending: Promise<Job[]>, onJobs?: (jobs: Job[]) => void): Promise<number> {
  const jobs = await pending;
  if (jobs.length) onJobs?.(jobs);
  return jobs.length;
}
