// Writes .env.local from the running local Supabase stack (`supabase start` first). It overrides
// .env, so the app talks to the local stack; delete it to go back to the hosted project.
// Usage: pnpm env:local [--force]
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target) && !process.argv.includes("--force")) {
  console.error(`${target} already exists. Re-run with --force to overwrite it.`);
  process.exit(1);
}

const status = execFileSync("supabase", ["status", "-o", "env"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
const local = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const values = {
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY ?? local.ANON_KEY,
  DATABASE_URL: local.DB_URL,
  SUPABASE_SECRET_KEY: local.SECRET_KEY ?? local.SERVICE_ROLE_KEY,
};
for (const [key, value] of Object.entries(values)) {
  if (!value) {
    console.error(`Could not read ${key} from \`supabase status\`. Is the local stack running?`);
    process.exit(1);
  }
}
// Local-only extras: a throwaway encryption key, fake AI and fake integrations, so the whole
// pipeline runs offline.
values.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
values.AI_FAKE = "1";
values.INTEGRATIONS_FAKE = "1";

copyFileSync(".env.example", target);
let env = readFileSync(target, "utf8");
for (const [key, value] of Object.entries(values)) {
  env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
}
writeFileSync(target, env);
console.log(`Wrote ${target} from the local Supabase stack.`);
