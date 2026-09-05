"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  deleteAddress,
  setDefaultAddress,
  upsertAddress,
} from "@/features/addresses/actions";
import { upsertAddressSchema, type UpsertAddressInput } from "@/features/addresses/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type Address = {
  id: string;
  recipient_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line1: string;
  address_line2: string | null;
  phone: string;
  is_default: boolean;
};

export function AddressManager({ addresses }: { addresses: Address[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UpsertAddressInput | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(address: Address) {
    setEditing({
      id: address.id,
      recipientName: address.recipient_name,
      postalCode: address.postal_code,
      prefecture: address.prefecture,
      city: address.city,
      addressLine1: address.address_line1,
      addressLine2: address.address_line2 ?? "",
      phone: address.phone,
    });
    setDialogOpen(true);
  }

  function handleDelete(id: string) {
    if (!window.confirm("この配送先を削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteAddress(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
    });
  }

  function handleSetDefault(id: string) {
    startTransition(async () => {
      const result = await setDefaultAddress(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("既定の配送先を設定しました");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate}>配送先を追加</Button>} />
          <AddressFormDialog defaultValues={editing} onSaved={() => setDialogOpen(false)} />
        </Dialog>
      </div>

      {addresses.length === 0 && (
        <p className="text-sm text-muted-foreground">まだ配送先が登録されていません</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {addresses.map((address) => (
          <Card key={address.id}>
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{address.recipient_name}</span>
                {address.is_default && <Badge>既定</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                〒{address.postal_code} {address.prefecture}
                {address.city}
                {address.address_line1}
                {address.address_line2}
              </p>
              <p className="text-sm text-muted-foreground">{address.phone}</p>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(address)}>
                  編集
                </Button>
                {!address.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleSetDefault(address.id)}
                  >
                    既定に設定
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDelete(address.id)}
                >
                  削除
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AddressFormDialog({
  defaultValues,
  onSaved,
}: {
  defaultValues?: UpsertAddressInput;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const form = useForm<UpsertAddressInput>({
    resolver: zodResolver(upsertAddressSchema),
    values:
      defaultValues ?? {
        recipientName: "",
        postalCode: "",
        prefecture: "",
        city: "",
        addressLine1: "",
        addressLine2: "",
        phone: "",
      },
  });

  async function onSubmit(values: UpsertAddressInput) {
    setPending(true);
    const result = await upsertAddress(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("保存しました");
    onSaved();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{defaultValues?.id ? "配送先を編集" : "配送先を追加"}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="recipientName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>宛名</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="postalCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>郵便番号</FormLabel>
                <FormControl>
                  <Input placeholder="123-4567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="prefecture"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>都道府県</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>市区町村</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="addressLine1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>番地</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="addressLine2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>建物名・部屋番号（任意）</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>電話番号</FormLabel>
                <FormControl>
                  <Input placeholder="09012345678" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中..." : "保存する"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
