import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="page-shell flex flex-col gap-12 sm:gap-16">
      <section className="grid gap-8 border-b border-ink pb-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
        <div>
          <p className="mb-5 text-sm font-semibold text-brand">
            推しぬいのための3Dプリントマーケット
          </p>
          <h1 className="text-3xl font-bold leading-normal sm:text-4xl">
            ぬいのサイズから、
            <br />
            おうちと家具を探す。
          </h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">
            10・15・20cmのぬいぐるみに対応した台座、家具、背景。
            作品ごとの寸法を確かめて、飾る場所に合わせて選べます。
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/works" prefetch={false}>
              作品をさがす
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
        <div className="lg:pt-2">
          <h2 className="mb-2 text-base font-semibold">ぬいの身長で絞り込む</h2>
          <nav
            aria-label="ぬいのサイズから探す"
            className="border-t border-ink"
          >
            {[10, 15, 20].map((size) => (
              <Link
                key={size}
                href={`/works?nuiSize=${size}`}
                prefetch={false}
                className="flex min-h-18 items-center justify-between border-b border-line py-3 hover:text-brand"
              >
                <span>
                  <span className="num text-3xl font-semibold">{size}</span>
                  <span className="ml-2 text-base">cm</span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  対応作品を見る
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            ))}
          </nav>
          <Link
            href="/mypage/nuis"
            prefetch={false}
            className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            マイぬいのサイズを登録する
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="browse-heading"
        className="grid gap-5 lg:grid-cols-[1fr_2fr] lg:gap-12"
      >
        <div>
          <h2 id="browse-heading" className="text-2xl font-bold">
            カテゴリから探す
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            飾りたいものに合わせて。
          </p>
        </div>
        <div className="border-t border-ink">
          {[
            { name: "台座", detail: "ぬいを置く台・ステージ", slug: "daiza" },
            { name: "家具", detail: "椅子・ソファ・テーブル", slug: "kagu" },
            {
              name: "背景",
              detail: "撮影やディスプレイ用の背景",
              slug: "haikei",
            },
          ].map(({ name, detail, slug }) => (
            <Link
              key={slug}
              href={`/works?category=${slug}`}
              prefetch={false}
              className="grid min-h-20 grid-cols-[4rem_1fr_auto] items-center gap-4 border-b border-line py-4 hover:text-brand sm:grid-cols-[6rem_1fr_auto]"
            >
              <span className="text-xl font-semibold">{name}</span>
              <span className="text-sm text-muted-foreground">{detail}</span>
              <ArrowRight className="size-5" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="size-heading"
        className="grid gap-5 border-t border-line pt-8 lg:grid-cols-[1fr_2fr] lg:gap-12"
      >
        <h2 id="size-heading" className="text-2xl font-bold">
          選ぶ前に、寸法を確認
        </h2>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="font-semibold">ぬいの幅・奥行きも測る</dt>
            <dd className="mt-2 text-sm leading-7 text-muted-foreground">
              同じ身長でも体型は異なります。座ったときの幅・奥行きと、作品の内寸を確認してください。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">棚や机に置けるか確かめる</dt>
            <dd className="mt-2 text-sm leading-7 text-muted-foreground">
              作品の外寸を置き場所と照らし合わせます。AR対応作品では、対応するスマートフォンで実寸表示も試せます。
            </dd>
          </div>
        </dl>
      </section>
      <aside
        aria-label="公開状況"
        className="border-l-2 border-brand pl-4 text-sm leading-7"
      >
        <p className="font-semibold">準備公開中</p>
        <p className="text-muted-foreground">
          会員登録・作品の閲覧をお試しいただけます。注文はデモ機能のため、実際の決済・発送は行いません。新規のクリエイター申請は受付を停止しています。
        </p>
      </aside>
    </div>
  );
}
