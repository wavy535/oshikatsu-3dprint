import { Step1Uploader } from "@/components/product/step1-uploader";
import { StepNav } from "@/components/product/step-nav";

export const metadata = { title: "作品を投稿（STEP1 3Dデータ）" };

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-ink">作品を投稿する</h1>
        <StepNav current={1} />
      </div>
      <Step1Uploader sizePreview={[]} />
    </div>
  );
}
