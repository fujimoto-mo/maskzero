import type { MetadataRoute } from "next";
import { SITE_URL } from "./(marketing)/_components/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Staff app, candidate pages (/a/{code}, /p/{token}), invitations, API and auth screens.
      disallow: [
        "/app",
        "/a/",
        "/p/",
        "/invite/",
        "/api/",
        "/auth/",
        "/login",
        "/signup",
        "/onboarding",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
