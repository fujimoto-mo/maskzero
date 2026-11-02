import { z } from "zod";
import type messages from "@/messages/ja.json";

/** Keys of Onboarding.errors in src/messages/ja.json. */
export type OnboardingErrorKey = keyof (typeof messages)["Onboarding"]["errors"];

export const onboardingSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "nameRequired" satisfies OnboardingErrorKey)
    .max(100, "nameTooLong" satisfies OnboardingErrorKey),
  kind: z.enum(["agency", "inhouse"]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
