"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { upsertPayoutAccount } from "@/features/payouts/actions";
import { upsertPayoutAccountSchema, type UpsertPayoutAccountInput } from "@/features/payouts/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AccountStatus = {
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_holder_kana: string;
  updated_at: string;
} | null;

export function PayoutAccountForm({ account }: { account: AccountStatus }) {
  const [pending, setPending] = useState(false);
  const form = useForm<UpsertPayoutAccountInput>({
    resolver: zodResolver(upsertPayoutAccountSchema),
    defaultValues: {
      bankName: "",
      bankCode: "",
      branchName: "",
      branchCode: "",
      accountType: "ordinary",
      accountNumber: "",
      accountHolderKana: "",
    },
  });

  async function onSubmit(values: UpsertPayoutAccountInput) {
    setPending(true);
    const result = await upsertPayoutAccount(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("口座情報を保存しました");
    form.reset(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>振込先口座</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {account ? (
          <p className="text-sm text-muted-foreground">
            登録済み: {account.bank_name} {account.branch_name} (
            {account.account_type === "ordinary" ? "普通" : "当座"}) 名義:{" "}
            {account.account_holder_kana}
            <br />
            口座番号を変更する場合は下記フォームに再入力してください（セキュリティのため既存の番号は表示されません）。
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">まだ口座が登録されていません。</p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>銀行名</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bankCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>銀行コード</FormLabel>
                    <FormControl>
                      <Input placeholder="0001" maxLength={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="branchName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>支店名</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="branchCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>支店コード</FormLabel>
                    <FormControl>
                      <Input placeholder="001" maxLength={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>預金種目</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ordinary">普通</SelectItem>
                      <SelectItem value="checking">当座</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>口座番号</FormLabel>
                  <FormControl>
                    <Input placeholder="1234567" maxLength={7} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accountHolderKana"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>口座名義（カナ）</FormLabel>
                  <FormControl>
                    <Input placeholder="ｵｼｶﾂ ﾀﾛｳ" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "保存中..." : "口座情報を保存"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
