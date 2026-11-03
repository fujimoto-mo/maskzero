import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestInboundEmail } from "@/features/inbound/server";
import { staffNotify } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { basicAuthMatches } from "@/server/webhooks/basic-auth";

// Inbound mail (docs/02 M3-10, docs/05 §10): the provider posts each email sent to an
// in+{org}@ address as JSON (Postmark's inbound format). The answer never says whether the
// address belonged to a company.

const address = z.object({ Email: z.string().max(320) });
const payload = z.object({
  FromFull: address.optional(),
  From: z.string().max(500).default(""),
  ToFull: z.array(address).max(50).default([]),
  OriginalRecipient: z.string().max(320).optional(),
  Subject: z.string().max(2000).default(""),
  TextBody: z.string().max(200_000).default(""),
  HtmlBody: z.string().max(500_000).default(""),
});

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export async function POST(request: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  if (!basicAuthMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const mail = parsed.data;
  const result = await ingestInboundEmail({
    to: [mail.OriginalRecipient, ...mail.ToFull.map((t) => t.Email)].filter((a): a is string =>
      Boolean(a),
    ),
    from: mail.FromFull?.Email ?? mail.From,
    subject: mail.Subject,
    text: mail.TextBody || htmlToText(mail.HtmlBody),
  });
  if (result.kind === "candidate_reply") {
    await sendEventBestEffort(
      staffNotify.create({
        orgId: result.orgId,
        applicationId: result.applicationId,
        kind: "candidate_reply",
      }),
    );
  }
  return NextResponse.json({ ok: true });
}
