import type { ReactNode } from "react";

/** Navigation/filter links stay expanded on desktop and can be opened above mobile content. */
export function ResponsiveSidebar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full min-w-0 shrink-0 lg:w-56">
      <details className="rounded-xl border border-line bg-white lg:hidden">
        <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {label}
        </summary>
        {children}
      </details>
      <div className="hidden lg:block">{children}</div>
    </div>
  );
}
