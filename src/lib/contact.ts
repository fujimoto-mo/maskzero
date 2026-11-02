// Contact normalization shared by the entry form (browser) and the server, so both agree on what
// counts as the same email or phone number.

export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

/** Digits only, full-width digits converted, +81 rewritten to a leading 0. */
export function normalizePhone(phone: string): string {
  const digits = phone.normalize("NFKC").replace(/[^\d+]/g, "");
  return digits.startsWith("+81") ? `0${digits.slice(3)}` : digits.replace(/\+/g, "");
}

/** Japanese landline and mobile numbers have 10 or 11 digits starting with 0. */
export function isPlausiblePhone(phone: string): boolean {
  return /^0\d{9,10}$/.test(normalizePhone(phone));
}
