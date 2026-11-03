import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CompanyForm,
  DataRequestsPanel,
  MembersPanel,
  ProfileForm,
} from "@/features/settings/components/settings-forms";
import {
  getAiUsage,
  getCompanySettings,
  getProfile,
  listAuditLogs,
  listDataRequests,
  listMembers,
} from "@/features/settings/queries";
import { EmailSettings } from "@/features/messaging/components/email-settings";
import { AI_FEATURE } from "@/features/ai-interview/domain";
import { listClientOptions } from "@/features/clients/queries";
import { getMfaState } from "@/server/auth/mfa";
import { PlanUsage } from "@/features/billing/components/plan-usage";
import { loadPlan, loadUsage } from "@/features/billing/limits";
import { withRls } from "@/server/db/rls";
import { InboundSettings } from "@/features/inbound/components/inbound-settings";
import { getInboundSettings } from "@/features/inbound/queries";
import { NotificationPrefs } from "@/features/notifications/components/notification-prefs";
import { getNotificationPrefs } from "@/features/notifications/queries";
import { getMessageSettings, listMessages } from "@/features/messaging/queries";
import { cn } from "@/lib/utils";
import { isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "設定" };

const ADMIN_TABS = [
  "company",
  "members",
  "email",
  "inbound",
  "requests",
  "audit",
  "usage",
  "plan",
] as const;
type Tab = (typeof ADMIN_TABS)[number] | "log" | "notifications" | "profile";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});
const number = new Intl.NumberFormat("ja-JP");

export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/settings">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const admin = isAdmin(ctx);
  const tabs: Tab[] = admin
    ? [...ADMIN_TABS, "log", "notifications", "profile"]
    : ["log", "notifications", "profile"];
  const tab = tabs.find((t) => t === query.tab) ?? tabs[0]!;
  const t = await getTranslations("Settings");
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`;
  const target = { orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug };
  const emailScope = query.scope === "client" && ctx.orgKind === "agency" ? "client" : "org";

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <nav aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((item) => (
          <Link
            key={item}
            href={`${base}?tab=${item}`}
            aria-current={item === tab ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              item === tab && "bg-muted font-medium",
            )}
          >
            {t(`tabs.${item}`)}
          </Link>
        ))}
      </nav>

      {tab === "company" ? (
        <CompanyForm target={target} company={await getCompanySettings(ctx)} />
      ) : null}
      {tab === "members" ? (
        <MembersPanel
          target={target}
          selfId={ctx.userId}
          clients={ctx.orgKind === "agency" ? await listClientOptions(ctx) : []}
          {...await listMembers(ctx)}
        />
      ) : null}
      {tab === "inbound" ? (
        <InboundSettings target={target} {...await getInboundSettings(ctx)} />
      ) : null}
      {tab === "requests" ? (
        <DataRequestsPanel target={target} requests={await listDataRequests(ctx)} />
      ) : null}
      {tab === "audit" ? <AuditLog rows={await listAuditLogs(ctx)} /> : null}
      {tab === "usage" ? <Usage rows={await getAiUsage(ctx)} /> : null}
      {tab === "plan" ? (
        <PlanUsage
          agency={ctx.orgKind === "agency"}
          {...await withRls(ctx, async (tx) => ({
            plan: await loadPlan(tx, ctx.orgId),
            usage: await loadUsage(tx, ctx.orgId, new Date()),
          }))}
        />
      ) : null}
      {tab === "email" ? (
        <EmailSettings
          target={target}
          scope={emailScope}
          agency={ctx.orgKind === "agency" ? { clientName: ctx.clientName } : null}
          aiInterview={ctx.featureFlags.includes(AI_FEATURE)}
          {...await getMessageSettings(ctx, emailScope)}
        />
      ) : null}
      {tab === "log" ? <MessageLog rows={await listMessages(ctx)} /> : null}
      {tab === "notifications" ? (
        <NotificationPrefs target={target} initial={await getNotificationPrefs(ctx)} />
      ) : null}
      {tab === "profile" ? (
        <ProfileForm
          target={target}
          profile={await getProfile(ctx)}
          mfa={{ required: admin, factors: (await getMfaState()).factors }}
        />
      ) : null}
    </div>
  );
}

async function AuditLog({ rows }: { rows: Awaited<ReturnType<typeof listAuditLogs>> }) {
  const t = await getTranslations("Settings.audit");
  const label = (action: string) => {
    const key = action.replace(/\./g, "_");
    return t.has(`actions.${key}` as "actions.document_opened")
      ? t(`actions.${key}` as "actions.document_opened")
      : action;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("when")}</TableHead>
                <TableHead>{t("who")}</TableHead>
                <TableHead>{t("what")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {timeFormat.format(new Date(row.at))}
                  </TableCell>
                  <TableCell className="text-sm">{row.user ?? t("system")}</TableCell>
                  <TableCell className="text-sm">{label(row.action)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

async function Usage({ rows }: { rows: Awaited<ReturnType<typeof getAiUsage>> }) {
  const t = await getTranslations("Settings.usage");
  const feature = (key: string) =>
    t.has(`features.${key}` as "features.read") ? t(`features.${key}` as "features.read") : key;
  const total = rows.reduce(
    (sum, r) => ({
      calls: sum.calls + r.calls,
      inputTokens: sum.inputTokens + r.inputTokens,
      outputTokens: sum.outputTokens + r.outputTokens,
      costUsd: sum.costUsd + r.costUsd,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("feature")}</TableHead>
                <TableHead className="text-right">{t("calls")}</TableHead>
                <TableHead className="text-right">{t("input")}</TableHead>
                <TableHead className="text-right">{t("output")}</TableHead>
                <TableHead className="text-right">{t("cost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.feature}>
                  <TableCell>{feature(r.feature)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(r.calls)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(r.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(r.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">${r.costUsd.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t("total")}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {number.format(total.calls)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {number.format(total.inputTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {number.format(total.outputTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${total.costUsd.toFixed(2)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

async function MessageLog({ rows }: { rows: Awaited<ReturnType<typeof listMessages>> }) {
  const t = await getTranslations("Settings.log");
  const triggers = await getTranslations("Settings.email.triggers");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("when")}</TableHead>
                <TableHead>{t("to")}</TableHead>
                <TableHead>{t("what")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {timeFormat.format(new Date(row.at))}
                  </TableCell>
                  <TableCell className="text-sm">{row.candidateName}</TableCell>
                  <TableCell className="text-sm">
                    <p>{row.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.trigger === "custom" ? (row.customName ?? "") : triggers(row.trigger)}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t(`statuses.${row.status}`)}
                    {row.error ? <p className="text-xs text-destructive">{row.error}</p> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
