import { getWorkArPreview } from "@/lib/ar/preview";
import { ArPreview } from "./ar-preview";

/** Keep the product's image, price and purchase controls independent of AR preparation. */
export async function WorkArPanel(props: Parameters<typeof getWorkArPreview>[0]) {
  const preview = await getWorkArPreview(props);
  return <ArPreview {...preview} />;
}

export function WorkArPanelFallback() {
  return (
    <div aria-busy="true" aria-label="AR表示を準備中" className="flex min-h-28 flex-col gap-3 rounded-lg border border-line bg-ground/60 p-3">
      <div className="h-4 w-32 rounded bg-line" />
      <div className="h-8 w-full rounded bg-line/60" />
    </div>
  );
}
