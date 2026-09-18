import Link from "next/link";

import {
  CREATOR_TERMS,
  CREATOR_TERMS_TITLE,
  CREATOR_TERMS_VERSION,
} from "@/lib/creator/terms";

export const metadata = { title: CREATOR_TERMS_TITLE };

/** クリエイター利用規約の全文。申請フォームの同意欄と同じ内容（src/lib/creator/terms.ts）。 */
export default function CreatorTermsPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 py-10">
      <h1 className="text-xl font-bold text-ink">{CREATOR_TERMS_TITLE}</h1>
      <p className="num mt-1 text-[12px] text-muted-foreground">{CREATOR_TERMS_VERSION} 版</p>

      <div className="mt-6 flex flex-col gap-6 rounded-2xl border border-line bg-white p-7">
        {CREATOR_TERMS.map((s) => (
          <section key={s.heading}>
            <h2 className="text-[14px] font-bold text-ink">{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-[13px] leading-6 text-ink">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-muted-foreground">
        クリエイター登録は{" "}
        <Link href="/creator/apply" className="text-brand hover:underline">
          こちら
        </Link>
        から。
      </p>
    </div>
  );
}
