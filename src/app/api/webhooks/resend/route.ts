import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/server/db/admin";
import { messages } from "@/server/db/schema";
import { verifySvix } from "@/server/webhooks/svix";

const STATUS_BY_TYPE: Record<string, "delivered" | "bounced"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
};

/** Delivery status for the send log (docs/02 M9-5), from Resend's signed webhooks. */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  const body = await request.text();
  const valid = verifySvix({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
    now: new Date(),
  });
  if (!valid) return NextResponse.json({ error: "invalidSignature" }, { status: 401 });

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const status = event.type ? STATUS_BY_TYPE[event.type] : undefined;
  const emailId = event.data?.email_id;
  if (status && emailId) {
    await getAdminDb()
      .update(messages)
      .set({ status })
      .where(eq(messages.providerMessageId, emailId));
  }
  return NextResponse.json({ ok: true });
}
