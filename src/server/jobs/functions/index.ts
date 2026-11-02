import { processApplication } from "./process-application";
import { purgeExpiredApplications } from "./purge-expired-applications";
import { rescreenJob } from "./rescreen-job";
import {
  interviewLifecycle,
  invitationLifecycle,
  invitationResendEmail,
  rejectionNotice,
} from "./scheduling";
import { sendWelcomeEmail } from "./send-welcome-email";
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
  rejectionNotice,
];
