"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type IdleTimeoutOptions = {
  timeoutMs?: number;
  warningMs?: number;
  enabled?: boolean;
};

export function useIdleTimeout({
  timeoutMs = 15 * 60 * 1000,
  warningMs = 2 * 60 * 1000,
  enabled = true,
}: IdleTimeoutOptions = {}) {
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timeoutMs);
  const warningShownRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimers();
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;

    if (mountedRef.current) {
      setIsWarningOpen(false);
      setTimeLeft(timeoutMs);
    }

    timerRef.current = setTimeout(() => {
      if (!mountedRef.current || warningShownRef.current) return;
      warningShownRef.current = true;

      if (mountedRef.current) {
        setIsWarningOpen(true);
        setTimeLeft(warningMs);
      }

      lastActivityRef.current = Date.now();
      countdownRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        const elapsed = Date.now() - lastActivityRef.current;
        const remaining = warningMs - elapsed;
        if (remaining <= 0) {
          clearTimers();
          setTimeLeft(0);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
    }, timeoutMs - warningMs);
  }, [timeoutMs, warningMs, clearTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    mountedRef.current = true;
    startTimer();

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    const handleActivity = () => {
      if (isWarningOpen) return;
      startTimer();
    };

    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      mountedRef.current = false;
      clearTimers();
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled, startTimer, clearTimers, isWarningOpen]);

  const staySignedIn = useCallback(() => {
    // Guard: if the warning isn't open, this is a stale call — ignore it.
    if (!warningShownRef.current) return;
    warningShownRef.current = false;
    startTimer();
  }, [startTimer]);

  const signOutNow = useCallback(() => {
    clearTimers();
    return true;
  }, [clearTimers]);

  const formatTime = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  return {
    isWarningOpen,
    timeLeft,
    formatTime,
    staySignedIn,
    signOutNow,
  };
}
