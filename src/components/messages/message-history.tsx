"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Keep the latest reply visible without moving the composer or the page. */
export function MessageHistory({
  children,
  latestMessageId,
  showLatest,
}: {
  children: ReactNode;
  latestMessageId?: string;
  showLatest: boolean;
}) {
  const history = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.current)
      history.current.scrollTop = showLatest ? history.current.scrollHeight : 0;
  }, [latestMessageId, showLatest]);

  return (
    <div
      ref={history}
      role="region"
      aria-label="メッセージ履歴"
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-ground px-3 py-4 sm:px-4"
    >
      {children}
    </div>
  );
}
