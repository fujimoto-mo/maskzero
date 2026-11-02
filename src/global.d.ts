import type messages from "./messages/ja.json";

// Type-checks translation keys passed to t() against the Japanese messages.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
