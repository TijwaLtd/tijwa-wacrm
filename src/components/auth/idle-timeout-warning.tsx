"use client";

import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function IdleTimeoutWarning() {
  const { signOut } = useAuth();
  const { isWarningOpen, timeLeft, formatTime, staySignedIn, signOutNow } =
    useIdleTimeout({
      timeoutMs: 15 * 60 * 1000,
      warningMs: 2 * 60 * 1000,
    });

  const handleSignOutNow = async () => {
    const shouldSignOut = signOutNow();
    if (shouldSignOut) {
      await signOut();
    }
  };

  return (
    <Dialog open={isWarningOpen} onOpenChange={(open) => !open && staySignedIn()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Session expiring soon</DialogTitle>
          <DialogDescription>
            You have been inactive for a while. For your security, you will be
            signed out in <strong>{formatTime(timeLeft)}</strong> unless you
            choose to stay signed in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={staySignedIn}>
            Stay signed in
          </Button>
          <Button variant="destructive" onClick={handleSignOutNow}>
            Sign out now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
