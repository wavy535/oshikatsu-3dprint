"use client";

import { useEffect } from "react";
import { markMessagesReadAction } from "@/lib/messages/actions";

export function MessageReadReceipt({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let sent = false;
    const markVisible = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void markMessagesReadAction(key.split(",")).catch((error) => {
        console.error("Could not mark messages read", error);
      });
    };
    markVisible();
    document.addEventListener("visibilitychange", markVisible);
    return () => document.removeEventListener("visibilitychange", markVisible);
  }, [key]);
  return null;
}
