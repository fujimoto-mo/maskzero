"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type FieldDef, payUnit } from "../fields";
import { type PostingFields, TEXT_LIMITS } from "../schema";

// Radix Select can't hold an empty value, so optional selects get an explicit "none" item.
const NONE = "__none__";

type Props = {
  field: FieldDef;
  fields: PostingFields;
  onChange: (patch: Partial<PostingFields>) => void;
};

/** One posting field: label, badges, the input for its type, hint and board length counter. */
export function FieldRow({ field, fields, onChange }: Props) {
  const t = useTranslations("Jobs");
  const id = `field-${field.key}`;
  const grouped = field.type === "checks" || field.type === "pay";
  const board = field.boards?.length === 1 ? field.boards[0] : undefined;
  const length = field.maxLength
    ? String(fields[field.key as keyof PostingFields] ?? "").length
    : 0;

  return (
    <div
      className="grid gap-2"
      role={grouped ? "group" : undefined}
      aria-labelledby={grouped ? `${id}-label` : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        {grouped ? (
          <span id={`${id}-label`} className="text-sm font-medium">
            {field.label}
          </span>
        ) : (
          <Label htmlFor={id}>{field.label}</Label>
        )}
        {field.required ? <Badge variant="secondary">{t("required")}</Badge> : null}
        {board ? (
          <Badge variant="outline">{t("boardOnly", { board: t(`tabs.${board}`) })}</Badge>
        ) : null}
      </div>
      <FieldControl id={id} field={field} fields={fields} onChange={onChange} />
      {field.hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {field.hint}
        </p>
      ) : null}
      {field.maxLength ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            length > field.maxLength.chars && "text-amber-700 dark:text-amber-500",
          )}
        >
          {t("lengthHint", {
            board: t(`tabs.${field.maxLength.board}`),
            max: field.maxLength.chars,
            count: length,
          })}
        </p>
      ) : null}
    </div>
  );
}

function FieldControl({ id, field, fields, onChange }: Props & { id: string }) {
  const t = useTranslations("Jobs");
  const describedBy = field.hint ? `${id}-hint` : undefined;

  switch (field.type) {
    case "text":
    case "textarea": {
      const key = field.key as keyof typeof TEXT_LIMITS;
      const props = {
        id,
        value: (fields[key] as string | undefined) ?? "",
        maxLength: TEXT_LIMITS[key],
        placeholder: field.placeholder,
        "aria-describedby": describedBy,
        onChange: (event: { target: { value: string } }) => onChange({ [key]: event.target.value }),
      };
      return field.type === "text" ? (
        <Input {...props} className={cn(field.narrow && "sm:max-w-56")} />
      ) : (
        <Textarea {...props} rows={field.rows ?? 3} />
      );
    }
    case "select": {
      const key = field.key as keyof typeof TEXT_LIMITS;
      const value = (fields[key] as string | undefined) || undefined;
      return (
        <Select
          value={value ?? ""}
          onValueChange={(next) => onChange({ [key]: next === NONE ? "" : next })}
        >
          <SelectTrigger id={id} className="w-full sm:w-80" aria-describedby={describedBy}>
            <SelectValue placeholder={t("select")} />
          </SelectTrigger>
          <SelectContent>
            {!field.required ? <SelectItem value={NONE}>{t("none")}</SelectItem> : null}
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "checks": {
      const selected = fields.insurance ?? [];
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {field.options.map((option) => (
            <Label key={option} className="font-normal">
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={(checked) =>
                  onChange({
                    insurance: checked
                      ? field.options.filter((o) => o === option || selected.includes(o))
                      : selected.filter((o) => o !== option),
                  })
                }
              />
              {option}
            </Label>
          ))}
        </div>
      );
    }
    case "pay": {
      const unit = payUnit(fields.payType);
      const amount = (raw: string) => (raw === "" ? null : Math.max(0, Math.round(Number(raw))));
      return (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t("pay.min")}
              className="w-32"
              value={fields.payMin ?? ""}
              onChange={(event) => onChange({ payMin: amount(event.target.value) })}
            />
            <span className="text-sm">{unit}</span>
            <span aria-hidden>〜</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t("pay.max")}
              className="w-32"
              value={fields.payMax ?? ""}
              onChange={(event) => onChange({ payMax: amount(event.target.value) })}
            />
            <span className="text-sm">{unit}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("pay.unitHint")}</p>
        </div>
      );
    }
  }
}
