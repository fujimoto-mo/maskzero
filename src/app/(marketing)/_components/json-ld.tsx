import { getTranslations } from "next-intl/server";
import { FAQ_KEYS } from "./faq";
import { BRAND_NAME, SITE_URL } from "./site-config";

/** Renders structured data. `<` is escaped so text can't close the script tag. */
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Organization, SoftwareApplication and FAQPage for the landing page. */
export async function LandingJsonLd() {
  const tMeta = await getTranslations("Home.meta");
  const tFaq = await getTranslations("Home.faq");
  const tSite = await getTranslations("Site");
  const organizationId = `${SITE_URL}/#organization`;

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": organizationId,
            name: tSite("operator.name"),
            url: SITE_URL,
            brand: { "@type": "Brand", name: BRAND_NAME },
          },
          {
            "@type": "SoftwareApplication",
            "@id": `${SITE_URL}/#software`,
            name: BRAND_NAME,
            url: SITE_URL,
            description: tMeta("description"),
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            inLanguage: "ja",
            publisher: { "@id": organizationId },
          },
          {
            "@type": "FAQPage",
            "@id": `${SITE_URL}/#faq`,
            inLanguage: "ja",
            mainEntity: FAQ_KEYS.map((key) => ({
              "@type": "Question",
              name: tFaq(`items.${key}.q`),
              acceptedAnswer: { "@type": "Answer", text: tFaq(`items.${key}.a`) },
            })),
          },
        ],
      }}
    />
  );
}
