import Link from "next/link";
import { Brand } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="mobile-nav-space mt-auto border-t border-line bg-white">
      <div className="page-shell flex flex-col gap-6 sm:flex-row sm:items-center">
        <div>
          <Brand compact />
          <p className="mt-3 text-sm text-muted-foreground">
            ぬいのおうち・家具・台座を、3Dプリントで。
          </p>
        </div>
        <nav
          aria-label="フッターメニュー"
          className="flex flex-wrap gap-x-6 gap-y-1 sm:ml-auto"
        >
          {[
            { href: "/works", label: "作品をさがす" },
            { href: "/mypage/nuis", label: "マイぬい" },
            { href: "/creator/apply", label: "出品について" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              prefetch={false}
              href={href}
              className="flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand hover:underline"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto max-w-[1270px] px-4 pb-6 text-sm text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} OshiNest
      </div>
    </footer>
  );
}
