"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEntryUrlAction } from "../actions";
import { CHANNEL_GROUPS, CUSTOM_CHANNEL_MAX } from "../channels";

const CUSTOM = "__custom__";

/** Issues an entry URL for one job × board (docs/02 M3-1). */
export function EntryUrlForm({
  orgSlug,
  clientSlug,
  jobs,
}: {
  orgSlug: string;
  clientSlug: string;
  jobs: { id: string; title: string }[];
}) {
  const t = useTranslations("Intake.create");
  const untitled = useTranslations("Jobs")("untitled");
  const [jobId, setJobId] = useState("");
  const [channel, setChannel] = useState("");
  const [customName, setCustomName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = channel === CUSTOM ? customName : channel;
    startTransition(async () => {
      const result = await createEntryUrlAction(orgSlug, clientSlug, { jobId, channel: name });
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      toast.success(t("created"));
      setChannel("");
      setCustomName("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noJobs")}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-4">
            <div className="grid min-w-56 flex-1 gap-2">
              <Label htmlFor="entry-job">{t("job")}</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger id="entry-job" className="w-full">
                  <SelectValue placeholder={t("selectJob")} />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title || untitled}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-48 gap-2">
              <Label htmlFor="entry-channel">{t("channel")}</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="entry-channel" className="w-full sm:w-56">
                  <SelectValue placeholder={t("selectChannel")} />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.channels.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectGroup>
                    <SelectItem value={CUSTOM}>{t("custom")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {channel === CUSTOM ? (
              <div className="grid min-w-48 gap-2">
                <Label htmlFor="entry-custom">{t("customName")}</Label>
                <Input
                  id="entry-custom"
                  value={customName}
                  maxLength={CUSTOM_CHANNEL_MAX}
                  placeholder={t("customPlaceholder")}
                  onChange={(event) => setCustomName(event.target.value)}
                  required
                />
              </div>
            ) : null}
            <Button type="submit" disabled={pending || !jobId || !channel}>
              {t("submit")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
