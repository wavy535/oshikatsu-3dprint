"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { deleteNui, setPrimaryNui, upsertNui } from "@/features/nuis/actions";
import { upsertNuiSchema, type UpsertNuiInput } from "@/features/nuis/schema";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type NuiSize = { id: number; label: string };

type Nui = {
  id: string;
  name: string;
  nui_size_id: number;
  custom_height_mm: number | null;
  note: string | null;
  is_primary: boolean;
  nui_sizes: { id: number; label: string; height_mm: number } | null;
};

export function NuiManager({ nuis, sizes }: { nuis: Nui[]; sizes: NuiSize[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UpsertNuiInput | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(nui: Nui) {
    setEditing({
      id: nui.id,
      name: nui.name,
      nuiSizeId: nui.nui_size_id,
      customHeightMm: nui.custom_height_mm ?? undefined,
      note: nui.note ?? "",
    });
    setDialogOpen(true);
  }

  function handleDelete(id: string) {
    if (!window.confirm("このマイぬいを削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteNui(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
    });
  }

  function handleSetPrimary(id: string) {
    startTransition(async () => {
      const result = await setPrimaryNui(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("主役ぬいを設定しました");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={<Button onClick={openCreate}>マイぬいを追加</Button>}
          />
          <NuiFormDialog
            sizes={sizes}
            defaultValues={editing}
            onSaved={() => setDialogOpen(false)}
          />
        </Dialog>
      </div>

      {nuis.length === 0 && (
        <p className="text-sm text-muted-foreground">まだマイぬいが登録されていません</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {nuis.map((nui) => (
          <Card key={nui.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{nui.name}</span>
                {nui.is_primary && <Badge>主役ぬい</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {nui.nui_sizes?.label ?? "サイズ未設定"}
                {nui.custom_height_mm ? `（実寸 ${nui.custom_height_mm}mm）` : ""}
              </p>
              {nui.note && <p className="text-sm">{nui.note}</p>}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(nui)}>
                  編集
                </Button>
                {!nui.is_primary && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleSetPrimary(nui.id)}
                  >
                    主役に設定
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDelete(nui.id)}
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

function NuiFormDialog({
  sizes,
  defaultValues,
  onSaved,
}: {
  sizes: NuiSize[];
  defaultValues?: UpsertNuiInput;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const form = useForm<UpsertNuiInput>({
    resolver: zodResolver(upsertNuiSchema),
    values: defaultValues ?? { name: "", nuiSizeId: sizes[0]?.id, note: "" },
  });

  async function onSubmit(values: UpsertNuiInput) {
    setPending(true);
    const result = await upsertNui(values);
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
        <DialogTitle>{defaultValues?.id ? "マイぬいを編集" : "マイぬいを追加"}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名前</FormLabel>
                <FormControl>
                  <Input placeholder="うちの子" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nuiSizeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>サイズ</FormLabel>
                <Select
                  value={field.value != null ? String(field.value) : undefined}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sizes.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="customHeightMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>実寸（mm・任意）</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>メモ（任意）</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
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
