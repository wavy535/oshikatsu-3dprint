import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Osinest（オシネスト）",
  description: "推し活特化型3Dプリント受託販売ECプラットフォーム",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
