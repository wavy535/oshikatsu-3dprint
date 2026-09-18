import Link from "next/link";
import { ArrowRight, Package, Ruler, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

// トップだけはブランド名から始めたいので、ルートの「%s｜OshiNest」テンプレートを使わない
export const metadata = { title: { absolute: "OshiNest｜推し活のための3Dプリント作品マーケット" } };

const POINTS = [
  {
    icon: Ruler,
    title: "サイズで選べる",
    text: "10cm / 15cm / 20cm のサイズ展開。登録したマイぬいの採寸値と作品の内寸を比べて、入るかどうかを数値で出します。",
  },
  {
    icon: Package,
    title: "印刷は運営が代行",
    text: "クリエイターは3Dデータを出品するだけ。印刷・検品・梱包・発送は OshiNest 運営が行います。",
  },
  {
    icon: ShieldCheck,
    title: "検品してから発送",
    text: "寸法・積層・サポート跡・色・組立・外観の6項目を確認してから出荷します。",
  },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-[1270px] flex-col gap-5 px-4 sm:px-6 py-14">
          <h1 className="text-balance text-2xl leading-tight font-bold text-ink sm:text-3xl">
            推しぬいに、ぴったりの居場所を。
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            台座・家具・背景・ケース。クリエイターが作った3Dプリント作品を、
            うちの子のサイズに合わせて選べます。
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/works">
                作品をさがす
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/mypage/nuis">マイぬいを登録する</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1270px] gap-4 px-4 sm:px-6 py-10 md:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft">
              <Icon className="size-4.5 text-brand" aria-hidden />
            </span>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <p className="text-xs leading-5 text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
