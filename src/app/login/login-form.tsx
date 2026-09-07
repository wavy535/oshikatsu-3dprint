"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const emailSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
});

type Mode = "login" | "signup";

/**
 * Figma 46:122 の認証カード。タブは「ログイン / 新規会員登録」の 2 枚だが、
 * 実際の認証はどちらもマジックリンク（パスワード認証は用意していない）なので、
 * タブは文言だけを切り替える。
 */
export function LoginForm({
  next,
  defaultMode = "login",
}: {
  next: string;
  defaultMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const form = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof emailSchema>) {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    });
    setPending(false);
    if (error) {
      toast.error("ログインリンクの送信に失敗しました");
      return;
    }
    setSentTo(values.email);
  }

  async function onGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      toast.error("Googleログインに失敗しました");
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-ok-bg">
          <MailCheck className="size-5 text-ok" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">メールを送信しました</p>
        <p className="text-xs leading-5 text-muted-foreground">
          {sentTo} 宛にログイン用のリンクを送りました。
          <br />
          メール内のリンクを開くとログインが完了します。
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSentTo(null)}
        >
          別のメールアドレスで試す
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="認証の種類"
        className="flex gap-1 rounded-lg bg-ground p-1"
      >
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-[13px] font-medium transition-colors",
              mode === m
                ? "bg-white text-ink shadow-sm"
                : "text-muted-foreground hover:text-ink"
            )}
          >
            {m === "login" ? "ログイン" : "新規会員登録"}
          </button>
        ))}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        {mode === "login"
          ? "登録済みのメールアドレスにログイン用リンクを送ります。"
          : "メールアドレスを入力すると、そのまま会員登録が完了します。"}
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>メールアドレス</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            <Mail />
            {pending
              ? "送信中..."
              : mode === "login"
                ? "ログインリンクを送信"
                : "登録用リンクを送信"}
          </Button>
        </form>
      </Form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] text-muted-foreground">または</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onGoogle}
        className="w-full"
      >
        Google で続ける
      </Button>

      <p className="text-[10px] leading-4 text-muted-foreground">
        続行することで、利用規約およびプライバシーポリシーに同意したものとみなされます。
      </p>
    </div>
  );
}
