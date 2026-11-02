import { NextResponse } from "next/server";
import { z } from "zod";
import { filesSchema } from "@/features/intake/entry-schema";
import { addPortalDocuments, loadPortal } from "@/features/intake/entry-server";
import { sha256 } from "@/server/crypto/tokens";
import { withinRateLimit } from "@/server/rate-limit";

const bodySchema = z.object({
  files: filesSchema.refine((files) => files.length > 0),
  replace: z.array(z.enum(["resume", "cv"])).max(2),
});

/** Adds or replaces documents from the personal page; returns signed uploads for the new files. */
export async function POST(request: Request, { params }: RouteContext<"/api/p/[token]/uploads">) {
  const { token } = await params;
  if (!(await withinRateLimit(`portal:${sha256(token).slice(0, 32)}`, 30, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (!portal.view.uploadsAllowed) return NextResponse.json({ error: "closed" }, { status: 409 });

  const uploads = await addPortalDocuments(portal, parsed.data.files, parsed.data.replace);
  return NextResponse.json({ uploads });
}
