import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Posts to /auth/sign-out with a regular form submit (full page load, see that route). */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form action="/auth/sign-out" method="post">
      <Button type="submit" variant="ghost" size="sm">
        <LogOutIcon aria-hidden />
        {label}
      </Button>
    </form>
  );
}
