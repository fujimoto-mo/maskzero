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
import { cn } from "@/lib/utils";
import { isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "設定" };

const ADMIN_TABS = ["company", "members", "requests", "audit", "usage"] as const;
type Tab = (typeof ADMIN_TABS)[number] | "profile";

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
  const tabs: Tab[] = admin ? [...ADMIN_TABS, "profile"] : ["profile"];
  const tab = tabs.find((t) => t === query.tab) ?? tabs[0]!;
  const t = await getTranslations("Settings");
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`;
  const target = { orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug };

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
        <MembersPanel target={target} selfId={ctx.userId} {...await listMembers(ctx)} />
      ) : null}
      {tab === "requests" ? (
        <DataRequestsPanel target={target} requests={await listDataRequests(ctx)} />
      ) : null}
      {tab === "audit" ? <AuditLog rows={await listAuditLogs(ctx)} /> : null}
      {tab === "usage" ? <Usage rows={await getAiUsage(ctx)} /> : null}
      {tab === "profile" ? <ProfileForm target={target} profile={await getProfile(ctx)} /> : null}
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
