import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConcernsEditor } from "@/features/scheduling/components/concerns-editor";
import { MonthCalendar } from "@/features/scheduling/components/month-calendar";
import { RulesForm } from "@/features/scheduling/components/rules-form";
import { getSchedulingSetup } from "@/features/scheduling/queries";
import { jstDateKey } from "@/features/scheduling/slots";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "日程調整" };

export default async function SchedulingPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/scheduling">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const now = new Date();
  const month =
    typeof query.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
      ? query.month
      : jstDateKey(now).slice(0, 7);
  const [t, setup] = await Promise.all([
    getTranslations("Scheduling"),
    getSchedulingSetup(ctx, month, now),
  ]);
  const target = { orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug };
  const editor = canEdit(ctx);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <MonthCalendar {...target} month={setup.month} days={setup.days} canEdit={editor} />
      <RulesForm
        key={setup.rules.updatedAt.toISOString()}
        {...target}
        rules={setup.rules}
        canEdit={editor}
        can={setup.can}
        googleCalendarId={setup.googleCalendarId}
      />
      <ConcernsEditor {...target} concerns={setup.concerns} canEdit={editor} />
    </div>
  );
}
