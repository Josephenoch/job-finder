export type SalaryPeriod = "hour" | "week" | "month" | "year";

export type NormalizedJob = {
  source: string;
  externalId: string;
  title: string;
  company: string;
  url: string;
  applyUrl: string;
  descriptionSnippet: string;
  locationText: string;
  tags: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  postedAt: Date | null;
  text: string;
};

export type RadarSourceReport = {
  source: string;
  count: number;
  error?: string;
};
