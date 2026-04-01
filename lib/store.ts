import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { appStateSchema, type AppState } from "@/lib/schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "state.json");

const defaultState: AppState = {
  monitors: [],
  hotspots: [],
  notifications: [],
  runs: [],
};

let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

export async function readAppState() {
  await ensureDataFile();

  const file = await readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(file) as unknown;

  return appStateSchema.parse(parsed);
}

export async function writeAppState(nextState: AppState) {
  await ensureDataFile();

  writeQueue = writeQueue.then(async () => {
    await writeFile(DATA_FILE, JSON.stringify(nextState, null, 2), "utf8");
  });

  await writeQueue;
}