import { Badge } from "@/components/ui/badge";

export function NuiSizeBadge({ label }: { label: string }) {
  return <Badge variant="secondary">{label}対応</Badge>;
}
