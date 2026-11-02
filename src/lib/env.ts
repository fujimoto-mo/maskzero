import { z } from "zod";

const publicEnvSchema = z.object({
  supabaseUrl: z.url(),
  supabasePublishableKey: z.string().min(1),
  appUrl: z.url(),
  googleAuthEnabled: z.boolean(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

const variableNames: Record<string, string> = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabasePublishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  appUrl: "NEXT_PUBLIC_APP_URL",
};

let cached: PublicEnv | undefined;

/** Validated on first use rather than at import, so `next build` runs without runtime secrets. */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  // Empty values count as unset, so the blanks in a fresh .env fall back or fail clearly.
  const result = publicEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
    googleAuthEnabled: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
  });
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => variableNames[String(i.path[0])]))];
    throw new Error(
      `Missing or invalid environment variables: ${names.join(", ")}. Fill them in .env (see .env.example).`,
    );
  }
  cached = result.data;
  return cached;
}
