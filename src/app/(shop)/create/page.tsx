import type { Metadata } from "next";
import Link from "next/link";
import { HouseEditor } from "@/components/design/house-editor";

export const metadata: Metadata = {
  title: "AIでつくる・ARで置く",
  description:
    "AIと話してぬいのおうちや家具をモデリング。変化を見ながら調整し、ARで飾る場所に置いて確認できます。",
};

export default function CreatePage() {
  return (
    <>
      <noscript>
        <p className="p-4">
          制作にはJavaScriptが必要です。
          <Link href="/works" className="text-brand underline">
            作品をさがす
          </Link>
          こともできます。
        </p>
      </noscript>
      <HouseEditor />
    </>
  );
}
