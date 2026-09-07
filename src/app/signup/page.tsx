import { redirect } from "next/navigation";

// 新規登録はログイン画面のタブに統合した（Figma 46:122 / 2167:1976）。
export default function SignupPage() {
  redirect("/login?mode=signup");
}
