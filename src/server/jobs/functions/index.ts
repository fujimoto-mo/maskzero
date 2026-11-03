import { aiInterviewLifecycle, aiInterviewScoring, aiInterviewTimeLimit } from "./ai-interview";
import { decisionEffects, interviewReportJob } from "./interviewing";
import { processApplication } from "./process-application";
import { purgeDemoSandboxes } from "./purge-demo-sandboxes";
import { purgeExpiredApplications } from "./purge-expired-applications";
import { rescreenJob } from "./rescreen-job";
import {
  customEmails,
  cvReminder,
  interviewFollowUp,
  interviewLifecycle,
  invitationLifecycle,
  invitationResendEmail,
  poolSuggestionEmail,
  rejectionNotice,
} from "./scheduling";
import { sendWelcomeEmail } from "./send-welcome-email";
import { staffNotificationEmail, tomorrowDigest } from "./staff-notifications";
import { sweepPendingApplications } from "./sweep-pending-applications";

/** Every Inngest function served by /api/inngest. */
export const functions = [
  sendWelcomeEmail,
  processApplication,
  rescreenJob,
  sweepPendingApplications,
  purgeExpiredApplications,
  purgeDemoSandboxes,
  invitationLifecycle,
  invitationResendEmail,
  interviewLifecycle,
  interviewFollowUp,
  rejectionNotice,
  cvReminder,
  customEmails,
  poolSuggestionEmail,
  staffNotificationEmail,
  tomorrowDigest,
  interviewReportJob,
  decisionEffects,
  aiInterviewLifecycle,
  aiInterviewTimeLimit,
  aiInterviewScoring,
];
