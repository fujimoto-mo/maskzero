import "server-only";

// The company's inbound address (docs/02 M3-10, docs/05 §10): in+{local part}@{INBOUND_DOMAIN}.
// Job-board notifications forwarded there and candidate replies reach the webhook.

export const INBOUND_PREFIX = "in+";

export function inboundAddress(localPart: string | null): string | null {
  const domain = process.env.INBOUND_DOMAIN;
  return domain && localPart ? `${INBOUND_PREFIX}${localPart}@${domain}` : null;
}

/** The local part from an address like in+abc123@inbound.example.jp, or null. */
export function localPartOf(address: string): string | null {
  const match = /^in\+([a-z0-9]{6,32})@/i.exec(address.trim());
  return match ? match[1]!.toLowerCase() : null;
}
