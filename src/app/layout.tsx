import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 各ページの metadata.title は「ページ名｜OshiNest」になる。無いページはブランド名だけ
  title: { default: "OshiNest", template: "%s｜OshiNest" },
  description: "推し活のための、3Dプリント作品マーケット",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
