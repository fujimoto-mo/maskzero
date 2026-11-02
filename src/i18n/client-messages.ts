import { getMessages } from "next-intl/server";

type AllMessages = Awaited<ReturnType<typeof getMessages>>;

/**
 * The message namespaces one part of the site needs in the browser. Everything else (the legal
 * pages, other areas' text) stays on the server instead of riding along on every page.
 */
export async function clientMessages<K extends keyof AllMessages>(...namespaces: K[]) {
  const all = await getMessages();
  return Object.fromEntries(namespaces.map((ns) => [ns, all[ns]])) as Pick<AllMessages, K>;
}
