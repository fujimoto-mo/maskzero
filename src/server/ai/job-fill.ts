import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PostingFields } from "@/features/jobs/schema";
import { AI_BETAS, AI_MODEL, AiOutputError, aiMode, anthropic, recordAiUsage } from "./client";

const fillOutput = z.object({
  displayTitle: z.string(),
  description: z.string(),
  appeal: z.string(),
});

export type JobFill = z.infer<typeof fillOutput>;

const SYSTEM = `You draft Japanese job-posting text for HR staff, who review it before posting.

Write natural, specific Japanese for job seekers, using only facts in the given posting fields; never invent pay, benefits or numbers. Follow Japanese job-board rules: no discriminatory limits by age, gender or nationality, and no exaggeration.
- displayTitle: up to 30 characters; the job plus one concrete appeal (e.g. 休日、働き方).
- description: up to 700 characters; what the work is, how it is done, what is entrusted, and the first months after joining.
- appeal: up to 200 characters; why this job is attractive.`;

/** Drafts the display title, description and appeal points from the filled-in fields (docs/02 M2-6). */
export async function draftJobText(orgId: string, fields: PostingFields): Promise<JobFill> {
  if (aiMode() !== "live") {
    const title = fields.title || "この求人";
    return {
      displayTitle: `${title}／${fields.holidays?.split(/[、,\n]/)[0] ?? "働きやすい環境"}`.slice(
        0,
        30,
      ),
      description: `（AIの下書き・開発用）${title}として、${fields.mustHave ?? "これまでの経験"}を活かして働いていただきます。`,
      appeal: `（AIの下書き・開発用）${fields.benefits ?? fields.payNote ?? "働きやすい環境です"}`,
    };
  }

  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: AI_BETAS,
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(fillOutput) },
    system: SYSTEM,
    messages: [
      { role: "user", content: `<posting>\n${JSON.stringify(fields, null, 2)}\n</posting>` },
    ],
  });
  await recordAiUsage(orgId, "job_fill", response.usage);

  if (response.stop_reason === "refusal") throw new AiOutputError("refusal");
  const output = response.parsed_output;
  if (!output) throw new AiOutputError("invalid_output");
  return output;
}
