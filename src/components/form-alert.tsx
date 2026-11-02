import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Result line under a form: an error from the server action, or a success message. */
export function FormAlert({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (message) {
    return (
      <Alert>
        <CircleCheckIcon />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
