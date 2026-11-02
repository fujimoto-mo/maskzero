import { z } from "zod";

/** Longest text each posting field may hold; the editor uses these as the inputs' maxLength. */
export const TEXT_LIMITS = {
  title: 100,
  displayTitle: 100,
  category: 50,
  employmentType: 50,
  jobClass: 50,
  postcode: 10,
  address: 200,
  access: 200,
  workplaceChange: 200,
  placeNote: 1000,
  smoking: 50,
  payType: 10,
  fixedOvertime: 300,
  payNote: 1000,
  workSchedule: 50,
  hours: 300,
  monthlyHours: 50,
  annualHolidays: 50,
  holidays: 1000,
  description: 5000,
  dutyChange: 200,
  appeal: 2000,
  experienceRequired: 50,
  education: 50,
  mustHave: 2000,
  niceToHave: 2000,
  probation: 200,
  benefits: 2000,
  headcount: 50,
  hiringReason: 50,
  businessDescription: 2000,
} as const;

const text = (key: keyof typeof TEXT_LIMITS) => z.string().trim().max(TEXT_LIMITS[key]).optional();
const amount = z.number().int().min(0).max(100_000_000).nullable().optional();

/**
 * What a job's posting_fields JSON may contain. Everything is optional so drafts can be saved;
 * completeness is reported by checkPosting() (./checks.ts), not enforced here.
 */
export const postingFieldsSchema = z.object({
  title: text("title"),
  displayTitle: text("displayTitle"),
  category: text("category"),
  employmentType: text("employmentType"),
  jobClass: text("jobClass"),
  postcode: text("postcode"),
  address: text("address"),
  access: text("access"),
  workplaceChange: text("workplaceChange"),
  placeNote: text("placeNote"),
  smoking: text("smoking"),
  payType: text("payType"),
  payMin: amount,
  payMax: amount,
  fixedOvertime: text("fixedOvertime"),
  payNote: text("payNote"),
  workSchedule: text("workSchedule"),
  hours: text("hours"),
  monthlyHours: text("monthlyHours"),
  annualHolidays: text("annualHolidays"),
  holidays: text("holidays"),
  description: text("description"),
  dutyChange: text("dutyChange"),
  appeal: text("appeal"),
  experienceRequired: text("experienceRequired"),
  education: text("education"),
  mustHave: text("mustHave"),
  niceToHave: text("niceToHave"),
  insurance: z.array(z.string().max(20)).max(10).optional(),
  probation: text("probation"),
  benefits: text("benefits"),
  headcount: text("headcount"),
  hiringReason: text("hiringReason"),
  businessDescription: text("businessDescription"),
});

export type PostingFields = z.infer<typeof postingFieldsSchema>;

export const jobFormSchema = z
  .object({
    fields: postingFieldsSchema,
    postingFrom: z.iso.date().nullable(),
    postingTo: z.iso.date().nullable(),
    requiresCv: z.boolean(),
  })
  .refine((v) => !v.postingFrom || !v.postingTo || v.postingFrom <= v.postingTo, {
    path: ["postingTo"],
    error: "periodOrder",
  });

export type JobForm = z.infer<typeof jobFormSchema>;
