"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ShopFrame({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const workspace = usePathname() === "/create";
  return (
    <div
      className={cn(
        "flex flex-1 flex-col",
        workspace && "h-dvh min-h-0 flex-none overflow-hidden",
      )}
    >
      <div className="shrink-0">{header}</div>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn("flex flex-1 flex-col", workspace && "min-h-0")}
      >
        {children}
      </main>
      {!workspace && footer}
    </div>
  );
}
