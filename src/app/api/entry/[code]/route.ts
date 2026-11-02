import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { portalLinkEmail } from "@/features/intake/emails";
import { entrySchema } from "@/features/intake/entry-schema";
import { createEntryApplication, loadEntry } from "@/features/intake/entry-server";
import { getPublicEnv } from "@/lib/env";
import { signReceipt } from "@/server/crypto/receipt";
import { newToken } from "@/server/crypto/tokens";
import { sendEmail } from "@/server/email/send";
import { clientIpHash, withinRateLimit } from "@/server/rate-limit";

// Entries faster than this are scripted; people need longer to fill in the form.
const MIN_ELAPSED_MS = 3000;

/** First error per field, as Entry.errors keys. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
}

/**
 * Records an entry and returns signed uploads for its documents plus a receipt for
 * POST ./complete. The personal-page token is returned only for a new application; it is always
 * emailed, so a repeat entry with someone else's email address reveals nothing.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/entry/[code]">) {
  const { code } = await params;
  const ip = await clientIpHash();
  const [ipOk, codeOk] = await Promise.all([
    withinRateLimit(`entry:ip:${ip}`, 20, 3600),
    withinRateLimit(`entry:code:${code}`, 300, 3600),
  ]);
  if (!ipOk || !codeOk) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }
  // Bots get a normal-looking answer so they learn nothing, and nothing is stored.
  if (parsed.data.website || parsed.data.elapsedMs < MIN_ELAPSED_MS) {
    return NextResponse.json({
      receipt: signReceipt(randomUUID()),
      token: newToken(),
      uploads: [],
    });
  }

  const entry = await loadEntry(code);
  if (!entry) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (!entry.view.open) return NextResponse.json({ error: "closed" }, { status: 410 });
  if (entry.view.requiresCv && !parsed.data.files.some((f) => f.kind === "cv")) {
    return NextResponse.json(
      { error: "invalid", fields: { files: "cvRequired" } },
      { status: 400 },
    );
  }

  const result = await createEntryApplication(entry, parsed.data);
  try {
    await sendEmail({
      to: parsed.data.email,
      ...portalLinkEmail({
        name: result.candidateName,
        company: entry.view.company,
        jobTitle: entry.view.job.title,
        portalUrl: `${getPublicEnv().appUrl}/p/${result.token}`,
      }),
    });
  } catch (error) {
    // The entry is saved either way; staff can resend the link later.
    console.error(
      "[entry] confirmation email failed",
      error instanceof Error ? error.message : error,
    );
  }

  return NextResponse.json({
    receipt: signReceipt(result.applicationId),
    token: result.created ? result.token : null,
    uploads: result.uploads,
  });
}
