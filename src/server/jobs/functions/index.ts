import { decisionEffects, interviewReportJob } from "./interviewing";
import { processApplication } from "./process-application";
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
];
