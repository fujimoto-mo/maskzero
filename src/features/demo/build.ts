import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, gte } from "drizzle-orm";
import { privacyTextVersion } from "@/features/intake/consent";
import { insertJob, japanToday } from "@/features/jobs/mutations";
import { issueInvitation } from "@/features/interviews/server";
import { bookFirstFree, ensureCalendar } from "@/features/scheduling/server";
import { type Criterion, decide, type Verdict } from "@/features/screening/domain";
import { stateForVerdict } from "@/features/screening/state";
import { maskForScreening } from "@/features/screening/text";
import { READ_PROMPT_VERSION } from "@/server/ai/read-document";
import { SCREEN_PROMPT_VERSION } from "@/server/ai/screen";
import { encryptPii, protectContact } from "@/server/crypto/pii";
import { newEntryCode, newToken, sha256 } from "@/server/crypto/tokens";
import type { Tx } from "@/server/db/client";
import {
  applicationAnswers,
  applications,
  availabilityRules,
  candidates,
  clients,
  consents,
  documents,
  entryUrls,
  events,
  interviewInvitations,
  jobs,
  memberships,
  organizations,
  profiles,
  screeningCriteria,
  screeningDecisions,
  screeningRuns,
} from "@/server/db/schema";
import { readPdf } from "@/server/screening/judge";
import {
  APPLIED_HOURS_AGO,
  DEMO_CLIENTS,
  DEMO_HISTORY,
  DEMO_HOURS,
  DEMO_JOBS,
  DEMO_ORG_NAME,
  DEMO_PEOPLE,
} from "./template";

// Fills a new /demo sandbox inside one admin transaction (docs/02 M0-4). Applicants go through the
// same steps as real ones: decide() on their documents, issueInvitation(), bookFirstFree().

export const DEMO_FILES = path.join(process.cwd(), "src", "features", "demo", "files");
const MEETING_URL = "https://meet.example.com/mask0-demo";
const HOUR = 3600_000;

export type DemoUpload = { path: string; data: Buffer };
export type BuiltDemo = {
  orgId: string;
  orgSlug: string;
  clientSlug: string;
  entryCode: string;
  expiresAt: Date;
  uploads: DemoUpload[];
};

/** Puts this application's events and invitation at the time things happened, not build time. */
async function backdate(tx: Tx, applicationId: string, since: Date, at: Date) {
  await tx
    .update(events)
    .set({ occurredAt: at })
    .where(and(eq(events.applicationId, applicationId), gte(events.occurredAt, since)));
  await tx
    .update(interviewInvitations)
    .set({ sentAt: at })
    .where(eq(interviewInvitations.applicationId, applicationId));
}

/** Weekday slots a few days out, for bookFirstFree() to take the first free one. */
function slotsFrom(now: Date, firstDay: number, hourJst: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const day = new Date(now.getTime() + 9 * HOUR + (firstDay + i) * 24 * HOUR);
    const startsAt = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hourJst - 9),
    );
    return { startsAt, endsAt: new Date(startsAt.getTime() + HOUR) };
  });
}

