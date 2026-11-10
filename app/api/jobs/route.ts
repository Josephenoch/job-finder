import { io } from "next/cache";
import { extractCv } from "@/lib/cv";
import {
  acceptsNigeria,
  formatSalary,
  isRecent,
  locationLabel,
  MATCH_LIMIT,
  maxAgeMs,
  meetsPayFloor,
  offersCanadaOrUkMove,
  parseMaxAgeDays,
  parseMinMonthlyUsd,
  termOverlap,
  termsFromText,
} from "@/lib/jobs";
import { analysisModel, type CandidateProfile, readCandidate, scoreBatch, unloadLargeModels } from "@/lib/ollama";
import { loadAllFeeds } from "@/lib/sources";
import { listJobs, loadSearched, rememberSearched, roleKey, saveJobs } from "@/lib/store";
import type { Job, RankedJob } from "@/lib/types";

const MIN_SCORE = 50;

export async function GET() {
  await io();
  const jobs = await listJobs();
  return Response.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: "Upload a PDF CV." }, { status: 400 });
  }

  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ message: "Upload a PDF CV." }, { status: 400 });
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return Response.json({ message: "Upload a PDF CV." }, { status: 400 });
  }

  let cvText = "";
  try {
    cvText = await extractCv(await file.arrayBuffer());
  } catch {
    return Response.json({ message: "Could not read that PDF." }, { status: 400 });
  }
  if (cvText.trim().length < 40) {
    return Response.json({ message: "That PDF has too little text to match against." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const now = Date.now();
        const windowMs = maxAgeMs(parseMaxAgeDays(form.get("maxAgeDays")));
        const minMonthlyUsd = parseMinMonthlyUsd(form.get("minMonthlyUsd"));
        const sponsoredMove = form.get("sponsoredMove") === "1";
        const previous = await loadSearched();
        send("status", { message: "Reading your CV…" });

        await unloadLargeModels();
        const chosen = await analysisModel();
        const model = chosen.model;
        let profile: CandidateProfile = {
          summary: "",
          titles: [],
          keywords: termsFromText(cvText),
        };
        if (model) {
          try {
            profile = await readCandidate(cvText, model);
          } catch {
            profile = { summary: "", titles: [], keywords: termsFromText(cvText) };
          }
        } else {
          send("status", { message: "message" in chosen ? chosen.message : "These roles were not ranked." });
        }
        const terms = uniqueTerms(profile);
        if (!terms.length) terms.push(...termsFromText(cvText));

        const saved: RankedJob[] = [];
        const batch: { job: Job; rank: number }[] = [];
        const queue: Job[] = [];
        const seen = new Set<string>();
        const searchedIds = previous.ids;
        const knownRoles = previous.roles;
        let matched = 0;
        let skipped = 0;
        let feedsDone = false;
        let announced = false;
        let wake = () => {};

        const signal = () => {
          const resume = wake;
          wake = () => {};
          resume();
        };

        const qualifies = (job: Job) =>
          isRecent(job.postedAt, now, windowMs) &&
          (acceptsNigeria(job) || (sponsoredMove && offersCanadaOrUkMove(job))) &&
          meetsPayFloor(job, minMonthlyUsd);

        const enqueue = (jobs: Job[]) => {
          if (!jobs.length) return;
          queue.push(...jobs);
          signal();
        };

        const flushBatch = () => {
          if (batch.length < MATCH_LIMIT) return;
          batch.sort((a, b) => b.rank - a.rank || Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt));
          enqueue(batch.splice(0, MATCH_LIMIT).map((item) => item.job));
        };

        const consider = (incoming: Job[]) => {
          for (const job of incoming) {
            if (!qualifies(job)) continue;
            const key = roleKey(job.company, job.title);
            if (seen.has(key) || seen.has(job.id)) continue;
            if (searchedIds.has(job.id) || knownRoles.has(key)) {
              seen.add(key);
              seen.add(job.id);
              skipped += 1;
              continue;
            }
            seen.add(key);
            seen.add(job.id);
            const rank = termOverlap(terms, job);
            if (rank <= 0) continue;
            matched += 1;
            const brief = job.description.length > 280 ? { ...job, description: job.description.slice(0, 280) } : job;
            batch.push({ job: brief, rank });
            flushBatch();
          }
        };

        const markSearched = async (job: Job) => {
          searchedIds.add(job.id);
          knownRoles.add(roleKey(job.company, job.title));
          await rememberSearched(job.id);
        };

        const persist = async (job: RankedJob) => {
          const [row] = await saveJobs([job]);
          saved.push(row);
          send("job", row);
        };

        let analyzed = 0;
        const analysis = (async () => {
          while (true) {
            const job = queue.shift();
            if (!job) {
              if (feedsDone) break;
              await new Promise<void>((resolve) => {
                wake = resolve;
              });
              continue;
            }
            if (!announced) {
              announced = true;
              send("status", { message: "Reading job descriptions…" });
            }
            if (model) {
              const keepAlive = feedsDone && queue.length === 0 ? "0" : "2m";
              let row = { score: 0, reason: "Could not score this role" };
              try {
                const rows = await scoreBatch(model, profile, [job], minMonthlyUsd, sponsoredMove, keepAlive);
                if (rows[0]) row = rows[0];
              } catch {
                row = { score: 0, reason: "Could not score this role" };
              }
              if (row.score >= MIN_SCORE) await persist(toRanked(job, row.score, row.reason));
            } else {
              await persist(toRanked(job, null, null));
            }
            await markSearched(job);
            analyzed += 1;
            send("progress", { done: analyzed, total: analyzed + queue.length });
          }
        })();

        send("status", { message: "Fetching job feeds…" });
        const feeds = loadAllFeeds(
          (message) => send("status", { message: announced ? `${message} Scoring continues.` : message }),
          now - windowMs,
          consider,
          { sponsoredMove, queries: terms.slice(0, 3) },
        ).then((loaded) => {
          send("sources", { sources: loaded.reports });
          return loaded;
        });
        await feeds;
        feedsDone = true;
        if (batch.length) {
          batch.sort((a, b) => b.rank - a.rank || Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt));
          enqueue(batch.splice(0).map((item) => item.job));
        }
        signal();
        await analysis;
        saved.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || Date.parse(b.postedAt) - Date.parse(a.postedAt));
        send("result", {
          jobs: saved,
          matched,
          ranked: model ? saved.length : 0,
          capped: false,
          summary: profile.summary,
          titles: profile.titles,
          minMonthlyUsd,
          analysisSkipped: !model,
          skipReason: "message" in chosen ? chosen.message : undefined,
          skipped,
        });
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Search failed",
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The client already closed the stream.
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function uniqueTerms(profile: CandidateProfile): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...profile.titles, ...profile.keywords]) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

function toRanked(job: Job, score: number | null, reason: string | null): RankedJob {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    source: job.source,
    sourceUrl: job.sourceUrl,
    postedAt: job.postedAt,
    location: locationLabel(job),
    salary: formatSalary(job),
    score,
    reason,
    status: "saved",
  };
}
