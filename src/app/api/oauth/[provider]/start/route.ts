import { NextResponse } from "next/server";
import { providerAvailable } from "@/server/integrations/config";
import { isProvider, rememberPending } from "@/server/integrations/connect";
import { authorizationUrl, newState, pkcePair } from "@/server/integrations/oauth";
import { isAdmin, requireMember } from "@/server/auth/session";

// Starts connecting Google, Zoom or Microsoft (docs/02 M8-6, M9-4): owners and admins only.

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/oauth/[provider]/start">,
) {
  const { provider } = await params;
  const url = new URL(request.url);
  const org = url.searchParams.get("org") ?? "";
  const client = url.searchParams.get("client") ?? "";
  const purpose = url.searchParams.get("purpose") === "gmail" ? "gmail" : "calendar";
  if (!isProvider(provider) || !org || !client) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const ctx = await requireMember(org, client);
  const back = new URL(
    `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings?tab=integrations`,
    request.url,
  );
  if (!isAdmin(ctx)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (ctx.demo || !providerAvailable(provider)) {
    back.searchParams.set("error", ctx.demo ? "demo" : "unavailable");
    return NextResponse.redirect(back);
  }
  const state = newState();
  const { verifier, challenge } = pkcePair();
  await rememberPending({
    state,
    verifier,
    provider,
    purpose,
    org: ctx.orgSlug,
    client: ctx.clientSlug,
  });
  return NextResponse.redirect(authorizationUrl(provider, purpose, state, challenge));
}