export async function buildDemo(tx: Tx, input: { userId: string; now: Date }): Promise<BuiltDemo> {
  const { userId, now } = input;
  const orgSlug = `demo-${randomBytes(4).toString("hex")}`;
  const expiresAt = new Date(now.getTime() + DEMO_HOURS * HOUR);
  const [org] = await tx
    .insert(organizations)
    .values({
      name: DEMO_ORG_NAME,
      slug: orgSlug,
      kind: "agency",
      plan: "demo",
      senderName: "みらい人材サービス",
      // Never sends: sendCandidateMessage() treats a demo company as being in test mode anyway.
      testMode: true,
      demoExpiresAt: expiresAt,
    })
    .returning({ id: organizations.id });
  const orgId = org!.id;
  // An admin sees everything; demo companies skip the second factor (requireMember).
  await tx.insert(memberships).values({ orgId, userId, role: "admin", status: "active" });
  await tx.update(profiles).set({ name: "デモ 担当者" }).where(eq(profiles.id, userId));
  await tx.insert(events).values({
    orgId,
    actor: "staff",
    actorId: userId,
    type: "organization.created",
    payload: { kind: "agency", demo: true },
  });

  const clientIds: Record<string, string> = {};
  for (const c of DEMO_CLIENTS) {
    const [row] = await tx
      .insert(clients)
      .values({ orgId, name: c.name, slug: c.slug, isDefault: c.isDefault })
      .returning({ id: clients.id });
    clientIds[c.slug] = row!.id;
    const { calendarId } = await ensureCalendar(tx, { orgId, clientId: row!.id });
    await tx
      .update(availabilityRules)
      .set({ tool: "url", fixedMeetingUrl: MEETING_URL })
      .where(eq(availabilityRules.calendarId, calendarId));
  }

  // Jobs, their conditions and entry URLs.
  const jobInfo: Record<
    string,
    {
      id: string;
      clientId: string;
      criteria: Criterion[];
      keyToId: Map<string, string>;
      urls: { id: string; channel: string; code: string }[];
    }
  > = {};
  for (const [key, job] of Object.entries(DEMO_JOBS)) {
    const clientId = clientIds[job.client]!;
    const owner = { orgId, clientId, userId };
    const jobId = await insertJob(tx, owner, job.fields);
    await tx
      .update(jobs)
      .set({ status: "published", postingFrom: japanToday() })
      .where(eq(jobs.id, jobId));
    const rows = await tx
      .insert(screeningCriteria)
      .values(
        job.criteria.map((c, position) => ({
          orgId,
          clientId,
          jobId,
          type: c.type,
          label: c.label,
          kind: c.type === "basic" ? c.kind : null,
          source: c.type === "basic" ? c.source : null,
          config: c.type === "basic" ? c.config : {},
          required: c.required,
          position,
        })),
      )
      .returning({ id: screeningCriteria.id, position: screeningCriteria.position });
    const keyToId = new Map(rows.map((r) => [job.criteria[r.position]!.key, r.id]));
    const criteria = job.criteria.map(
      ({ key, ...c }) => ({ ...c, id: keyToId.get(key)!, weight: 0 }) as Criterion,
    );
    const urls = await tx
      .insert(entryUrls)
      .values(
        job.channels.map((channel) => ({
          orgId,
          clientId,
          jobId,
          channel,
          code: newEntryCode(),
          createdBy: userId,
        })),
      )
      .returning({ id: entryUrls.id, channel: entryUrls.channel, code: entryUrls.code });
    jobInfo[key] = { id: jobId, clientId, criteria, keyToId, urls };
  }

  // Applicants with documents, read and screened.
  const uploads: DemoUpload[] = [];
  const booked = new Set<string>();
  const settings = {
    passLine: 70,
    failLine: 40,
    autoJudge: true,
    confirmRejections: true,
    weightMode: "equal" as const,
  };
  for (const [index, person] of DEMO_PEOPLE.entries()) {
    const job = jobInfo[person.job]!;
    const scope = { orgId, clientId: job.clientId };
    const appliedAt = new Date(
      now.getTime() - APPLIED_HOURS_AGO[index % APPLIED_HOURS_AGO.length]! * HOUR,
    );
    const since = new Date();
    const url = job.urls[index % job.urls.length]!;
    const email = protectContact("email", person.email);
    const phone = protectContact("phone", person.phone);
    const [candidate] = await tx
      .insert(candidates)
      .values({
        orgId,
        name: person.name,
        nameKana: person.kana,
        emailEnc: email.enc,
        emailHash: email.hash,
        phoneEnc: phone.enc,
        phoneHash: phone.hash,
        prefecture: person.prefecture,
        city: person.city,
      })
      .returning({ id: candidates.id });
    const token = newToken();
    const [app] = await tx
      .insert(applications)
      .values({
        ...scope,
        jobId: job.id,
        candidateId: candidate!.id,
        entryUrlId: url.id,
        channel: url.channel,
        source: "entry",
        appliedAt,
        portalTokenHash: sha256(token),
        portalTokenEnc: encryptPii(token),
      })
      .returning({ id: applications.id });
    const applicationId = app!.id;
    await tx
      .insert(applicationAnswers)
      .values(
        [...Object.entries(person.answers), ["pay_band", "こだわらない"] as const].map(
          ([key, value]) => ({ ...scope, applicationId, key, value }),
        ),
      );
    await tx.insert(consents).values({
      ...scope,
      candidateId: candidate!.id,
      applicationId,
      kind: "privacy",
      granted: true,
      textVersion: privacyTextVersion(true),
    });

    const texts: string[] = [];
    for (const file of person.files) {
      const data = await readFile(path.join(DEMO_FILES, file.file));
      const pdf = await readPdf(data);
      const id = randomUUID();
      const storagePath = `org/${orgId}/app/${applicationId}/${id}.pdf`;
      await tx.insert(documents).values({
        id,
        ...scope,
        applicationId,
        kind: file.kind,
        storagePath,
        fileName: file.kind === "resume" ? "履歴書.pdf" : "職務経歴書.pdf",
        mime: "application/pdf",
        bytes: data.length,
        pages: pdf?.pages ?? null,
        sha256: createHash("sha256").update(data).digest("hex"),
        uploadedBy: "candidate",
        status: "ready",
        readStatus: "done",
        transcript: pdf?.text.trim() ?? "",
        textSource: "pdf_text",
        legibility: "good",
        readPromptVersion: READ_PROMPT_VERSION,
      });
      uploads.push({ path: storagePath, data });
      texts.push(
        `【${file.kind === "resume" ? "履歴書" : "職務経歴書"}】\n${pdf?.text.trim() ?? ""}`,
      );
    }

    // The stored proposal stands in for the AI; the verdict comes from decide() as in production.
    const screenedAt = new Date(appliedAt.getTime() + 4 * 60_000);
    const masked = maskForScreening(texts.join("\n\n"), [person.name]);
    const decision = decide({
      criteria: job.criteria,
      settings,
      answers: person.answers,
      ai: person.ai.map((r) => ({ ...r, criterionId: job.keyToId.get(r.criterionId)! })),
      documentText: masked,
      flags: {},
    });
    const [run] = await tx
      .insert(screeningRuns)
      .values({
        ...scope,
        applicationId,
        criteriaVersion: 1,
        promptVersion: SCREEN_PROMPT_VERSION,
        createdAt: screenedAt,
        score: decision.score,
        verdictAi: decision.verdict,
        results: decision.outcomes,
        flags: decision.flags,
        reasons: decision.reasons,
      })
      .returning({ id: screeningRuns.id });
    await tx
      .update(applications)
      .set({
        verdict: decision.verdict,
        score: decision.score,
        ...stateForVerdict(decision.verdict),
      })
      .where(eq(applications.id, applicationId));
    await tx.insert(screeningDecisions).values({
      ...scope,
      applicationId,
      verdict: decision.verdict,
      source: "ai",
      createdAt: screenedAt,
    });
    await tx.insert(events).values([
      {
        ...scope,
        applicationId,
        actor: "candidate",
        type: "application.created",
        payload: { jobId: job.id, entryUrlId: url.id, channel: url.channel },
        occurredAt: appliedAt,
      },
      {
        ...scope,
        applicationId,
        actor: "system",
        type: "screening.completed",
        payload: {
          runId: run!.id,
          verdict: decision.verdict,
          score: decision.score,
          reasons: decision.reasons,
        },
        occurredAt: screenedAt,
      },
    ]);

    if (decision.verdict === "pass") {
      const invitationId = await issueInvitation(tx, {
        ...scope,
        applicationId,
        round: 1,
        actor: "system",
      });
      await backdate(tx, applicationId, since, new Date(appliedAt.getTime() + 5 * 60_000));
      // The first pass of each job has booked; later ones are still choosing a time.
      if (invitationId && !booked.has(person.job)) {
        booked.add(person.job);
        const { calendarId, rules } = await ensureCalendar(tx, scope);
        await bookFirstFree(tx, {
          ...scope,
          applicationId,
          invitationId,
          calendarId,
          rules,
          round: 1,
          preferred: slotsFrom(
            now,
            person.job === "sales" ? 2 : 3,
            person.job === "sales" ? 14 : 10,
          ),
          now,
          actor: { kind: "candidate" },
        });
      }
    }
  }

  // Past applicants without documents: history for the dashboard and analytics.
  for (const h of DEMO_HISTORY) {
    const job = jobInfo[h.job]!;
    const scope = { orgId, clientId: job.clientId };
    const appliedAt = new Date(now.getTime() - h.daysAgo * 24 * HOUR);
    const closedAt = new Date(appliedAt.getTime() + 6 * 24 * HOUR);
    const url = job.urls[h.daysAgo % job.urls.length]!;
    const [candidate] = await tx
      .insert(candidates)
      .values({ orgId, name: h.name })
      .returning({ id: candidates.id });
    const outcome: Record<typeof h.end, Partial<typeof applications.$inferInsert>> = {
      screened_out: {
        stage: "screening",
        outcome: "rejected",
        verdict: "fail",
        score: 30,
        closeReason: "screening",
        closedAt,
      },
      withdrew: {
        stage: "booking",
        outcome: "withdrawn",
        verdict: "pass",
        score: 80,
        closeReason: "withdrawn",
        closedAt,
      },
      interview_rejected: {
        stage: "interview",
        outcome: "rejected",
        verdict: "pass",
        score: 75,
        closeReason: "interview",
        closedAt,
      },
      hired: { stage: "hired", outcome: "hired", verdict: "pass", score: 90, closedAt },
    };
    const [app] = await tx
      .insert(applications)
      .values({
        ...scope,
        jobId: job.id,
        candidateId: candidate!.id,
        entryUrlId: url.id,
        channel: url.channel,
        source: "entry",
        appliedAt,
        ...outcome[h.end],
      })
      .returning({ id: applications.id });
    const verdict = outcome[h.end].verdict as Verdict;
    const at = (hours: number) => new Date(appliedAt.getTime() + hours * HOUR);
    await tx.insert(events).values([
      {
        ...scope,
        applicationId: app!.id,
        actor: "candidate",
        type: "application.created",
        payload: { jobId: job.id, channel: url.channel },
        occurredAt: appliedAt,
      },
      {
        ...scope,
        applicationId: app!.id,
        actor: "system",
        type: "screening.completed",
        payload: { verdict },
        occurredAt: at(0.1),
      },
      ...(verdict === "pass"
        ? [
            {
              ...scope,
              applicationId: app!.id,
              actor: "system" as const,
              type: "invitation.sent",
              payload: { round: 1 },
              occurredAt: at(0.2),
            },
          ]
        : []),
    ]);
  }

  // The candidate view opens the sales job's first entry URL.
  const entryCode = jobInfo.sales!.urls[0]!.code;
  return { orgId, orgSlug, clientSlug: "main", entryCode, expiresAt, uploads };
}
