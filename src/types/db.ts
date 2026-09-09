/** Shared business DTOs, derived from the PostgreSQL schema. */
import type { Insertable, Selectable, Updateable } from "kysely";
import type { Database, DbEnums, DbFunctions, Json } from "./database";
export type { Database, Json };
export type Tables<T extends keyof Database> = Selectable<Database[T]>;
export type TablesInsert<T extends keyof Database> = Insertable<Database[T]>;
export type TablesUpdate<T extends keyof Database> = Updateable<Database[T]>;
export type Enums<T extends keyof DbEnums> = DbEnums[T];
export type FunctionReturns<T extends keyof DbFunctions> = DbFunctions[T]["Returns"];

// ───────── ENUM の別名（画面側はこちらを使う）─────────
export type UserRole = Enums<"user_role">;
export type TagType = Enums<"tag_type">;
export type WorkStatus = Enums<"work_status">;
export type OrderStatus = Enums<"order_status">;
export type CustomRequestStatus = Enums<"custom_request_status">;
export type QuoteStatus = Enums<"quote_status">;
export type PayoutStatus = Enums<"payout_status">;
export type CreatorApplicationStatus = Enums<"creator_application_status">;
export type ModelFileFormat = Enums<"model_file_format">;
export type ValidationStatus = Enums<"validation_status">;
export type IssueSeverity = Enums<"issue_severity">;
export type PrintOrientation = Enums<"print_orientation">;
export type SupportMode = Enums<"support_mode">;
export type FilamentMaterial = Enums<"filament_material">;
export type PrintFeeBilling = Enums<"print_fee_billing">;
export type PrintJobStatus = Enums<"print_job_status">;
export type QcResult = Enums<"qc_result">;
export type ReprintCause = Enums<"reprint_cause">;
export type RevisionStatus = Enums<"revision_status">;
export type RevisionResolution = Enums<"revision_resolution">;
export type ShippingCarrier = Enums<"shipping_carrier">;
export type NotificationKind = Enums<"notification_kind">;
export type NotificationDigest = Enums<"notification_digest">;
export type NuiKind = Enums<"nui_kind">;
export type ScanStatus = Enums<"scan_status">;
export type FitVerdict = Enums<"fit_verdict">;
