// Runs Supabase CLI commands against the hosted project configured in .env.
//   pnpm db:link   links this folder to SUPABASE_PROJECT_REF (run `supabase login` once first)
//   pnpm db:push   applies new migrations in supabase/migrations to the hosted database
// The seed file is never pushed: it creates a demo login with a published password.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const ref = process.env.SUPABASE_PROJECT_REF;
const commands = {
  link: ["link", "--project-ref", ref],
  push: ["db", "push"],
};
const args = commands[process.argv[2]];

if (!args) {
  console.error("Usage: node scripts/supabase-remote.mjs <link|push>");
  process.exit(1);
}
if (!ref) {
  console.error("Set SUPABASE_PROJECT_REF in .env first (see .env.example).");
  process.exit(1);
}

// The CLI reads SUPABASE_DB_PASSWORD from the environment, so it doesn't prompt for it.
const result = spawnSync("supabase", args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
