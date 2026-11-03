import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { sandboxOf } from "../server";

const time = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Says this is a /demo sandbox, when it goes, and where the candidate's side is. */
export async function DemoBanner({ userId }: { userId: string }) {
  const t = await getTranslations("App.demo");
  const sandbox = await sandboxOf(userId, new Date());
  if (!sandbox) return null;
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-accent px-4 py-2 text-sm md:px-6"
    >
      <span className="font-medium">{t("label", { time: time.format(sandbox.expiresAt) })}</span>
      <span className="text-muted-foreground">{t("noEmail")}</span>
      <span className="flex gap-4 sm:ml-auto">
        {sandbox.entryCode ? (
          <Link
            href={`/a/${sandbox.entryCode}`}
            target="_blank"
            className="font-medium text-primary hover:underline"
          >
            {t("candidateView")}
          </Link>
        ) : null}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          {t("signUp")}
        </Link>
      </span>
    </div>
  );
}
