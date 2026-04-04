import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CliArgs = {
  command: string | null;
  flags: Record<string, string | boolean>;
  positionals: string[];
};

export function ensureWorkspaceRoot() {
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  process.chdir(workspaceRoot);
  return workspaceRoot;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);

      if (inlineValue !== undefined) {
        flags[key] = inlineValue;
        continue;
      }

      const nextToken = argv[index + 1];

      if (!nextToken || nextToken.startsWith("--")) {
        flags[key] = true;
        continue;
      }

      flags[key] = nextToken;
      index += 1;
      continue;
    }

    if (!command) {
      command = token;
      continue;
    }

    positionals.push(token);
  }

  return { command, flags, positionals };
}

export function getStringFlag(flags: Record<string, string | boolean>, key: string) {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function getBooleanFlag(flags: Record<string, string | boolean>, key: string) {
  const value = flags[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  return undefined;
}

export function getNumberFlag(flags: Record<string, string | boolean>, key: string) {
  const value = getStringFlag(flags, key);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function readJsonPayload(flags: Record<string, string | boolean>) {
  const inlineJson = getStringFlag(flags, "json");
  const filePath = getStringFlag(flags, "file");

  if (inlineJson) {
    return JSON.parse(inlineJson) as unknown;
  }

  if (!filePath) {
    return null;
  }

  const content = await readFile(path.resolve(process.cwd(), filePath), "utf8");
  return JSON.parse(content) as unknown;
}

export function parseListFlag(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export function fail(message: string, usage: string): never {
  console.error(message);
  console.error(usage);
  process.exit(1);
}