// What the connected accounts make possible (docs/02 M8-6, M9-4). Pure, shared by pages and actions.

export type ConnectionRow = {
  provider: "google" | "zoom" | "microsoft";
  scopes: string[];
  status: "active" | "error";
};

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type Capabilities = {
  /** Interviews go into a Google calendar, free/busy is respected, Meet links can be made. */
  googleCalendar: boolean;
  gmail: boolean;
  zoom: boolean;
  teams: boolean;
};

export function capabilities(rows: ConnectionRow[]): Capabilities {
  const active = (provider: ConnectionRow["provider"]) =>
    rows.find((r) => r.provider === provider && r.status === "active");
  const google = active("google");
  return {
    googleCalendar: Boolean(google?.scopes.includes(GOOGLE_CALENDAR_SCOPE)),
    gmail: Boolean(google?.scopes.includes(GMAIL_SEND_SCOPE)),
    zoom: Boolean(active("zoom")),
    teams: Boolean(active("microsoft")),
  };
}

export type InterviewTool = "url" | "onsite" | "meet" | "zoom" | "teams";

/** Whether a tool can be chosen: Meet, Zoom and Teams need their account connected. */
export function toolAvailable(tool: InterviewTool, can: Capabilities): boolean {
  if (tool === "meet") return can.googleCalendar;
  if (tool === "zoom") return can.zoom;
  if (tool === "teams") return can.teams;
  return true;
}

/** A Google calendar id: "primary", an email-like id, or a group calendar id. */
export const GOOGLE_CALENDAR_ID = /^(primary|[A-Za-z0-9._%+-]{1,200}@[A-Za-z0-9.-]{1,200})$/;
