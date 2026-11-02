import { getRequestConfig } from "next-intl/server";

// Japanese is the only UI language for now. English becomes a second locale later (docs/03).
// Marketing copy lives in its own file so site and app text can change independently.
export default getRequestConfig(async () => {
  const locale = "ja";
  const [app, marketing] = await Promise.all([
    import(`../messages/${locale}.json`),
    import(`../messages/${locale}-marketing.json`),
  ]);
  return {
    locale,
    timeZone: "Asia/Tokyo",
    messages: { ...app.default, ...marketing.default },
  };
});
