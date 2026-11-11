import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CandidateHeader, candidateHeading } from "@/components/candidate-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  bookingOptions,
  loadCandidateSchedule,
  markInvitationOpened,
} from "@/features/interviews/candidate-server";
import { BookingForm } from "@/features/interviews/components/booking-form";
import { loadPortal } from "@/features/intake/entry-server";
import { formatSlot, slotDays } from "@/features/scheduling/slots";

export const instant = false; // per-request: the token is the only key to this page

export const metadata: Metadata = { title: "面接日程の予約", referrer: "no-referrer" };

export default async function BookingPage({ params }: PageProps<"/p/[token]/book">) {
  const { token } = await params;
  await connection();
  const portal = await loadPortal(token);
  if (!portal) notFound();
  const now = new Date();
  const [t, schedule] = await Promise.all([
    getTranslations("Booking"),
    loadCandidateSchedule(portal.scope, now),
  ]);
  const back = (
    <Button asChild variant="outline" className="justify-self-start">
      <Link href={`/p/${token}`}>{t("portal")}</Link>
    </Button>
  );

  if (schedule.interview) {
    return (
      <div className="grid gap-4">
        <CandidateHeader company={portal.view.company} label={portal.view.jobTitle} />
        <Card>
          <CardHeader>
            <CardTitle>{t("alreadyBooked")}</CardTitle>
            <CardDescription>
              {formatSlot({
                startsAt: new Date(schedule.interview.startsAt),
                endsAt: new Date(schedule.interview.endsAt),
              })}
            </CardDescription>
          </CardHeader>
        </Card>
        {back}
      </div>
    );
  }
  const invitation = schedule.invitation;
  if (
    schedule.outcome !== "active" ||
    !invitation ||
    !["sent", "opened"].includes(invitation.status)
  ) {
    return (
      <div className="grid gap-4">
        <CandidateHeader company={portal.view.company} label={portal.view.jobTitle} />
        <Card>
          <CardHeader>
            <CardTitle>{t("closed")}</CardTitle>
          </CardHeader>
        </Card>
        {back}
      </div>
    );
  }

  await markInvitationOpened(portal.scope, invitation.id);
  const options = await bookingOptions(portal.scope, invitation.round, now);

  return (
    <div className="grid gap-5">
      <CandidateHeader company={portal.view.company} label={portal.view.jobTitle} />
      <div className="grid gap-2">
        <h1 className={candidateHeading("text-xl")}>{t("title")}</h1>
        <p className="text-sm">
          {t("lead", {
            company: portal.view.company,
            job: portal.view.jobTitle,
            round: invitation.round,
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("minutes", { minutes: options.minutes })}
        </p>
        <p className="text-sm text-muted-foreground">
          {options.tool === "onsite" ? t("toolOnsite") : t("toolUrl")}
        </p>
      </div>
      <BookingForm
        token={token}
        days={slotDays(options.slots)}
        concerns={options.concerns}
        pendingNote={schedule.request === "pending"}
      />
    </div>
  );
}
