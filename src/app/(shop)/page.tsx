import Link from "next/link";
import {
  ArrowRight,
  Box,
  Ruler,
  Smile,
  Armchair,
  Image as ImageIcon,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: { absolute: "OshiNest｜推しぬいに、ぴったりの居場所を。" },
};

const STEPS = [
  {
    icon: Smile,
    title: "うちの子を登録",
    text: "ぬいの名前と身長を登録。わかる寸法から、作品のサイズを選びやすく。",
  },
  {
    icon: Ruler,
    title: "サイズを確かめる",
    text: "作品の内寸や、対応する作品のAR表示で、お部屋に置くイメージを確認。",
  },
  {
    icon: PackageCheck,
    title: "かたちにして、お届け",
    text: "3Dプリント・検品・発送は運営が担当。プリンターを持っていなくても大丈夫。",
  },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-line bg-white">
        <div className="page-shell grid items-center gap-6 lg:grid-cols-2 lg:gap-14 lg:py-16">
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm font-semibold text-brand">
              ぬいのための、3Dプリントマーケット
            </p>
            <h1 className="text-balance text-3xl font-bold leading-snug text-ink sm:text-4xl lg:text-5xl">
              うちの子に、
              <br />
              とっておきの居場所を。
            </h1>
            <p className="max-w-md text-base leading-8 text-muted-foreground">
              おうちも、家具も、小さな世界も。
              <br className="hidden sm:block" />
              推しぬいのサイズに合わせて、お気に入りを見つけよう。
            </p>
            <Button asChild size="lg">
              <Link href="/works">
                作品をさがす
                <ArrowRight className="size-5" aria-hidden />
              </Link>
            </Button>
            <Link
              href="/mypage/nuis"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline underline-offset-4"
            >
              マイぬいを登録して、サイズから選ぶ
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <figure className="rounded-3xl bg-brand-soft px-4 pt-2 pb-5 sm:px-8">
            {/* A service illustration, never presented as a product for sale. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nui-house.svg"
              width="560"
              height="440"
              fetchPriority="high"
              alt="小さなおうちの中で、家具に囲まれて座るぬいぐるみのイラスト"
              className="mx-auto w-full max-w-md"
            />
            <figcaption className="text-center text-sm text-brand">
              小さなおうちに、好きな世界を。
              <span className="ml-1 text-muted-foreground">（イメージ）</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="browse-heading" className="page-shell">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">何を飾ろう？</p>
            <h2 id="browse-heading" className="text-2xl font-bold text-ink">
              ぬいの居場所をさがす
            </h2>
          </div>
          <Link
            href="/works"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"
          >
            すべての作品
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Box,
              name: "台座",
              detail: "主役を引き立てる、小さなステージ",
              slug: "daiza",
            },
            {
              icon: Armchair,
              name: "家具",
              detail: "ちょこんと座れる、お気に入りの席",
              slug: "kagu",
            },
            {
              icon: ImageIcon,
              name: "背景",
              detail: "ぬい撮りを楽しむ、もうひとつの世界",
              slug: "haikei",
            },
          ].map(({ icon: Icon, name, detail, slug }) => (
            <Link
              key={slug}
              href={`/works?category=${slug}`}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 hover:border-brand"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-ground text-brand">
                <Icon className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block text-lg font-semibold text-ink">
                  {name}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {detail}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-brand" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="how-heading"
        className="border-t border-line bg-white"
      >
        <div className="page-shell">
          <div className="mb-8">
            <p className="mb-1 text-sm text-muted-foreground">はじめての方へ</p>
            <h2 id="how-heading" className="text-2xl font-bold text-ink">
              うちの子に合う作品と出会うまで
            </h2>
          </div>
          <ol className="grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex gap-4">
                <span className="num shrink-0 text-2xl font-semibold text-brand">
                  0{index + 1}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Icon className="size-5 text-brand" aria-hidden />
                    {title}
                  </h3>
                  <p className="max-w-sm text-sm leading-7 text-muted-foreground">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 border-t border-line pt-5 text-sm text-muted-foreground">
            現在は準備公開中です。注文機能はデモで、実際の決済・発送は行いません。
          </p>
        </div>
      </section>
    </>
  );
}
