import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { functions } from "@/server/jobs/functions";

// Reading a long photographed document can take a minute; each step is a separate request.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
