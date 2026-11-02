"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { uploadToSignedUrl } from "@/lib/upload";
import type { DocumentKind } from "../entry-schema";
import { DocumentPicker, type PickedFile } from "./document-picker";

/** Add or replace documents from the personal page (docs/02 M3-8). */
export function PortalUploads({ token }: { token: string }) {
  const t = useTranslations("Portal");
  const entry = useTranslations("Entry");
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind>("cv");
  const [replace, setReplace] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const picked = files.filter((f) => f.kind === kind);

  async function send() {
    setBusy(true);
    try {
      const response = await fetch(`/api/p/${token}/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: picked.map(({ file }) => ({
            kind,
            name: file.name.slice(0, 200),
            type: file.type,
            size: file.size,
          })),
          replace: replace ? [kind] : [],
        }),
      });
      if (!response.ok) throw new Error(`Uploads refused: ${response.status}`);
      const { uploads } = (await response.json()) as {
        uploads: { index: number; path: string; token: string }[];
      };
      for (const upload of uploads) {
        await uploadToSignedUrl("documents", upload.path, upload.token, picked[upload.index]!.file);
      }
      await fetch(`/api/p/${token}/submit`, { method: "POST" });
      setFiles([]);
      setReplace(false);
      toast.success(t("sent"));
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("kind")}</legend>
        <RadioGroup
          value={kind}
          onValueChange={(value) => {
            setKind(value as DocumentKind);
            setFiles([]);
          }}
          className="flex gap-5"
        >
          {(["resume", "cv"] as const).map((k) => (
            <Label key={k} className="font-normal">
              <RadioGroupItem value={k} />
              {entry(`documents.${k}`)}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <DocumentPicker
        kind={kind}
        label={entry(`documents.${kind}`)}
        required={false}
        files={files}
        onChange={setFiles}
      />
      <Label className="items-start font-normal">
        <Checkbox
          checked={replace}
          onCheckedChange={(checked) => setReplace(checked === true)}
          className="mt-0.5"
        />
        {t("replace")}
      </Label>
      <Button disabled={busy || picked.length === 0} onClick={send} className="justify-self-start">
        {busy ? t("sending") : t("send")}
      </Button>
    </div>
  );
}
