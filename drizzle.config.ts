import { defineConfig } from "drizzle-kit";

// Migrations are written into supabase/migrations with Supabase-style names, so `supabase start`,
// `supabase db reset` and CI apply exactly what drizzle-kit generated (docs/05 §2).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  schemaFilter: ["public"],
  entities: { roles: { provider: "supabase" } },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
  strict: true,
  verbose: true,
});
