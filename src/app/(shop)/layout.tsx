import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ShopFrame } from "@/components/layout/shop-frame";

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShopFrame header={<SiteHeader />} footer={<SiteFooter />}>
      {children}
    </ShopFrame>
  );
}
