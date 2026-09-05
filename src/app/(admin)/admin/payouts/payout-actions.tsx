"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminExportPayoutCsv, adminMarkPayoutPaid } from "@/features/payouts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_LABEL: Record<string, string> = {
  unpaid: "未払い",
  scheduled: "支払予定",
  paid: "支払済み",
  failed: "失敗",
};

type Payout = {
  id: string;
  creator_id: string;
  period_start: string;
  period_end: string;
  net_amount: number;
  status: string;
  scheduled_date: string | null;
  paid_at: string | null;
  profiles: { handle: string; display_name: string } | null;
};

function yen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function downloadCsv(csv: string, filename: string) {
  // Shift_JIS ではなく UTF-8(BOM付き) で出力。Excel での文字化けを防ぐため BOM を付与。
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PayoutTable({ payouts }: { payouts: Payout[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [markingPayout, setMarkingPayout] = useState<Payout | null>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const unpaidSelectable = payouts.filter((p) => p.status === "unpaid" || p.status === "scheduled");

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(unpaidSelectable.map((p) => p.id)) : new Set());
  }

  function handleExport() {
    if (selected.size === 0) {
      toast.error("対象を選択してください");
      return;
    }
    startTransition(async () => {
      const result = await adminExportPayoutCsv({ payoutIds: Array.from(selected) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      downloadCsv(result.data.csv, result.data.filename);
      toast.success("CSVを出力しました");
    });
  }

  function openMarkPaid(payout: Payout) {
    setMarkingPayout(payout);
    setTransactionRef("");
    setDialogOpen(true);
  }

  function handleMarkPaid() {
    if (!markingPayout) return;
    if (!transactionRef.trim()) {
      toast.error("振込参照番号を入力してください");
      return;
    }
    startTransition(async () => {
      const result = await adminMarkPayoutPaid({
        payoutId: markingPayout.id,
        transactionRef: transactionRef.trim(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("支払完了として記録しました");
      setDialogOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" disabled={isPending || selected.size === 0} onClick={handleExport}>
          選択した{selected.size || ""}件をCSV出力
        </Button>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  checked={unpaidSelectable.length > 0 && selected.size === unpaidSelectable.length}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                />
              </TableHead>
              <TableHead>クリエイター</TableHead>
              <TableHead>対象期間</TableHead>
              <TableHead>振込額</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {(p.status === "unpaid" || p.status === "scheduled") && (
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={(v) => toggle(p.id, Boolean(v))}
                    />
                  )}
                </TableCell>
                <TableCell>{p.profiles?.display_name ?? p.creator_id}</TableCell>
                <TableCell>
                  {p.period_start} 〜 {p.period_end}
                </TableCell>
                <TableCell>{yen(p.net_amount)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "paid" ? "default" : "outline"}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(p.status === "unpaid" || p.status === "scheduled") && (
                    <DialogTrigger
                      render={
                        <Button size="sm" variant="outline" onClick={() => openMarkPaid(p)}>
                          支払完了にする
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>支払完了の記録</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {markingPayout?.profiles?.display_name} への {markingPayout && yen(markingPayout.net_amount)} の振込を完了として記録します。
          </p>
          <Input
            placeholder="振込参照番号（銀行の取引番号など）"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
          />
          <DialogFooter>
            <Button disabled={isPending} onClick={handleMarkPaid}>
              記録する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
