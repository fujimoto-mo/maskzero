"use client";

import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/form-alert";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCandidateAction } from "../actions";

/** Registers an applicant who applied by phone, mail or on a board (docs/02 M3-9). */
export function AddCandidateDialog({
  orgSlug,
  clientSlug,
  jobs,
}: {
  orgSlug: string;
  clientSlug: string;
  jobs: { id: string; title: string }[];
}) {
  const t = useTranslations("Candidates.add");
  const untitled = useTranslations("Jobs")("untitled");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addCandidateAction(orgSlug, clientSlug, {
        jobId: String(form.get("jobId") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        channel: String(form.get("channel") ?? ""),
      });
      if (!result.ok) {
        setError(t(result.error));
        return;
      }
      toast.success(t("done"));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={jobs.length === 0}>
          <UserPlusIcon aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          <FormAlert error={error ?? undefined} />
          <div className="grid gap-2">
            <Label htmlFor="add-job">{t("job")}</Label>
            <NativeSelect id="add-job" name="jobId" required defaultValue={jobs[0]?.id}>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title || untitled}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-name">{t("name")}</Label>
            <Input id="add-name" name="name" required maxLength={50} autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-email">{t("email")}</Label>
              <Input id="add-email" name="email" type="email" maxLength={254} autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-phone">{t("phone")}</Label>
              <Input id="add-phone" name="phone" type="tel" maxLength={30} autoComplete="off" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-channel">{t("channel")}</Label>
            <Input
              id="add-channel"
              name="channel"
              maxLength={30}
              placeholder={t("channelPlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
