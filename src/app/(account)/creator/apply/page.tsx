import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getMyCreatorProfile } from "@/features/auth/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplyCreatorForm } from "./apply-form";

export default async function CreatorApplyPage() {
  const { user } = await requireUser();
  const existing = await getMyCreatorProfile(user.id);
  if (existing) {
    redirect("/mypage");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>クリエイター申請</CardTitle>
      </CardHeader>
      <CardContent>
        <ApplyCreatorForm />
      </CardContent>
    </Card>
  );
}
