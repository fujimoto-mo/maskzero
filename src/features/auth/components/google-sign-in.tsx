import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signInWithGoogleAction } from "../actions";

/** "Sign in with Google" plus an "or" divider; render only when the provider is configured. */
export function GoogleSignIn({ next, label, or }: { next: string; label: string; or: string }) {
  return (
    <>
      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" size="lg" variant="outline" className="w-full">
          {label}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        {or}
        <Separator className="flex-1" />
      </div>
    </>
  );
}
