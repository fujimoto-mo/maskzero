"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inviteHumanAction, reinviteAiAction, rescoreAiAction } from "../actions";

/** The ways forward from an AI interview that isn't a plain result (docs/02 M12-4, M12-5). */
export function SessionActions({
  orgSlug,
  clientSlug,
  sessionId,
  canReinvite,
  canInviteHuman,
  canRescore,
}: {
  orgSlug: string;
  clientSlug: string;
  sessionId: string;
  canReinvite: boolean;
  canInviteHuman: boolean;
  canRescore: boolean;
}) {
  const t = useTranslations("AiReview.actions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: typeof reinviteAiAction, done: "reinvited" | "humanInvited" | "rescoring") {
    startTransition(async () => {
      const result = await action(orgSlug, clientSlug, sessionId);
      if (!result.ok) return void toast.error(t("failed"));
      toast.success(t(done));
      router.refresh();
    });
  }

  return (
    <>
      {canReinvite ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(reinviteAiAction, "reinvited")}
        >
          {t("reinvite")}
        </Button>
      ) : null}
      {canInviteHuman ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(inviteHumanAction, "humanInvited")}
        >
          {t("inviteHuman")}
        </Button>
      ) : null}
      {canRescore ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(rescoreAiAction, "rescoring")}
        >
          {t("rescore")}
        </Button>
      ) : null}
    </>
  );
}
