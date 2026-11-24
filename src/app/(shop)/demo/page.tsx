import type { Metadata } from "next";
import { HouseEditor } from "@/components/design/house-editor";

export const metadata: Metadata = {
  title: "ログイン不要のAIデモ",
  description: "登録なしでAIと話しながら3Dモデルを制作。プレビュー・手動調整・AR・データ出力まで試せます。",
};

export default function DemoPage() {
  return <HouseEditor demo />;
}
