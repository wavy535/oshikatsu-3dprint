"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateProfile } from "@/features/auth/actions";
import { updateProfileSchema, type UpdateProfileInput } from "@/features/auth/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ProfileForm({ defaultValues }: { defaultValues: UpdateProfileInput }) {
  const [pending, setPending] = useState(false);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues,
  });

  async function onSubmit(values: UpdateProfileInput) {
    setPending(true);
    const result = await updateProfile(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof UpdateProfileInput, {
            message: messages?.[0],
          });
        }
      }
      return;
    }
    toast.success("プロフィールを更新しました");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="handle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ハンドル（URL用ID）</FormLabel>
              <FormControl>
                <Input placeholder="my_handle" {...field} />
              </FormControl>
              <FormDescription>
                半角英小文字・数字・アンダースコアで3〜20文字
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>表示名</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>自己紹介</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="emailOptIn"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="font-normal">お知らせメールを受け取る</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "保存中..." : "保存する"}
        </Button>
      </form>
    </Form>
  );
}
