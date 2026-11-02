"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveConcernsAction } from "../actions";

type Item = { key: string; id?: string; label: string; answer: string };

/** "Concerns" with the company's prepared answers, shown on the booking page (docs/02 M8-3). */
export function ConcernsEditor({
  orgSlug,
  clientSlug,
  concerns,
  canEdit,
}: {
  orgSlug: string;
  clientSlug: string;
  concerns: { id: string; label: string; answer: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations("Scheduling.concerns");
  const [items, setItems] = useState<Item[]>(() => concerns.map((c) => ({ ...c, key: c.id })));
  const [pending, startTransition] = useTransition();
  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function save() {
    startTransition(async () => {
      const result = await saveConcernsAction(
        orgSlug,
        clientSlug,
        items.map(({ id, label, answer }) => ({ id, label, answer })),
      );
      if (result.ok) toast.success(t("saved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="grid gap-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : null}
          {items.map((item, index) => (
            <div key={item.key} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor={`concern-${index}`}>{t("label")}</Label>
                  <Input
                    id={`concern-${index}`}
                    maxLength={60}
                    placeholder={t("labelPlaceholder")}
                    value={item.label}
                    onChange={(e) => update(item.key, { label: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("remove")}
                  onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`concern-answer-${index}`}>{t("answer")}</Label>
                <Textarea
                  id={`concern-answer-${index}`}
                  rows={2}
                  maxLength={1000}
                  value={item.answer}
                  onChange={(e) => update(item.key, { answer: e.target.value })}
                />
              </div>
            </div>
          ))}
          {canEdit ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setItems((list) => [...list, { key: crypto.randomUUID(), label: "", answer: "" }])
                }
              >
                <PlusIcon aria-hidden />
                {t("add")}
              </Button>
              <Button
                disabled={pending || items.some((i) => !i.label.trim() || !i.answer.trim())}
                onClick={save}
              >
                {t("save")}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}
