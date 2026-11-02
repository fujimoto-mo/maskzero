import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export type JobStatus = "draft" | "published" | "stopped" | "archived";

const VARIANTS = {
  draft: "outline",
  published: "default",
  stopped: "secondary",
  archived: "ghost",
} as const;

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const t = useTranslations("Jobs.status");
  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
