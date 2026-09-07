// 手動作成の型定義（簡易版）。
// 本番運用時は `supabase gen types typescript --project-id <ref> > src/types/database.ts`
// で実スキーマから自動生成し直してください。

export type UserRole = "buyer" | "creator" | "admin";
export type TagType = "category" | "nui_size" | "worldview";
export type WorkStatus = "draft" | "published" | "archived";
export type OrderStatus =
  | "payment_pending"
  | "paid"
  | "printing_queued"
  | "printing"
  | "packaging"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";
export type CustomRequestStatus = "pending" | "responded" | "accepted" | "declined";
export type PayoutStatus = "requested" | "processing" | "paid" | "rejected";
export type CreatorApplicationStatus = "pending" | "approved" | "rejected";
export type ModelFileFormat = "3mf" | "stl";
export type ValidationStatus = "pending" | "passed" | "warning" | "failed";
export type IssueSeverity = "ok" | "warning" | "error";
export type PrintOrientation = "flat" | "upright" | "tilted" | "as_is";
export type SupportMode = "none" | "auto" | "custom";
export type FilamentMaterial = "PLA" | "PETG" | "ABS" | "TPU";
export type PrintFeeBilling = "bundled" | "separate";
export type NotificationKind =
  | "order_shipping"
  | "favorite_price"
  | "message"
  | "review"
  | "creator"
  | "announcement";
