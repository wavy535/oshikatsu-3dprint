import Link from "next/link";

const LINKS = [
  { href: "/works", label: "作品をさがす" },
  { href: "/creator/apply", label: "クリエイター登録" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="mx-auto flex w-full max-w-[1270px] flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-brand">OshiNest</span>
          <p className="text-xs text-muted-foreground">
            推し活のための、3Dプリント作品マーケット
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 sm:ml-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs text-muted-foreground hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-line px-6 py-3">
        <p className="mx-auto w-full max-w-[1270px] text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} OshiNest
        </p>
      </div>
    </footer>
  );
}
