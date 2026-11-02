import type marketing from "./messages/ja-marketing.json";
import type app from "./messages/ja.json";

// Type-checks translation keys passed to t() against the Japanese messages.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof app & typeof marketing;
  }
}