export type NotificationDigest = "instant" | "daily";
export type NuiKind = "plush" | "acrylic_stand" | "figure" | "other";
export type ScanStatus = "capturing" | "generating" | "ready" | "failed";
export type FitVerdict = "too_small" | "tight" | "good" | "loose" | "unknown";
export type TryonView = "front" | "angle" | "side" | "scale";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          sns_links: Record<string, string>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          display_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      addresses: {
        Row: {
          id: string;
          user_id: string;
          recipient_name: string;
          postal_code: string;
          prefecture: string;
          city: string;
          address_line: string;
          phone: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["addresses"]["Row"]> & {
          user_id: string;
          recipient_name: string;
          postal_code: string;
          prefecture: string;
          city: string;
          address_line: string;
          phone: string;
        };
        Update: Partial<Database["public"]["Tables"]["addresses"]["Row"]>;
        Relationships: [];
      };
      works: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          description: string;
          price: number;
          stock_limit: number | null;
          status: WorkStatus;
          stl_storage_path: string;
          filament_material: string;
          filament_color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["works"]["Row"]> & {
          creator_id: string;
          title: string;
          price: number;
          stl_storage_path: string;
          filament_material: string;
          filament_color: string;
        };
        Update: Partial<Database["public"]["Tables"]["works"]["Row"]>;
        Relationships: [];
      };
      work_images: {
        Row: { id: string; work_id: string; storage_path: string; sort_order: number };
        Insert: Partial<Database["public"]["Tables"]["work_images"]["Row"]> & {
          work_id: string;
          storage_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_images"]["Row"]>;
        Relationships: [];
      };
      tags: {
        Row: { id: string; type: TagType; name: string; slug: string; sort_order: number };
        Insert: Partial<Database["public"]["Tables"]["tags"]["Row"]> & {
          type: TagType;
          name: string;
          slug: string;
        };
        Update: Partial<Database["public"]["Tables"]["tags"]["Row"]>;
        Relationships: [];
      };
      work_tags: {
        Row: { work_id: string; tag_id: string };
        Insert: { work_id: string; tag_id: string };
        Update: Partial<{ work_id: string; tag_id: string }>;
        Relationships: [];
      };
      carts: {
        Row: { id: string; user_id: string; created_at: string };
        Insert: { id?: string; user_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["carts"]["Row"]>;
        Relationships: [];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          work_id: string;
          quantity: number;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["cart_items"]["Row"]> & {
          cart_id: string;
          work_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["cart_items"]["Row"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          buyer_id: string;
          status: OrderStatus;
          subtotal_amount: number;
          platform_fee_amount: number;
          print_cost_amount: number;
          total_amount: number;
          shipping_address_id: string | null;
          stripe_payment_intent_id: string | null;
          tracking_number: string | null;
          shipped_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]> & {
          buyer_id: string;
          subtotal_amount: number;
          total_amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          work_id: string;
          creator_id: string;
          unit_price: number;
          quantity: number;
          creator_payout_amount: number;
          platform_fee_amount: number;
          print_cost_amount: number;
          stl_storage_path_snapshot: string;
          filament_material_snapshot: string;
          filament_color_snapshot: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["order_items"]["Row"]> & {
          order_id: string;
          work_id: string;
          creator_id: string;
          unit_price: number;
          quantity: number;
          creator_payout_amount: number;
          platform_fee_amount: number;
          print_cost_amount: number;
          stl_storage_path_snapshot: string;
          filament_material_snapshot: string;
          filament_color_snapshot: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Row"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          order_item_id: string;
          reviewer_id: string;
          work_id: string;
          creator_id: string;
          rating: number;
          comment: string | null;
          photo_storage_path: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["reviews"]["Row"]> & {
          order_item_id: string;
          reviewer_id: string;
          work_id: string;
          creator_id: string;
          rating: number;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Row"]>;
        Relationships: [];
      };
      creator_applications: {
        Row: {
          id: string;
          user_id: string;
          status: CreatorApplicationStatus;
          message: string;
          admin_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["creator_applications"]["Row"]> & {
          user_id: string;
          message: string;
        };
        Update: Partial<Database["public"]["Tables"]["creator_applications"]["Row"]>;
        Relationships: [];
      };
      work_assets: {
        Row: {
          id: string;
          work_id: string;
          storage_path: string;
          file_name: string;
          file_format: ModelFileFormat;
          file_size_bytes: number;
          unit: string;
          object_count: number;
          triangle_count: number | null;
          vertex_count: number | null;
          total_volume_cm3: number | null;
          total_surface_area_cm2: number | null;
          bbox_x_mm: number | null;
          bbox_y_mm: number | null;
          bbox_z_mm: number | null;
          validation_status: ValidationStatus;
          validated_at: string | null;
          is_primary: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_assets"]["Row"]> & {
          work_id: string;
          storage_path: string;
          file_name: string;
          file_format: ModelFileFormat;
          file_size_bytes: number;
        };
        Update: Partial<Database["public"]["Tables"]["work_assets"]["Row"]>;
        Relationships: [];
      };
      work_asset_objects: {
        Row: {
          id: string;
          asset_id: string;
          object_index: number;
          name: string;
          triangle_count: number | null;
          bbox_x_mm: number;
          bbox_y_mm: number;
          bbox_z_mm: number;
          volume_cm3: number;
          surface_area_cm2: number | null;
          is_manifold: boolean;
          open_edge_count: number;
          flipped_normal_count: number;
          self_intersection_count: number;
          min_wall_thickness_mm: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_asset_objects"]["Row"]> & {
          asset_id: string;
          object_index: number;
          name: string;
          bbox_x_mm: number;
          bbox_y_mm: number;
          bbox_z_mm: number;
          volume_cm3: number;
        };
        Update: Partial<Database["public"]["Tables"]["work_asset_objects"]["Row"]>;
        Relationships: [];
      };
      work_validation_issues: {
        Row: {
          id: string;
          asset_id: string;
          object_id: string | null;
          code: string;
          severity: IssueSeverity;
          message: string;
          detail: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_validation_issues"]["Row"]> & {
          asset_id: string;
          code: string;
          severity: IssueSeverity;
          message: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_validation_issues"]["Row"]>;
        Relationships: [];
      };
      work_color_slots: {
        Row: {
          id: string;
          work_id: string;
          asset_id: string;
          slot_index: number;
          source_name: string;
          source_hex: string;
          face_count: number | null;
          filament_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_color_slots"]["Row"]> & {
          work_id: string;
          asset_id: string;
          slot_index: number;
          source_name: string;
          source_hex: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_color_slots"]["Row"]>;
        Relationships: [];
      };
      work_part_instructions: {
        Row: {
          id: string;
          work_id: string;
          object_id: string;
          variant_id: string | null;
          orientation: PrintOrientation;
          no_rotate: boolean;
          support: SupportMode;
          support_note: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_part_instructions"]["Row"]> & {
          work_id: string;
          object_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_part_instructions"]["Row"]>;
        Relationships: [];
      };
      work_variants: {
        Row: {
          id: string;
          work_id: string;
          size_label: string;
          nui_size_cm: number | null;
          scale_ratio: number;
          is_base: boolean;
          asset_id: string | null;
          bbox_x_mm: number | null;
          bbox_y_mm: number | null;
          bbox_z_mm: number | null;
          max_part_bbox_x_mm: number | null;
          max_part_bbox_y_mm: number | null;
          max_part_bbox_z_mm: number | null;
          oversized_parts: string[];
          est_filament_grams: number | null;
          est_print_hours: number | null;
          part_count: number;
          batch_count: number;
          batch_count_override: number | null;
          print_fee_jpy: number | null;
          price_jpy: number | null;
          stock: number | null;
          is_listed: boolean;
          is_printable: boolean;
          unprintable_reason: string | null;
          // ぬいが収まる内寸（外形 bbox とは別物。相性判定はこちらを使う）
          fit_width_mm: number | null;
          fit_height_mm: number | null;
          fit_depth_mm: number | null;
          fit_source: "creator" | "auto";
          fit_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_variants"]["Row"]> & {
          work_id: string;
          size_label: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_variants"]["Row"]>;
        Relationships: [];
      };
      filaments: {
        Row: {
          id: string;
          material: FilamentMaterial;
          color_name: string;
          color_hex: string;
          stock_grams: number;
          price_per_gram: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["filaments"]["Row"]> & {
          material: FilamentMaterial;
          color_name: string;
          color_hex: string;
        };
        Update: Partial<Database["public"]["Tables"]["filaments"]["Row"]>;
        Relationships: [];
      };
      print_pricing_rules: {
        Row: {
          id: string;
          effective_from: string;
          material_yen_per_gram: number;
          machine_yen_per_hour: number;
          handling_base_yen: number;
          handling_per_part_yen: number;
          platform_fee_rate: number;
          bed_x_mm: number;
          bed_y_mm: number;
          bed_z_mm: number;
          max_batch_hours: number;
          fee_billing: PrintFeeBilling;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["print_pricing_rules"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["print_pricing_rules"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          kind: NotificationKind;
          title: string;
          body: string | null;
          link_path: string;
          source_table: string | null;
          source_id: string | null;
          read_at: string | null;
          emailed_at: string | null;
          pushed_at: string | null;
          created_at: string;
        };
        Insert: never; // 作成はトリガーのみ
        Update: Pick<Database["public"]["Tables"]["notifications"]["Row"], "read_at">;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          kind: NotificationKind;
          in_app: boolean;
          email: boolean;
          push: boolean;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_preferences"]["Row"]> & {
          user_id: string;
          kind: NotificationKind;
        };
        Update: Partial<Database["public"]["Tables"]["notification_preferences"]["Row"]>;
        Relationships: [];
      };
      notification_settings: {
        Row: {
          user_id: string;
          email_to: string | null;
          digest: NotificationDigest;
          digest_hour: number;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_settings"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_settings"]["Row"]>;
        Relationships: [];
      };
      nui_profiles: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: NuiKind;
          sit_height_mm: number;
          shoulder_width_mm: number | null;
          hug_width_mm: number | null;
          nui_size_cm: number | null;
          is_main: boolean;
          has_scan: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["nui_profiles"]["Row"]> & {
          user_id: string;
          name: string;
          sit_height_mm: number;
        };
        Update: Partial<Database["public"]["Tables"]["nui_profiles"]["Row"]>;
        Relationships: [];
      };
      nui_scans: {
        Row: {
          id: string;
          nui_id: string | null;
          user_id: string;
          provider: string;
          external_session_id: string | null;
          shot_count: number;
          status: ScanStatus;
          duration_ms: number | null;
          error_message: string | null;
          measured_sit_height_mm: number | null;
          measured_shoulder_width_mm: number | null;
          measured_hug_width_mm: number | null;
          measure_confidence: number | null;
          photos_expire_at: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["nui_scans"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["nui_scans"]["Row"]>;
        Relationships: [];
      };
      nui_assets: {
        Row: {
          id: string;
          scan_id: string | null;
          nui_id: string;
          kind: "photo" | "model_glb" | "cutout_png" | "thumbnail";
          storage_path: string;
          bytes: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["nui_assets"]["Row"]> & {
          nui_id: string;
          kind: "photo" | "model_glb" | "cutout_png" | "thumbnail";
          storage_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["nui_assets"]["Row"]>;
        Relationships: [];
      };
      tryon_renders: {
        Row: {
          id: string;
          nui_id: string;
          variant_id: string;
          view: TryonView;
          storage_path: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tryon_renders"]["Row"]> & {
          nui_id: string;
          variant_id: string;
          view: TryonView;
          storage_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["tryon_renders"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      tag_type: TagType;
      work_status: WorkStatus;
      order_status: OrderStatus;
      custom_request_status: CustomRequestStatus;
      payout_status: PayoutStatus;
      creator_application_status: CreatorApplicationStatus;
      model_file_format: ModelFileFormat;
      validation_status: ValidationStatus;
      issue_severity: IssueSeverity;
      print_orientation: PrintOrientation;
      support_mode: SupportMode;
      filament_material: FilamentMaterial;
      print_fee_billing: PrintFeeBilling;
      notification_kind: NotificationKind;
      notification_digest: NotificationDigest;
      nui_kind: NuiKind;
      scan_status: ScanStatus;
      fit_verdict: FitVerdict;
    };
    CompositeTypes: Record<string, never>;
  };
}
