import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RAIL_ICON, RAIL_ITEM } from "./rail";

/** Posts to /auth/sign-out with a regular form submit (full page load, see that route). */
export function SignOutButton({
  label,
  variant = "button",
}: {
  label: string;
  variant?: "button" | "rail";
}) {
  return (
    <form action="/auth/sign-out" method="post" className={variant === "rail" ? "w-full" : ""}>
      {variant === "rail" ? (
        <button type="submit" className={RAIL_ITEM}>
          <span className={`${RAIL_ICON} group-hover/nav:bg-muted`}>
            <LogOutIcon aria-hidden />
          </span>
          {label}
        </button>
      ) : (
        <Button type="submit" variant="ghost" size="sm">
          <LogOutIcon aria-hidden />
          {label}
        </Button>
      )}
    </form>
  );
}
