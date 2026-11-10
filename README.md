# Job finder

Job finder searches public job feeds for recent roles you can do from Nigeria, scores them against a PDF CV with a local model, and keeps the ones worth applying to.

The CV is read on your machine. Ranking uses [Ollama](https://ollama.com) on your machine. Nothing is sent to a hosted model API. Results are stored in a local SQLite file.

## What a search does

1. Upload a text-based PDF CV on the home page. Scanned PDFs with no text layer cannot be read.
2. Choose how recent the posting must be, a minimum monthly pay, and whether to include sponsored moves.
3. The app extracts the CV text, asks Ollama for likely titles and keywords, and pulls listings from the public feeds below.
4. A listing is kept when it was posted inside the time window, the location can be done from Nigeria (or it is a qualifying sponsored move), and the stated pay is not below the floor. Listings with no pay still pass the pay floor.
5. Listings already searched, or the same company and title seen before, are skipped.
6. The strongest keyword matches, up to 8, are scored one by one. Each description is cut to its first 280 characters before scoring. A role is saved when its score is at least 50. Each saved role stores the score and a short reason.
7. Open **Saved jobs** to track status: not applied, applied, interviewing, offer, rejected, or not interested.

Defaults are the last 3 days and $2,000 per month. Pay in EUR, GBP, CAD, AUD, and NGN is converted to a rough monthly USD figure before the floor is applied.

If Ollama is not running, or the only installed chat model is larger than about 1.8 GB, the search still runs. Those roles are saved without a score. The preferred model is `qwen2.5:0.5b`. Another installed `qwen2.5` model under about 1.8 GB is used when that one is missing.

## Feeds

Every search reads:

- Remote OK
- Remotive
- Arbeitnow
- Jobicy
- We Work Remotely
- Jobgether
- Working Nomads
- Python.org
- Laravel Jobs
- Himalayas
- Hacker News
- Greenhouse, Lever, and Ashby company boards

With **sponsored move** turned on, the search also reads Canada Job Bank, VanHack, and Relocate.me. It then also keeps Canadian roles that state visa sponsorship or relocation, and UK roles that state both. Roles that say they will not sponsor a visa are left out.

LinkedIn, Indeed Canada, Workopolis, Wellfound, Techjobs.ca, Glassdoor, and Google Jobs are reported as skipped. They have no public feed this app can use, or they block automated reads. One failed feed does not stop the others.

Greenhouse, Lever, and Ashby company slugs live in `src/lib/jobs/boards.ts`. The seeded slug lists are CC BY-NC 4.0 from [Riley Dorrington’s job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator), for personal non-commercial use. Add a slug under `extra` in that file, or remove one from the seed JSON in `src/lib/jobs/seed/`.

## Saved data

SQLite is created at `data/jobs.db` on first use. Saved roles and the ids of listings already considered are stored there. Delete that file to start over.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SQLITE_PATH` | `./data/jobs.db` | Database file |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API |
| `OLLAMA_MODEL` | `qwen2.5:0.5b` | Model used to read the CV and score roles |

## Installation

You need Node.js 20.9 or newer, Yarn 4.18.1, and a browser. Ollama with `qwen2.5:0.5b` is needed for ranking. The installers set these up when they are missing.

Double-click the installer for your system, then the opener. Leave the opener’s window open while you use the app. It starts the dev server and opens http://127.0.0.1:3000.

| System | Install | Open |
| --- | --- | --- |
| Mac | `Install Job Finder.command` | `Open Job Finder.command` |
| Windows | `Install Job Finder.bat` | `Open Job Finder.bat` |
| Linux | `Install Job Finder.desktop` or `Install Job Finder.sh` | `Open Job Finder.desktop` or `Open Job Finder.sh` |

The Mac and Linux installers detect the system. If Node.js is missing or older than 20.9, they install the current Node.js LTS under your user account (`~/.local/job-finder/node`). Windows does the same with `Install Job Finder.bat` (`%LOCALAPPDATA%\job-finder\node`). They then install Yarn 4.18.1 through Corepack, install the packages in `yarn.lock`, and install Ollama plus `qwen2.5:0.5b` when that is possible. The site still opens if Ollama cannot be installed.

To install from a terminal instead:

```bash
corepack enable
corepack yarn install
corepack yarn dev
```

`package.json` pins `yarn@4.18.1`. Yarn 1 cannot read this lockfile. Open http://localhost:3000.

Other scripts:

```bash
corepack yarn build
corepack yarn start
corepack yarn lint
```

## Adding a feed

Search adapters live in `lib/sources/`. Radar adapters in `src/lib/jobs/sources/` are a separate path. Hacker News and the ATS boards are shared with search through that radar path. `loadRadarSources` is not what the home page calls.

1. Add `src/lib/jobs/sources/<name>.ts` that exports `fetchJobs(): Promise<NormalizedJob[]>`.
2. Validate the response with Zod before mapping fields. Use the official API or RSS feed only.
3. Map each listing with `toNormalizedJob`. Set `source` to the site name and `url` to the original listing.
4. Register the function in the `sources` array in `src/lib/jobs/sources/index.ts`. A thrown error is caught there, so one source cannot stop the others.
5. To include it in a CV search, also load it from `lib/sources/index.ts` and map the records with `toSearchJobs`.
