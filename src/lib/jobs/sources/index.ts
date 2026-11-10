import type { NormalizedJob, RadarSourceReport } from "../types";
import { fetchJobs as fetchAtsBoards } from "./ats-boards";
import { fetchJobs as fetchHackerNews } from "./hackernews";
import { fetchJobs as fetchHimalayas } from "./himalayas";
import { fetchJobs as fetchRemoteOk } from "./remoteok";
import { fetchJobs as fetchRemotive } from "./remotive";
import { fetchJobs as fetchWeWorkRemotely } from "./weworkremotely";

const sources: { source: string; run: () => Promise<NormalizedJob[]> }[] = [
  { source: "Hacker News", run: fetchHackerNews },
  { source: "Remote OK", run: fetchRemoteOk },
  { source: "Himalayas", run: fetchHimalayas },
  { source: "We Work Remotely", run: fetchWeWorkRemotely },
  { source: "Remotive", run: fetchRemotive },
  { source: "ATS boards", run: fetchAtsBoards },
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : "failed";
}

export async function loadRadarSources(): Promise<{ jobs: NormalizedJob[]; reports: RadarSourceReport[] }> {
  const settled = await Promise.all(
    sources.map(async (source) => {
      try {
        const jobs = await source.run();
        return { source: source.source, jobs, count: jobs.length };
      } catch (error) {
        return { source: source.source, jobs: [] as NormalizedJob[], count: 0, error: message(error) };
      }
    }),
  );
  return {
    jobs: settled.flatMap((item) => item.jobs),
    reports: settled.map(({ source, count, error }) => ({ source, count, ...(error ? { error } : {}) })),
  };
}
