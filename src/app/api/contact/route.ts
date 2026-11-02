import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { CONSULT_CATEGORIES, DOWNLOAD_CATEGORY } from "@/app/(marketing)/_components/site-config";
import { getAdminDb } from "@/server/db/admin";
import { contactInquiries } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { clientIpHash, withinRateLimit } from "@/server/rate-limit";

// Submissions faster than this are scripted.
const MIN_ELAPSED_MS = 3000;
const PHONE = /^\+?\d{10,15}$/;

/**
 * The marketing site's contact form (docs/02 M0). 200 `{ ok: true }`; 400 `{ fields }` with the same
 * messages the form shows; 429 when one address sends too often.
 */
export async function POST(request: Request) {
  if (!(await withinRateLimit(`contact:${await clientIpHash()}`, 5, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const t = await getTranslations("Home.contact.form.errors");
  const text = (max: number, required?: string) => {
    const base = z.string().trim().max(max, t("tooLong", { max }));
    return required ? base.min(1, required) : base;
  };
  const schema = z
    .object({
      mode: z.enum(["download", "consult"]),
      company: text(100, t("companyRequired")),
      name: text(100, t("nameRequired")),
      email: text(254, t("emailRequired")).pipe(z.email(t("emailInvalid"))),
      phone: text(30).refine(
        (v) => !v || PHONE.test(v.normalize("NFKC").replace(/[-\s()]/g, "")),
        t("phoneInvalid"),
      ),
      category: z.string().max(20),
      message: text(3000),
      consent: z.literal(true, t("consentRequired")),
      website: z.string().max(200),
      elapsedMs: z.number().int().min(0),
    })
    .superRefine((v, ctx) => {
      const valid =
        v.mode === "download"
          ? v.category === DOWNLOAD_CATEGORY
          : (CONSULT_CATEGORIES as readonly string[]).includes(v.category);
      if (!valid)
        ctx.addIssue({ code: "custom", path: ["category"], message: t("categoryRequired") });
    });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return NextResponse.json({ fields }, { status: 400 });
  }
  const form = parsed.data;
  // Bots get the same answer as people, and nothing is stored.
  if (form.website || form.elapsedMs < MIN_ELAPSED_MS) return NextResponse.json({ ok: true });

  await getAdminDb()
    .insert(contactInquiries)
    .values({
      mode: form.mode,
      company: form.company,
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      category: form.category,
      message: form.message || null,
      consent: true,
    });

  const notify = process.env.CONTACT_NOTIFY_EMAIL;
  if (notify) {
    try {
      await sendEmail({
        to: notify,
        subject: `【mask0】${form.mode === "download" ? "資料請求" : "お問い合わせ"}：${form.company}`,
        text: [
          `種類：${form.mode === "download" ? "資料請求" : `ご相談（${form.category}）`}`,
          `会社名：${form.company}`,
          `お名前：${form.name}`,
          `メール：${form.email}`,
          `電話：${form.phone || "—"}`,
          "",
          form.message || "（本文なし）",
        ].join("\n"),
      });
    } catch (error) {
      // The inquiry is stored; staff can still see it.
      console.error(
        "[contact] notification failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return NextResponse.json({ ok: true });
}
