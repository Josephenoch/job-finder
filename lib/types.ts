export type SalaryPeriod = "hour" | "week" | "month" | "year";

export type Job = {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string;
  postedAt: string;
  source: string;
  sourceUrl: string;
  locationText?: string;
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
  seniority?: string[];
  categories?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: SalaryPeriod;
  salaryCurrency?: string;
  salaryText?: string;
};

export type SourceReport = {
  source: string;
  count: number;
  error?: string;
};

export const APPLICATION_STATUSES = ["saved", "applied", "interviewing", "offer", "rejected", "not_interested"] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type RankedJob = {
  id: string;
  title: string;
  company: string;
  url: string;
  source: string;
  sourceUrl: string;
  postedAt: string;
  location: string;
  salary: string;
  score: number | null;
  reason: string | null;
  status: ApplicationStatus;
};
