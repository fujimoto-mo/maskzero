import type { MetadataRoute } from "next";
import { DRAFT_PAGES, MARKETING_PAGES, SITE_URL } from "./(marketing)/_components/site-config";

// Public marketing pages only. The staff app, candidate pages and auth screens stay out.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...MARKETING_PAGES.filter((path) => !DRAFT_PAGES.includes(path)).map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
