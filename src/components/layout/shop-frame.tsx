"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
  const pathname = usePathname();
  const workspace = pathname === "/create" || pathname === "/demo";
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const element = frame.current;
    if (!workspace || !viewport || !element) return;
    // Mobile keyboards resize the visual viewport without always changing dvh.
    const resize = () => {
      element.style.height = viewport.scale === 1 ? `${viewport.height}px` : "";
      element.toggleAttribute("data-keyboard-open", viewport.scale === 1 && viewport.height < window.innerHeight - 120);
    };
    resize();
    viewport.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      element.style.removeProperty("height");
      element.removeAttribute("data-keyboard-open");
    };
  }, [workspace]);

  return (
    <div
      ref={frame}
      className={cn(
        "flex flex-1 flex-col",
        workspace && "design-frame h-dvh min-h-0 flex-none overflow-hidden",
      )}
    >
      <div className="design-site-header shrink-0">{header}</div>
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
