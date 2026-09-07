"use client";

import { useActionState, useState } from "react";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";

import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
  type AddressActionState,
} from "@/lib/addresses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AddressActionState = { error: null };

export type Address = {
  id: string;
  recipient_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line: string;
  phone: string;
  is_default: boolean;
};

function AddressForm({ address, onDone }: { address?: Address; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(saveAddressAction, initialState);

  // 保存に成功したら閉じる（サーバー側で revalidate 済み）
  if (state.ok) onDone();

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      {address && <input type="hidden" name="id" value={address.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipientName">お名前</Label>
        <Input id="recipientName" name="recipientName" defaultValue={address?.recipient_name} required />
      </div>

      <div className="flex gap-3">
        <div className="flex w-40 flex-col gap-1.5">
          <Label htmlFor="postalCode">郵便番号</Label>
          <Input id="postalCode" name="postalCode" defaultValue={address?.postal_code} placeholder="1500001" required />
        </div>
        <div className="flex w-40 flex-col gap-1.5">
          <Label htmlFor="prefecture">都道府県</Label>
          <Input id="prefecture" name="prefecture" defaultValue={address?.prefecture} placeholder="東京都" required />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="city">市区町村</Label>
          <Input id="city" name="city" defaultValue={address?.city} placeholder="渋谷区" required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addressLine">番地・建物名</Label>
        <Input id="addressLine" name="addressLine" defaultValue={address?.address_line} required />
      </div>

      <div className="flex w-52 flex-col gap-1.5">
        <Label htmlFor="phone">電話番号</Label>
        <Input id="phone" name="phone" defaultValue={address?.phone} placeholder="09000000000" required />
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-ink">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.is_default ?? true}
          className="size-4 accent-brand"
        />
        既定の配送先にする
      </label>

      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存しています..." : "保存する"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          やめる
        </Button>
      </div>
    </form>
  );
}

function AddressRow({ address }: { address: Address }) {
  const [editing, setEditing] = useState(false);
  const [defState, setDefault, settingDefault] = useActionState(setDefaultAddressAction, initialState);
  const [delState, remove, removing] = useActionState(deleteAddressAction, initialState);

  if (editing) return <AddressForm address={address} onDone={() => setEditing(false)} />;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-semibold text-ink">{address.recipient_name}</p>
        {address.is_default ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-star">
            <Star className="size-3.5 fill-star" aria-hidden />
            既定
          </span>
        ) : (
          <form action={setDefault}>
            <input type="hidden" name="id" value={address.id} />
            <button
              type="submit"
              disabled={settingDefault}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-ink"
            >
              <Star className="size-3.5" aria-hidden />
              既定にする
            </button>
          </form>
        )}
      </div>

      <p className="text-[12px] leading-5 text-muted-foreground">
        <span className="num">〒{address.postal_code}</span>
        <br />
        {address.prefecture}
        {address.city}
        {address.address_line}
        <br />
        <span className="num">{address.phone}</span>
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11.5px] text-brand hover:underline"
        >
          編集する
        </button>
        <form action={remove} className="ml-auto">
          <input type="hidden" name="id" value={address.id} />
          <button
            type="submit"
            disabled={removing}
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-danger"
          >
            <Trash2 className="size-3.5" aria-hidden />
            削除
          </button>
        </form>
      </div>

      {(defState.error || delState.error) && (
        <p className="text-[11px] text-danger">{defState.error ?? delState.error}</p>
      )}
    </div>
  );
}

/** Figma ④マイページ「配送先・お支払い」の配送先側。 */
export function AddressManager({ addresses }: { addresses: Address[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {addresses.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-12 text-center">
          <MapPin className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">配送先が登録されていません</p>
        </div>
      )}

      {addresses.map((a) => (
        <AddressRow key={a.id} address={a} />
      ))}

      {adding ? (
        <AddressForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          配送先を追加
        </Button>
      )}
    </div>
  );
}
