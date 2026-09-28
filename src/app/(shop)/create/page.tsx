import type { Metadata } from "next";
import { HouseEditor } from "@/components/design/house-editor";

export const metadata: Metadata = { title: "おうちをつくる", description: "部品と寸法を選んで、ぬいのおうちをブラウザで制作できます。" };

export default function CreatePage() {
  return <div className="mx-auto w-full max-w-[1270px] px-4 py-6 sm:px-6 sm:py-8">
    <p className="mb-2 text-sm font-semibold text-brand">制作機能・試作版</p>
    <h1 className="text-balance text-2xl font-bold sm:text-3xl">ぬいのおうちをつくる</h1>
    <p className="mt-3 mb-4 max-w-3xl text-pretty leading-7 text-muted-foreground">壁・屋根・窓・棚を組み合わせて、寸法と色を決めます。登録なしで試せます。</p>
    <noscript><p>制作機能にはJavaScriptが必要です。ブラウザの設定で有効にしてください。</p></noscript>
    <HouseEditor />
  </div>;
}
