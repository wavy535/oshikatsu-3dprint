"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { registerShipment, updateShipment } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CARRIERS = ["yamato", "sagawa", "japanpost", "other"] as const;
const CARRIER_LABEL: Record<(typeof CARRIERS)[number], string> = {
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
  japanpost: "日本郵便",
  other: "その他",
};

type Shipment = { id: string; carrier: string; tracking_number: string };

export function ShipmentSection({
  orderId,
  status,
  shipments,
}: {
  orderId: string;
  status: string;
  shipments: Shipment[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {shipments.map((s) => (
        <ShipmentRow key={s.id} shipment={s} />
      ))}
      {status === "printing" && <NewShipmentForm orderId={orderId} />}
    </div>
  );
}

function ShipmentRow({ shipment }: { shipment: Shipment }) {
  const [editing, setEditing] = useState(false);
  const [carrier, setCarrier] = useState(shipment.carrier);
  const [trackingNumber, setTrackingNumber] = useState(shipment.tracking_number);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateShipment({
        shipmentId: shipment.id,
        carrier: carrier as (typeof CARRIERS)[number],
        trackingNumber,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("追跡番号を更新しました");
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>
          {CARRIER_LABEL[shipment.carrier as (typeof CARRIERS)[number]] ?? shipment.carrier}:{" "}
          {shipment.tracking_number}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          修正
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={carrier} onValueChange={(v) => v && setCarrier(v)}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CARRIERS.map((c) => (
            <SelectItem key={c} value={c}>
              {CARRIER_LABEL[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
      <Button size="sm" disabled={isPending} onClick={handleSave}>
        保存
      </Button>
    </div>
  );
}

function NewShipmentForm({ orderId }: { orderId: string }) {
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>("yamato");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!trackingNumber) {
      toast.error("追跡番号を入力してください");
      return;
    }
    startTransition(async () => {
      const result = await registerShipment({ orderId, carrier, trackingNumber });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("発送登録しました");
      setTrackingNumber("");
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <Select
        value={carrier}
        onValueChange={(v) => v && setCarrier(v as (typeof CARRIERS)[number])}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CARRIERS.map((c) => (
            <SelectItem key={c} value={c}>
              {CARRIER_LABEL[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="追跡番号"
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
      />
      <Button size="sm" disabled={isPending} onClick={handleSubmit}>
        発送登録
      </Button>
    </div>
  );
}
