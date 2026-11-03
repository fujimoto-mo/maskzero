// Shared constants for the public marketing site (landing page, legal pages, SEO routes).

/** Absolute base URL for canonical links, the sitemap, robots.txt, the OG image and JSON-LD. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const BRAND_NAME = "mask0";

/** Service guide offered after a "download" submission. The PDF itself lives in /public. */
export const GUIDE_PDF_PATH = "/guide.pdf";

/** Landing-page anchors used by the header, footer and CTAs. */
export const NAV_ITEMS = [
  { key: "features", href: "/#features" },
  { key: "change", href: "/#change" },
  { key: "flow", href: "/#flow" },
  { key: "faq", href: "/#faq" },
] as const;

/** Indexable marketing pages besides `/` (sitemap order). */
export const MARKETING_PAGES = ["/demo", "/security", "/company", "/privacy", "/terms"] as const;

/**
 * Legal texts still awaiting legal review: not indexed and left out of the sitemap. Remove a path
 * here (and the page's `draft` prop) once its final text is in place.
 */
export const DRAFT_PAGES: readonly string[] = ["/privacy", "/terms"];

export type ContactMode = "download" | "consult";

/** `category` sent to /api/contact in download mode (the field is hidden there). */
export const DOWNLOAD_CATEGORY = "download";

/** `category` values offered in consult mode; labels live in Home.contact.form.category.options. */
export const CONSULT_CATEGORIES = ["adoption", "demo", "pricing", "other"] as const;
export type ConsultCategory = (typeof CONSULT_CATEGORIES)[number];

/** Character limits checked in the browser; /api/contact validates again. */
export const CONTACT_LIMITS = {
  company: 100,
  name: 100,
  email: 254,
  phone: 30,
  message: 3000,
} as const;
