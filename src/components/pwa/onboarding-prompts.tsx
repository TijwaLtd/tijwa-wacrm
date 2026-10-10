"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BellRing,
  Check,
  Download,
  Loader2,
  Smartphone,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useInstallPrompt } from "@/components/pwa/use-install-prompt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const NOTIF_FLAG = "tijwa:notif-prompt-v1";
const INSTALL_FLAG = "tijwa:install-prompt-v1";

/** Deliberate pause so the dashboard paints before we interrupt it. */
const PROMPT_DELAY_MS = 1500;

type Step = "wait" | "notifications" | "install" | "done";

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — prompts will simply re-appear */
  }
}

/**
 * Post-onboarding growth prompts. Shown once per browser, sequenced:
 *
 *   1. Enable browser notifications — explains the value before
 *      asking for permission (permission prompts with no context
 *      convert terribly and can't be re-shown after denial).
 *   2. Install the app — native prompt on Chromium, manual
 *      "Add to Home Screen" steps on iOS Safari.
 *
 * Gated on a resolved accountId so brand-new signups only see this
 * after onboarding / joining a workspace, never on the login wall.
 * Every outcome is remembered in localStorage — "Not now" is
 * respected permanently; the /notifications card remains the
 * permanent home for both settings.
 */
export function OnboardingPrompts() {
  const t = useTranslations("Pwa");
  const { accountId } = useAuth();
  const push = usePushNotifications();
  const install = useInstallPrompt();

  const [step, setStep] = useState<Step>("wait");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decide the first eligible step once an account exists.
  useEffect(() => {
    if (!accountId || step !== "wait") return;

    const decide = () => {
      const notifFlag = readFlag(NOTIF_FLAG);
      const wantsNotif =
        push.supported &&
        push.permission !== "granted" &&
        notifFlag === null;
      if (wantsNotif) {
        setStep("notifications");
        return;
      }
      const installFlag = readFlag(INSTALL_FLAG);
      if (
        installFlag === null &&
        !install.standalone &&
        (install.canPrompt || install.iosManual)
      ) {
        setStep("install");
        return;
      }
      setStep("done");
    };

    timerRef.current = setTimeout(decide, PROMPT_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [accountId, step, push.supported, push.permission, install.standalone, install.canPrompt, install.iosManual]);

  const closeAndNext = useCallback((next: Step) => {
    setStep(next);
  }, []);

  const handleNotifEnable = useCallback(async () => {
    await push.enable();
    writeFlag(NOTIF_FLAG, "enabled");
    closeAndNext("install");
  }, [push, closeAndNext]);

  const handleNotifDismiss = useCallback(() => {
    writeFlag(NOTIF_FLAG, "dismissed");
    closeAndNext("install");
  }, [closeAndNext]);

  const handleInstall = useCallback(async () => {
    const outcome = await install.promptInstall();
    if (outcome === "accepted") {
      writeFlag(INSTALL_FLAG, "installed");
      setStep("done");
      return;
    }
    if (outcome === "dismissed") {
      writeFlag(INSTALL_FLAG, "dismissed");
      setStep("done");
      return;
    }
    // No native prompt (iOS / Firefox) — keep the dialog open showing
    // manual steps; dismissal below records the choice.
  }, [install]);

  const handleInstallDismiss = useCallback(() => {
    writeFlag(INSTALL_FLAG, "dismissed");
    setStep("done");
  }, []);

  const notifOpen = step === "notifications";
  const installOpen = step === "install";

  return (
    <>
      {/* ── 1. Notifications ─────────────────────────────── */}
      <Dialog
        open={notifOpen}
        onOpenChange={(open) => {
          if (!open) handleNotifDismiss();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <BellRing className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <DialogTitle className="text-center">
              {t("notifications.title")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t("notifications.description")}
            </DialogDescription>
          </DialogHeader>

          <ul className="mx-auto w-full max-w-xs space-y-2 py-1">
            {(
              [
                "benefit1",
                "benefit2",
                "benefit3",
              ] as const
            ).map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500"
                  aria-hidden
                />
                <span className="text-foreground">{t(`notifications.${key}`)}</span>
              </li>
            ))}
          </ul>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              disabled={push.loading || !push.vapidConfigured}
              onClick={() => void handleNotifEnable()}
            >
              {push.loading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("notifications.enable")}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleNotifDismiss}
            >
              {t("notifications.notNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 2. Install app ───────────────────────────────── */}
      <Dialog
        open={installOpen}
        onOpenChange={(open) => {
          if (!open) handleInstallDismiss();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Smartphone className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <DialogTitle className="text-center">
              {t("install.title")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t("install.description")}
            </DialogDescription>
          </DialogHeader>

          {install.canPrompt ? (
            <Button
              className="mx-auto flex w-full max-w-xs items-center"
              onClick={() => void handleInstall()}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {t("install.install")}
            </Button>
          ) : (
            <div className="mx-auto w-full max-w-xs rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-sm text-foreground">
                {install.iosManual
                  ? t("install.iosHint")
                  : t("install.genericHint")}
              </p>
            </div>
          )}

          <DialogFooter className="sm:flex-col">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleInstallDismiss}
            >
              {t("install.notNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
