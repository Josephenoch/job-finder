import { mkdirSync } from "node:fs";
import path from "node:path";
import sqlite from "@prisma/orm-sqlite/runtime";
import { contractFromJson } from "@prisma/orm-sqlite/static";
import type { Contract } from "./contract";
import contractJson from "./contract.json" with { type: "json" };

const dbPath = path.resolve(process.env.SQLITE_PATH ?? "./data/jobs.db");
mkdirSync(path.dirname(dbPath), { recursive: true });

export const contract = contractFromJson<Contract>(contractJson);

export const db = sqlite({ contract, path: dbPath });
