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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeTotpAction } from "@/features/auth/mfa";
import type { ClientOption } from "@/features/clients/queries";
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
  updateMemberAction,
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
        recordsInterviews: form.get("recordsInterviews") === "on",
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
          <div className="flex items-start gap-3">
            <input
              id="company-records"
              name="recordsInterviews"
              type="checkbox"
              defaultChecked={company.recordsInterviews}
              aria-describedby="company-records-hint"
              className="mt-1 size-4 accent-primary"
            />
            <div className="grid gap-1">
              <Label htmlFor="company-records">{t("company.recordsInterviews")}</Label>
              <p id="company-records-hint" className="text-xs text-muted-foreground">
                {t("company.recordsInterviewsHint")}
              </p>
            </div>
          </div>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const ASSIGNABLE_ROLES = ["admin", "recruiter", "interviewer", "viewer"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Checkboxes for the clients a member works on; none ticked means every client. */
function ScopePicker({
  idPrefix,
  clients,
  value,
  onChange,
}: {
  idPrefix: string;
  clients: ClientOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("Settings.members");
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t("scope")}</legend>
      <p className="text-xs text-muted-foreground">{t("scopeHint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {clients.map((c) => (
          <Label key={c.id} htmlFor={`${idPrefix}-${c.id}`} className="font-normal">
            <Checkbox
              id={`${idPrefix}-${c.id}`}
              checked={value.includes(c.id)}
              onCheckedChange={(on) =>
                onChange(on ? [...value, c.id] : value.filter((id) => id !== c.id))
              }
            />
            {c.name}
          </Label>
        ))}
      </div>
    </fieldset>
  );
}

function scopeLabel(ids: string[] | null, clients: ClientOption[], all: string) {
  if (ids === null) return all;
  return clients
    .filter((c) => ids.includes(c.id))
    .map((c) => c.name)
    .join("、");
}

export function MembersPanel({
  target,
  members,
  invitations,
  selfId,
  clients,
}: {
  target: Target;
  members: MemberRow[];
  invitations: InvitationRow[];
  selfId: string;
  /** The agency's clients; empty for in-house companies, which have no client scope. */
  clients: ClientOption[];
}) {
  const t = useTranslations("Settings.members");
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [inviteScope, setInviteScope] = useState<string[]>([]);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const scoped = clients.length > 1;

  function invite(form: FormData) {
    setLink(null);
    startTransition(async () => {
      const result = await inviteMemberAction(target.orgSlug, target.clientSlug, {
        email: String(form.get("email") ?? ""),
        role: String(form.get("role") ?? "recruiter") as AssignableRole,
        clientIds: inviteScope.length > 0 ? inviteScope : null,
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
          {scoped ? (
            <div className="basis-full">
              <ScopePicker
                idPrefix="invite-scope"
                clients={clients}
                value={inviteScope}
                onChange={setInviteScope}
              />
            </div>
          ) : null}
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
              {scoped ? <TableHead>{t("scope")}</TableHead> : null}
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
                {scoped ? (
                  <TableCell className="text-sm">
                    {scopeLabel(m.clientIds, clients, t("allClients"))}
                  </TableCell>
                ) : null}
                <TableCell className="text-sm text-muted-foreground">
                  {m.lastLoginAt ? dateFormat.format(new Date(m.lastLoginAt)) : t("never")}
                </TableCell>
                <TableCell className="text-right">
                  {m.role !== "owner" && m.userId !== selfId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditing(m)}
                      aria-label={t("editOf", { name: m.name ?? m.email })}
                    >
                      {t("edit")}
                    </Button>
                  ) : null}
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
                {scoped ? (
                  <TableCell className="text-sm">
                    {scopeLabel(i.clientIds, clients, t("allClients"))}
                  </TableCell>
                ) : null}
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
      {editing ? (
        <MemberDialog
          key={editing.userId}
          target={target}
          member={editing}
          clients={scoped ? clients : []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function MemberDialog({
  target,
  member,
  clients,
  onClose,
}: {
  target: Target;
  member: MemberRow;
  clients: ClientOption[];
  onClose: () => void;
}) {
  const t = useTranslations("Settings.members");
  const [role, setRole] = useState<AssignableRole>(member.role === "owner" ? "admin" : member.role);
  const [scope, setScope] = useState<string[]>(member.clientIds ?? []);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateMemberAction(target.orgSlug, target.clientSlug, member.userId, {
        role,
        clientIds: scope.length > 0 ? scope : null,
      });
      if (result.ok) {
        toast.success(t("saved"));
        onClose();
      } else toast.error(t("saveFailed"));
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editOf", { name: member.name ?? member.email })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field id="member-role" label={t("role")}>
            <NativeSelect
              id="member-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
              className="w-48"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="text-xs text-muted-foreground">{t(`roleHints.${role}`)}</p>
          {clients.length > 0 ? (
            <ScopePicker
              idPrefix="member-scope"
              clients={clients}
              value={scope}
              onChange={setScope}
            />
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={save}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  mfa,
}: {
  target: Target;
  profile: { name: string | null; email: string };
  mfa: { required: boolean; factors: { id: string; createdAt: string }[] };
}) {
  const t = useTranslations("Settings");
  const [pending, startTransition] = useTransition();
  const here = `/app/${target.orgSlug}/${target.clientSlug}/settings?tab=profile`;
  const addHref = `/mfa?setup=1&next=${encodeURIComponent(here)}`;

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
        <section aria-labelledby="mfa-title" className="grid gap-2 border-t pt-4">
          <h3 id="mfa-title" className="text-sm font-medium">
            {t("profile.mfaTitle")}
          </h3>
          <p className="text-sm">
            {mfa.factors.length > 0
              ? t("profile.mfaOn", { count: mfa.factors.length })
              : t("profile.mfaOff")}
          </p>
          <p className="text-xs text-muted-foreground">
            {mfa.required ? t("profile.mfaRequired") : t("profile.mfaOptional")}
          </p>
          {mfa.factors.length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {mfa.factors.map((f) => {
                const date = dateFormat.format(new Date(f.createdAt));
                return (
                  <li key={f.id} className="flex items-center gap-2">
                    {t("profile.mfaAdded", { date })}
                    {/* Admins keep at least one app: removing the last would lock them out. */}
                    {mfa.required && mfa.factors.length === 1 ? null : (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={pending}
                        aria-label={t("profile.mfaRemoveOf", { date })}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await removeTotpAction(f.id, here);
                            if (!result.ok) toast.error(t("profile.mfaRemoveFailed"));
                          })
                        }
                      >
                        {t("profile.mfaRemove")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Button asChild variant="outline" className="justify-self-start">
            <a href={addHref}>
              {mfa.factors.length > 0 ? t("profile.mfaAdd") : t("profile.mfaSetUp")}
            </a>
          </Button>
        </section>
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
