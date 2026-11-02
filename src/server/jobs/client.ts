import { Inngest } from "inngest";

// Event keys and signing keys come from INNGEST_* env vars; INNGEST_DEV=1 targets the local dev server.
export const inngest = new Inngest({ id: "mask0" });
