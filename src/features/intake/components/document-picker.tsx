"use client";

import { FileTextIcon, ImageIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/lib/image-resize";
import { type DocumentKind, MAX_DOCUMENT_BYTES, MAX_FILES_PER_KIND } from "../entry-schema";

export type PickedFile = { id: string; kind: DocumentKind; file: File };

type PickError = "tooManyFiles" | "tooLarge" | "unsupportedType" | "unreadableImage";

/**
 * Turns chosen files into uploadable documents: PDFs as they are (10 MB at most), photos resized
 * in the browser to a JPEG with the long side at most 2,576 px (docs/02 M3-4).
 */
async function prepare(file: File): Promise<File | PickError> {
  if (file.type === "application/pdf") return file.size > MAX_DOCUMENT_BYTES ? "tooLarge" : file;
  const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
  if (!isImage) return "unsupportedType";
  try {
    const image = await shrinkImage(file, { maxBytes: MAX_DOCUMENT_BYTES });
    return image.size > MAX_DOCUMENT_BYTES ? "tooLarge" : image;
  } catch {
    return "unreadableImage";
  }
}

/** One document kind (résumé or CV): add files or photos page by page, remove them again. */
export function DocumentPicker({
  kind,
  label,
  required,
  files,
  onChange,
  invalid,
}: {
  kind: DocumentKind;
  label: string;
  required: boolean;
  files: PickedFile[];
  onChange: (next: PickedFile[]) => void;
  invalid?: string;
}) {
  const t = useTranslations("Entry");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PickError | null>(null);
  const mine = files.filter((f) => f.kind === kind);

  async function add(list: FileList) {
    setBusy(true);
    setError(null);
    const added: PickedFile[] = [];
    for (const file of Array.from(list)) {
      if (mine.length + added.length >= MAX_FILES_PER_KIND) {
        setError("tooManyFiles");
        break;
      }
      const prepared = await prepare(file);
      if (typeof prepared === "string") setError(prepared);
      else added.push({ id: crypto.randomUUID(), kind, file: prepared });
    }
    onChange([...files, ...added]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const message = error
    ? t(`errors.${error}`)
    : invalid
      ? t(`errors.${invalid}` as "errors.resumeRequired")
      : null;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4" aria-labelledby={`doc-${kind}`}>
      <div className="flex items-center gap-2">
        <h3 id={`doc-${kind}`} className="font-medium">
          {label}
        </h3>
        <Badge variant={required ? "secondary" : "outline"}>
          {required ? t("documents.required") : t("documents.optional")}
        </Badge>
      </div>
      {mine.length > 0 ? (
        <ul className="grid gap-2">
          {mine.map((picked, index) => (
            <li key={picked.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
              <Thumb file={picked.file} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate">{picked.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {index + 1} · {(picked.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${picked.file.name}: ${t("documents.remove")}`}
                onClick={() => onChange(files.filter((f) => f.id !== picked.id))}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {mine.length < MAX_FILES_PER_KIND ? (
        <Button
          type="button"
          variant={mine.length === 0 ? "default" : "outline"}
          disabled={busy}
          onClick={() => input.current?.click()}
          className="justify-self-start"
        >
          <PlusIcon aria-hidden />
          {busy
            ? t("documents.preparing")
            : mine.length === 0
              ? t("documents.add")
              : t("documents.addMore")}
        </Button>
      ) : null}
      <p className="text-sm text-destructive" aria-live="polite">
        {message}
      </p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        aria-label={`${label}: ${t("documents.add")}`}
        onChange={(event) => {
          if (event.target.files?.length) void add(event.target.files);
        }}
      />
    </section>
  );
}

function Thumb({ file }: { file: File }) {
  const [url] = useState(() => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null));
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!url) {
    return (
      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-background">
        <FileTextIcon className="size-5 text-muted-foreground" aria-hidden />
      </span>
    );
  }
  return (
    <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-background">
      {/* A local preview of the photo the candidate just took; nothing to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="size-full object-cover" />
      <ImageIcon
        className="absolute right-0.5 bottom-0.5 size-3 text-white drop-shadow"
        aria-hidden
      />
    </span>
  );
}
