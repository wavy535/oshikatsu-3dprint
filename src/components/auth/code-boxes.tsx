"use client";

import { useRef } from "react";

/**
 * 6桁の確認コード入力。1マス1文字で、入力すると次のマスへ進み、
 * 空のマスで Backspace を押すと前へ戻る（プロトタイプの挙動に合わせている）。
 * 貼り付けにも対応する（6桁まとめて入る）。
 *
 * メールの確認コード（新規登録）と SMS の認証コード（クリエイター申請）で共用。
 */
export function CodeBoxes({
  digits,
  onChange,
  label = "確認コード",
}: {
  digits: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    onChange(next);
  }

  return (
    <div className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`${label} ${i + 1}文字目`}
          className="h-12 w-11 rounded-lg border border-line bg-white text-center text-lg font-semibold text-ink outline-none focus:border-brand focus:ring-3 focus:ring-brand/20"
          onChange={(e) => {
            const chars = e.target.value.replace(/\D/g, "");
            if (!chars) return setDigit(i, "");
            if (chars.length > 1) {
              const next = [...digits];
              for (let k = 0; k < chars.length && i + k < 6; k++) next[i + k] = chars[k];
              onChange(next);
              boxes.current[Math.min(i + chars.length, 5)]?.focus();
              return;
            }
            setDigit(i, chars);
            if (i < 5) boxes.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              boxes.current[i - 1]?.focus();
              setDigit(i - 1, "");
            }
          }}
        />
      ))}
    </div>
  );
}
