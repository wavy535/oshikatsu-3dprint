import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 各ページの metadata.title は「ページ名｜OshiNest」になる。無いページはブランド名だけ
  title: { default: "OshiNest", template: "%s｜OshiNest" },
  description: "推し活のための、3Dプリント作品マーケット",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-white focus:px-5 focus:py-3 focus:text-brand focus:shadow-md">本文へスキップ</a>
        {children}
      </body>
    </html>
  );
}
