import Link from "next/link";
import { Armchair, ArrowRight, Layers3, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomDiagram } from "@/components/home/room-diagram";

const categories = [
  {
    name: "家具",
    detail: "椅子やソファに座らせる",
    description: "ぬいの座り幅・奥行きに合わせて。",
    slug: "kagu",
    icon: Armchair,
  },
  {
    name: "台座",
    detail: "机や棚に並べて飾る",
    description: "一体ずつ置く台や、段差のあるステージ。",
    slug: "daiza",
    icon: Layers3,
  },
  {
    name: "背景",
    detail: "お部屋をつくって撮影する",
    description: "壁や背景を、置き場所に合わせて。",
    slug: "haikei",
    icon: PanelsTopLeft,
  },
];

export default function HomePage() {
  return (
    <div className="page-shell flex flex-col gap-12 sm:gap-16">
      <section aria-labelledby="home-heading">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="py-2 lg:py-4">
            <p className="mb-4 text-sm font-semibold text-brand">
              推しぬいのための3Dプリントマーケット
            </p>
            <h1
              id="home-heading"
              className="text-4xl font-bold leading-tight sm:text-5xl"
            >
              推しぬいの
              <br />
              <span className="text-brand">おうちと家具。</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-8 text-muted-foreground">
              座らせる椅子、並べる台座、撮影の背景。
              ぬいのサイズと飾る場所に合わせて、3Dプリント作品を探せます。
            </p>

            <form
              action="/works"
              method="get"
              role="search"
              aria-label="サイズとカテゴリから作品を探す"
              className="mt-7 max-w-lg"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="home-nui-size"
                    className="mb-2 block text-sm font-semibold"
                  >
                    ぬいの身長
                  </label>
                  <select
                    id="home-nui-size"
                    name="nuiSize"
                    defaultValue=""
                    className="h-12 w-full rounded-sm border border-input bg-white px-3 text-base"
                  >
                    <option value="">すべて</option>
                    <option value="10">10cm</option>
                    <option value="15">15cm</option>
                    <option value="20">20cm</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="home-category"
                    className="mb-2 block text-sm font-semibold"
                  >
                    探しているもの
                  </label>
                  <select
                    id="home-category"
                    name="category"
                    defaultValue=""
                    className="h-12 w-full rounded-sm border border-input bg-white px-3 text-base"
                  >
                    <option value="">すべて</option>
                    {categories.map(({ name, slug }) => (
                      <option key={slug} value={slug}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button
                type="submit"
                size="lg"
                className="mt-3 w-full justify-between px-5"
              >
                作品をさがす
                <ArrowRight className="size-5" aria-hidden />
              </Button>
            </form>
          </div>

          <figure className="bg-brand p-5 text-white sm:p-6">
            <div className="flex items-center justify-between border-b border-white/40 pb-3 text-sm">
              <span className="font-semibold">ぬいを飾る、小さなお部屋</span>
              <span>構成例</span>
            </div>
            <RoomDiagram />
            <figcaption className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-white/40 pt-3 text-sm">
              <span>背景 ＋ 家具 ＋ 台座</span>
              <span>販売作品ではなくイメージ図です</span>
            </figcaption>
          </figure>
        </div>

        <aside
          aria-label="公開状況"
          className="mt-6 flex flex-col gap-1 border-y border-line py-4 text-sm leading-6 sm:flex-row sm:gap-5"
        >
          <p className="shrink-0 font-semibold text-brand">準備公開中</p>
          <p className="text-muted-foreground">
            会員登録と閲覧をお試しいただけます。注文はデモ機能のため、実際の決済・発送は行いません。
          </p>
        </aside>
      </section>

      <section
        aria-labelledby="browse-heading"
        className="grid gap-6 lg:grid-cols-3 lg:gap-12"
      >
        <div>
          <p className="mb-2 text-sm font-semibold text-brand">作品を選ぶ</p>
          <h2 id="browse-heading" className="text-2xl font-bold">飾り方から探す</h2>
          <p className="mt-3 max-w-xs text-base leading-7 text-muted-foreground">
            家具・台座・背景を組み合わせて、机や棚に飾る空間をつくれます。
          </p>
        </div>
        <nav
          aria-label="カテゴリから探す"
          className="border-t border-ink lg:col-span-2"
        >
          {categories.map(({ name, detail, description, slug, icon: Icon }) => (
            <Link
              key={slug}
              href={`/works?category=${slug}`}
              prefetch={false}
              className="flex min-h-28 items-center gap-4 border-b border-line py-5 hover:text-brand sm:gap-6"
            >
              <Icon
                className="size-8 shrink-0 text-brand sm:size-10"
                strokeWidth={1.5}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-xl font-semibold">{name}</span>
                  <span className="text-sm">{detail}</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0" aria-hidden />
            </Link>
          ))}
        </nav>
      </section>

      <section
        aria-labelledby="size-heading"
        className="grid gap-6 border-t border-line pt-8 lg:grid-cols-3 lg:gap-12"
      >
        <div>
          <p className="mb-2 text-sm font-semibold text-brand">サイズの選び方</p>
          <h2 id="size-heading" className="text-2xl font-bold">ぬいと置き場所を測る</h2>
          <p className="mt-3 max-w-xs text-base leading-7 text-muted-foreground">
            同じ身長のぬいでも、座ったときの大きさは違います。
          </p>
          <Link
            href="/mypage/nuis"
            prefetch={false}
            className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-brand underline underline-offset-4"
          >
            マイぬいのサイズを登録する
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </div>
        <dl className="grid gap-6 sm:grid-cols-2 lg:col-span-2">
          <div className="border-l-2 border-brand pl-5">
            <dt className="text-lg font-semibold">ぬいの幅・奥行き</dt>
            <dd className="mt-3 text-base leading-8 text-muted-foreground">
              座らせた状態で、腕や足も含めて測ります。椅子やおうちの内寸と比べて、収まるかを確認してください。
            </dd>
          </div>
          <div className="border-l-2 border-line pl-5">
            <dt className="text-lg font-semibold">棚や机の空きスペース</dt>
            <dd className="mt-3 text-base leading-8 text-muted-foreground">
              幅・奥行き・高さを作品の外寸と比べます。AR対応作品は、対応するスマートフォンで実寸表示も試せます。
            </dd>
          </div>
        </dl>
      </section>

      <details className="border-y border-line py-3">
        <summary className="cursor-pointer py-3 font-semibold">作品をつくりたい方へ</summary>
        <p className="max-w-3xl pb-3 text-sm leading-7 text-muted-foreground">
          言葉からおうちの形をつくるAIモデリングは開発予定です。現在は利用できません。新規のクリエイター申請も受付を停止しています。
        </p>
      </details>
    </div>
  );
}
