"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyCreator } from "@/features/auth/actions";
import { applyCreatorSchema, type ApplyCreatorInput } from "@/features/auth/schema";
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
import { Textarea } from "@/components/ui/textarea";

export function ApplyCreatorForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<ApplyCreatorInput>({
    resolver: zodResolver(applyCreatorSchema),
    defaultValues: {
      legalName: "",
      legalNameKana: "",
      birthDate: "",
      intro: "",
      portfolioUrl: "",
    },
  });

  async function onSubmit(values: ApplyCreatorInput) {
    setPending(true);
    const result = await applyCreator(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof ApplyCreatorInput, { message: messages?.[0] });
        }
      }
      return;
    }
    toast.success("クリエイター申請を送信しました");
    router.push("/mypage");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="legalName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>氏名（本名・非公開）</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="legalNameKana"
          render={({ field }) => (
            <FormItem>
              <FormLabel>フリガナ</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="birthDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>生年月日</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="portfolioUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ポートフォリオURL（任意）</FormLabel>
              <FormControl>
                <Input placeholder="https://" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="intro"
          render={({ field }) => (
            <FormItem>
              <FormLabel>自己紹介（任意）</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "送信中..." : "申請する"}
        </Button>
      </form>
    </Form>
  );
}
