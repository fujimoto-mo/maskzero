import { NextResponse } from "next/server";
import { isProvider, saveConnection, takePending } from "@/server/integrations/connect";
import { exchangeCode, IntegrationError } from "@/server/integrations/oauth";
import { isAdmin, requireMember } from "@/server/auth/session";

// The provider sends the admin back here with a code (docs/03 /api/oauth/*). The state must match
// the cookie set at the start, and the code is traded with the PKCE verifier kept there.

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/oauth/[provider]/callback">,
) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const url = new URL(request.url);
  const pending = await takePending(provider, url.searchParams.get("state"));
  if (!pending) return NextResponse.json({ error: "state" }, { status: 400 });
  const ctx = await requireMember(pending.org, pending.client);
  if (!isAdmin(ctx)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const back = new URL(
    `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings?tab=integrations`,
    request.url,
  );
  const code = url.searchParams.get("code");
  if (!code) {
    back.searchParams.set("error", "denied");
    return NextResponse.redirect(back);
  }
  try {
    const connection = await exchangeCode(provider, code, pending.verifier);
    if (!connection.accountEmail) throw new IntegrationError("provider", "no account email");
    await saveConnection(ctx, provider, pending.purpose, connection);
    back.searchParams.set("connected", provider);
  } catch (error) {
    console.error(
      "[oauth] connection failed",
      provider,
      error instanceof Error ? error.message : "",
    );
    back.searchParams.set("error", "failed");
  }
  return NextResponse.redirect(back);
}
