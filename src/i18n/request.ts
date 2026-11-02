import { getRequestConfig } from "next-intl/server";

// Japanese is the only UI language for now. English becomes a second locale later (docs/03).
export default getRequestConfig(async () => {
  const locale = "ja";
  return {
    locale,
    timeZone: "Asia/Tokyo",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
