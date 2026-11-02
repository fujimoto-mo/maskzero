"use client";

import { ImagePlusIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shrinkImage } from "@/lib/image-resize";
import { uploadToSignedUrl } from "@/lib/upload";
import {
  createJobImageUploadAction,
  registerJobImageAction,
  removeJobImageAction,
  updateJobImageCaptionAction,
} from "../actions";
import type { JobImage } from "../queries";

const SLOTS = [1, 2, 3, 4, 5, 6];
const MAX_BYTES = 4 * 1024 * 1024; // the job-images bucket limit

type Target = { orgSlug: string; clientSlug: string; jobId: string };

/** Six image slots; slot 1 is the main image every board shows first (docs/02 M2-4). */
export function JobImages({
  target,
  images,
  canEdit,
}: {
  target: Target;
  images: JobImage[];
  canEdit: boolean;
}) {
  const t = useTranslations("Jobs.images");
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {SLOTS.map((slot) => (
          <li key={slot}>
            <ImageSlot
              target={target}
              slot={slot}
              image={images.find((i) => i.slot === slot)}
              canEdit={canEdit}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImageSlot({
  target: { orgSlug, clientSlug, jobId },
  slot,
  image,
  canEdit,
}: {
  target: Target;
  slot: number;
  image: JobImage | undefined;
  canEdit: boolean;
}) {
  const t = useTranslations("Jobs.images");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const name = slot === 1 ? t("main") : t("slot", { slot });

  async function upload(file: File) {
    setBusy(true);
    try {
      const prepared = await shrinkImage(file, { maxBytes: MAX_BYTES });
      if (prepared.size > MAX_BYTES) {
        toast.error(t("tooLarge"));
        return;
      }
      const ticket = await createJobImageUploadAction(
        orgSlug,
        clientSlug,
        jobId,
        slot,
        prepared.type,
      );
      if (!ticket.ok) throw new Error("No upload URL");
      await uploadToSignedUrl("job-images", ticket.path, ticket.token, prepared);
      const result = await registerJobImageAction(orgSlug, clientSlug, jobId, slot, ticket.path);
      if (!result.ok) throw new Error(result.error);
      toast.success(t("uploaded"));
    } catch (error) {
      console.error(error);
      toast.error(t("uploadFailed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeJobImageAction(orgSlug, clientSlug, jobId, slot);
      toast.success(t("removed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <figure className="grid gap-2">
      <div className="relative aspect-4/3 overflow-hidden rounded-lg border bg-muted">
        {image ? (
          // Storage URLs differ per environment and images are already sized on upload, so the
          // optimizing next/image would add config without benefit here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={image.caption ?? name} className="size-full object-cover" />
        ) : (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed"
          >
            <ImagePlusIcon className="size-6" aria-hidden />
            {canEdit ? t("add") : null}
          </button>
        )}
        <Badge variant={slot === 1 ? "default" : "secondary"} className="absolute top-2 left-2">
          {name}
        </Badge>
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            {t("uploading")}
          </div>
        ) : null}
      </div>
      {image ? (
        <figcaption className="grid gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {image.width}×{image.height}
            </span>
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {t("open")}
            </a>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`caption-${slot}`} className="text-xs">
              {t("caption")}
            </Label>
            <Input
              key={image.url}
              id={`caption-${slot}`}
              defaultValue={image.caption ?? ""}
              maxLength={70}
              placeholder={t("captionPlaceholder")}
              disabled={!canEdit}
              onBlur={(event) => {
                const caption = event.target.value.trim();
                if (caption !== (image.caption ?? "")) {
                  void updateJobImageCaptionAction(orgSlug, clientSlug, jobId, slot, caption);
                }
              }}
            />
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {t("replace")}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
                {t("remove")}
              </Button>
            </div>
          ) : null}
        </figcaption>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        aria-label={`${name}: ${t("add")}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </figure>
  );
}
