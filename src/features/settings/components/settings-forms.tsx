"use client";

import { LogOutIcon, MailPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createDataRequestAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  saveCompanyAction,
  signOutEverywhereAction,
  updateDataRequestAction,
  updateProfileAction,
} from "../actions";
import type { CompanySettings, DataRequestRow, InvitationRow, MemberRow } from "../queries";

type Target = { orgSlug: string; clientSlug: string };

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeZone: "Asia/Tokyo",
});

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CompanyForm({ target, company }: { target: Target; company: CompanySettings }) {
  const t = useTranslations("Settings");
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    startTransition(async () => {
      const result = await saveCompanyAction(target.orgSlug, target.clientSlug, {
        name: String(form.get("name") ?? ""),
        senderName: String(form.get("senderName") ?? ""),
        replyTo: String(form.get("replyTo") ?? ""),
        retentionDays: Number(form.get("retentionDays")),
      });
      if (result.ok) toast.success(t("saved"));
      else toast.error(t("failed"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("company.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid max-w-xl gap-5">
          <Field id="company-name" label={t("company.name")}>
            <Input
              id="company-name"
              name="name"
              required
              maxLength={100}
              defaultValue={company.name}
            />
          </Field>
          <Field
            id="company-sender"
            label={t("company.senderName")}
            hint={t("company.senderNameHint")}
          >
            <Input
              id="company-sender"
              name="senderName"
              maxLength={50}
              defaultValue={company.senderName ?? ""}
            />
          </Field>
          <Field id="company-reply" label={t("company.replyTo")} hint={t("company.replyToHint")}>
            <Input
              id="company-reply"
              name="replyTo"
              type="email"
              maxLength={254}
              defaultValue={company.replyTo ?? ""}
            />
          </Field>
          <Field
            id="company-retention"
            label={t("company.retention")}
            hint={t("company.retentionHint")}
          >
            <div className="flex items-center gap-2">
              <Input
                id="company-retention"
                name="retentionDays"
                type="number"
                min={30}
                max={730}
                required
                className="w-28"
                defaultValue={company.retentionDays}
              />
              <span className="text-sm">{t("company.days")}</span>
            </div>
          </Field>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MembersPanel({
  target,
  members,
  invitations,
  selfId,
}: {
  target: Target;
  members: MemberRow[];
  invitations: InvitationRow[];
  selfId: string;
}) {
  const t = useTranslations("Settings.members");
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  function invite(form: FormData) {
    setLink(null);
    startTransition(async () => {
      const result = await inviteMemberAction(target.orgSlug, target.clientSlug, {
        email: String(form.get("email") ?? ""),
        role: String(form.get("role") ?? "recruiter") as "recruiter",
      });
      if (!result.ok) {
        toast.error(result.error === "member" ? t("alreadyMember") : t("invalid"));
        return;
      }
      setLink(result.link);
      toast.success(t("sent"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form action={invite} className="flex flex-wrap items-end gap-3">
          <Field id="invite-email" label={t("email")}>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              maxLength={254}
              className="w-72"
            />
          </Field>
          <Field id="invite-role" label={t("role")}>
            <NativeSelect id="invite-role" name="role" defaultValue="recruiter" className="w-40">
              {(["admin", "recruiter", "interviewer", "viewer"] as const).map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={pending}>
            <MailPlusIcon aria-hidden />
            {t("send")}
          </Button>
        </form>
        {link ? (
          <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <p>{t("link")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs break-all">{link}</code>
              <CopyButton value={link} />
            </div>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{t("lastLogin")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell>
                  <p className="font-medium">{m.name ?? m.email}</p>
                  {m.name ? <p className="text-xs text-muted-foreground">{m.email}</p> : null}
                </TableCell>
                <TableCell>
                  {t(`roles.${m.role}`)}
                  {m.userId === selfId ? (
                    <Badge variant="outline" className="ml-2">
                      {t("you")}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.lastLoginAt ? dateFormat.format(new Date(m.lastLoginAt)) : t("never")}
                </TableCell>
                <TableCell className="text-right">
                  {m.role !== "owner" && m.userId !== selfId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await removeMemberAction(
                            target.orgSlug,
                            target.clientSlug,
                            m.userId,
                          );
                          if (result.ok) toast.success(t("removed"));
                        })
                      }
                    >
                      {t("remove")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {invitations.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.email}</TableCell>
                <TableCell>
                  {t(`roles.${i.role}`)}
                  <Badge variant="secondary" className="ml-2">
                    {t("pending")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t("expires", { date: dateFormat.format(new Date(i.expiresAt)) })}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(() =>
                        revokeInvitationAction(target.orgSlug, target.clientSlug, i.id),
                      )
                    }
                  >
                    {t("revoke")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DataRequestsPanel({
  target,
  requests,
}: {
  target: Target;
  requests: DataRequestRow[];
}) {
  const t = useTranslations("Settings.requests");
  const [pending, startTransition] = useTransition();

  function create(form: FormData) {
    startTransition(async () => {
      const result = await createDataRequestAction(target.orgSlug, target.clientSlug, {
        kind: String(form.get("kind")) as "disclosure",
        candidateName: String(form.get("candidateName") ?? ""),
        email: String(form.get("email") ?? ""),
        note: String(form.get("note") ?? ""),
      });
      if (result.ok) toast.success(t("created"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form action={create} className="grid max-w-xl gap-4">
          <div className="flex flex-wrap gap-3">
            <Field id="request-kind" label={t("kind")}>
              <NativeSelect id="request-kind" name="kind" className="w-32">
                {(["disclosure", "correction", "deletion"] as const).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kinds.${kind}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="request-name" label={t("candidateName")}>
              <Input
                id="request-name"
                name="candidateName"
                required
                maxLength={50}
                className="w-56"
              />
            </Field>
          </div>
          <Field id="request-email" label={t("email")}>
            <Input id="request-email" name="email" type="email" maxLength={254} />
          </Field>
          <Field id="request-note" label={t("note")}>
            <Textarea id="request-note" name="note" rows={2} maxLength={500} />
          </Field>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {t("submit")}
          </Button>
        </form>

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <Badge variant="outline">{t(`kinds.${r.kind}`)}</Badge>
                <span className="font-medium">{r.candidateName}</span>
                {r.candidateId ? (
                  <span className="text-xs text-muted-foreground">{t("linked")}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {t("requestedAt")} {dateFormat.format(new Date(r.requestedAt))}
                </span>
                <Badge variant={r.status === "open" ? "secondary" : "outline"} className="ml-auto">
                  {t(`statuses.${r.status}`)}
                </Badge>
                {r.status === "open" ? (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() =>
                          updateDataRequestAction(target.orgSlug, target.clientSlug, r.id, "done"),
                        )
                      }
                    >
                      {t("done")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() =>
                          updateDataRequestAction(
                            target.orgSlug,
                            target.clientSlug,
                            r.id,
                            "rejected",
                          ),
                        )
                      }
                    >
                      {t("reject")}
                    </Button>
                  </span>
                ) : null}
                {r.note ? (
                  <p className="basis-full text-xs whitespace-pre-wrap text-muted-foreground">
                    {r.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfileForm({
  target,
  profile,
}: {
  target: Target;
  profile: { name: string | null; email: string };
}) {
  const t = useTranslations("Settings");
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form
          action={(form) =>
            startTransition(async () => {
              const result = await updateProfileAction(
                target.orgSlug,
                target.clientSlug,
                String(form.get("name") ?? ""),
              );
              if (result.ok) toast.success(t("saved"));
            })
          }
          className="grid max-w-xl gap-4"
        >
          <Field id="profile-name" label={t("profile.name")}>
            <Input id="profile-name" name="name" maxLength={50} defaultValue={profile.name ?? ""} />
          </Field>
          <Field id="profile-email" label={t("profile.email")}>
            <Input id="profile-email" value={profile.email} readOnly disabled />
          </Field>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {t("save")}
          </Button>
        </form>
        <div className="grid gap-2 border-t pt-4">
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              startTransition(() => signOutEverywhereAction(target.orgSlug, target.clientSlug))
            }
          >
            <LogOutIcon aria-hidden />
            {t("profile.signOutAll")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("profile.signOutAllHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
