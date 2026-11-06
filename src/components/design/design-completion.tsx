"use client";

import { Download, Save, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesignSession } from "./use-design-session";
import type { DesignFiles } from "./use-design-files";

type Props = {
  session: DesignSession;
  files: DesignFiles;
  onContinue: () => void;
};

export function DesignCompletion({ session, files, onContinue }: Props) {
  const blocked = session.pending || files.exporting || !!session.buildError;
  const issues = session.pending ? [] : (session.built?.build.issues ?? []);
  const printBlocked =
    blocked || issues.some((issue) => issue.level === "error");

  return (
    <section aria-label="完成したら" className="space-y-5">
      <div>
        <h2 className="text-balance text-xl font-bold">
          できたら、置いてみよう。
        </h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          サイズを確かめて、作品を保存。
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <ScanLine className="size-5 text-brand" aria-hidden />
          1. 飾る場所で確認
        </h3>
        <Button
          className="w-full text-base"
          disabled={blocked}
          onClick={() => void files.exportFile("ar")}
        >
          ARで確認
        </Button>
        <p className="text-pretty text-sm text-muted-foreground">
          対応スマホで実寸表示。PCでは3Dで確認できます。
        </p>
      </div>
      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Save className="size-5 text-brand" aria-hidden />
          2. 作品を残す
        </h3>
        <Button
          variant="outline"
          className="w-full text-base"
          onClick={files.saveLocal}
        >
          この端末に作品を保存
        </Button>
        <Button
          variant="ghost"
          className="w-full whitespace-normal"
          onClick={files.saveJson}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          別の端末でも編集する（JSON）
        </Button>
        <p className="text-pretty text-sm text-muted-foreground">
          端末保存は1件。JSONを残すと、あとから読み込んで編集できます。
        </p>
      </div>
      <details className="border-t border-line">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          3Dプリント・データ出力
        </summary>
        <p className="mb-3 text-pretty text-sm text-muted-foreground">
          3MFのZIPを保存し、部品をスライサーで開いて印刷します。注文・出品は自動では行いません。
        </p>
        <div className="flex flex-col gap-2">
          <Button
            disabled={printBlocked}
            onClick={() => void files.exportFile("3mf")}
          >
            印刷用3MFを保存
          </Button>
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => void files.exportFile("glb")}
          >
            GLBを保存
          </Button>
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => void files.exportFile("usdz")}
          >
            USDZを保存
          </Button>
        </div>
        <h3 className="mt-5 font-semibold">寸法と造形の確認</h3>
        {issues.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.code}
                className={cn(
                  "border-l-2 pl-3 text-sm",
                  issue.level === "error"
                    ? "border-danger text-danger"
                    : "border-warn",
                )}
              >
                {issue.level === "error" ? "要修正：" : "確認："}
                {issue.message}
              </li>
            ))}
          </ul>
        ) : (
          !session.pending && (
            <p className="mt-2 text-sm">自動検査に問題はありません。</p>
          )
        )}
        <p className="mt-3 text-pretty text-sm text-muted-foreground">
          接着組立の試作です。強度・薄い箇所・印刷条件は試し刷りで確認してください。ARにも設置誤差があります。
        </p>
      </details>
      <Button variant="ghost" className="w-full" onClick={onContinue}>
        編集を続ける
      </Button>
    </section>
  );
}
