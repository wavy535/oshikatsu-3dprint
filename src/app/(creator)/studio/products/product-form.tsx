"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createProduct, updateProduct } from "@/features/products/actions";
import {
  createProductSchema,
  type CreateProductInput,
} from "@/features/products/schema";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type MasterData = {
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  nuiSizes: { id: number; label: string }[];
  filaments: { id: number; name: string; color_hex: string }[];
};

export function ProductForm({
  productId,
  defaultValues,
  master,
}: {
  productId?: string;
  defaultValues?: CreateProductInput;
  master: MasterData;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: defaultValues ?? {
      title: "",
      description: "",
      categoryId: master.categories[0]?.id,
      basePrice: 1000,
      nuiSizeIds: [],
      tagIds: [],
      filamentIds: [],
      defaultFilamentId: undefined,
      printNote: "",
    },
  });

  const filamentIds = useWatch({ control: form.control, name: "filamentIds" }) ?? [];
  const defaultFilamentId = useWatch({ control: form.control, name: "defaultFilamentId" });
  const nuiSizeIds = useWatch({ control: form.control, name: "nuiSizeIds" }) ?? [];
  const tagIds = useWatch({ control: form.control, name: "tagIds" }) ?? [];

  async function onSubmit(values: CreateProductInput) {
    setPending(true);

    if (productId) {
      const result = await updateProduct(productId, values);
      setPending(false);
      if (!result.ok) {
        toast.error(result.error);
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof CreateProductInput, { message: messages?.[0] });
          }
        }
        return;
      }
      toast.success("更新しました");
      return;
    }

    const result = await createProduct(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof CreateProductInput, { message: messages?.[0] });
        }
      }
      return;
    }
    toast.success("作品を作成しました");
    router.push(`/studio/products/${result.data.id}/edit`);
    router.refresh();
  }

  function toggleFilament(id: number, checked: boolean) {
    const next = checked ? [...filamentIds, id] : filamentIds.filter((v) => v !== id);
    form.setValue("filamentIds", next, { shouldValidate: true });
    if (!checked && defaultFilamentId === id) {
      form.setValue("defaultFilamentId", next[0], { shouldValidate: true });
    }
    if (checked && defaultFilamentId == null) {
      form.setValue("defaultFilamentId", id, { shouldValidate: true });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>タイトル</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>説明</FormLabel>
              <FormControl>
                <Textarea rows={6} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>カテゴリ</FormLabel>
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
                    {master.categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
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
            name="basePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>価格（税込・円）</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormItem>
          <FormLabel>対応サイズ</FormLabel>
          <div className="flex flex-wrap gap-4">
            {master.nuiSizes.map((size) => {
              const checked = nuiSizeIds.includes(size.id);
              return (
                <label key={size.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const current = form.getValues("nuiSizeIds") ?? [];
                      const next = v
                        ? [...current, size.id]
                        : current.filter((id) => id !== size.id);
                      form.setValue("nuiSizeIds", next, { shouldValidate: true });
                    }}
                  />
                  {size.label}
                </label>
              );
            })}
          </div>
          <FormMessage>{form.formState.errors.nuiSizeIds?.message}</FormMessage>
        </FormItem>

        <FormItem>
          <FormLabel>タグ（任意・最大10）</FormLabel>
          <div className="flex flex-wrap gap-4">
            {master.tags.map((tag) => {
              const checked = tagIds.includes(tag.id);
              return (
                <label key={tag.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const current = form.getValues("tagIds") ?? [];
                      const next = v
                        ? [...current, tag.id]
                        : current.filter((id) => id !== tag.id);
                      form.setValue("tagIds", next, { shouldValidate: true });
                    }}
                  />
                  {tag.name}
                </label>
              );
            })}
          </div>
          <FormMessage>{form.formState.errors.tagIds?.message}</FormMessage>
        </FormItem>

        <FormItem>
          <FormLabel>選べるフィラメント（色）</FormLabel>
          <FormDescription>
            購入者が選べる色を選択し、既定の色をひとつ選んでください
          </FormDescription>
          <RadioGroup
            value={defaultFilamentId != null ? String(defaultFilamentId) : undefined}
            onValueChange={(v) => form.setValue("defaultFilamentId", Number(v), { shouldValidate: true })}
            className="flex flex-col gap-2"
          >
            {master.filaments.map((f) => {
              const checked = filamentIds.includes(f.id);
              return (
                <div key={f.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleFilament(f.id, Boolean(v))}
                  />
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: f.color_hex }}
                  />
                  <span className="flex-1">{f.name}</span>
                  {checked && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RadioGroupItem value={String(f.id)} />
                      既定
                    </label>
                  )}
                </div>
              );
            })}
          </RadioGroup>
          <FormMessage>{form.formState.errors.filamentIds?.message}</FormMessage>
          <FormMessage>{form.formState.errors.defaultFilamentId?.message}</FormMessage>
        </FormItem>

        <div className="grid grid-cols-4 gap-4">
          <FormField
            control={form.control}
            name="sizeWMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>幅(mm)</FormLabel>
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
            name="sizeDMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>奥行(mm)</FormLabel>
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
            name="sizeHMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>高さ(mm)</FormLabel>
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
            name="estWeightG"
            render={({ field }) => (
              <FormItem>
                <FormLabel>重量(g)</FormLabel>
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
        </div>

        <FormField
          control={form.control}
          name="printNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>出力メモ（任意・Adminのみ閲覧）</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "保存中..." : productId ? "更新する" : "作成する"}
        </Button>
      </form>
    </Form>
  );
}
