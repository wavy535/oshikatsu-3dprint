export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line: string
          city: string
          created_at: string
          id: string
          is_default: boolean
          phone: string
          postal_code: string
          prefecture: string
          recipient_name: string
          user_id: string
        }
        Insert: {
          address_line: string
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          phone: string
          postal_code: string
          prefecture: string
          recipient_name: string
          user_id: string
        }
        Update: {
          address_line?: string
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          phone?: string
          postal_code?: string
          prefecture?: string
          recipient_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          note: string | null
          quantity: number
          variant_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          note?: string | null
          quantity?: number
          variant_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          note?: string | null
          quantity?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinate_post_pins: {
        Row: {
          created_at: string
          id: string
          post_id: string
          work_id: string
          x_percent: number
          y_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          work_id: string
          x_percent: number
          y_percent: number
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          work_id?: string
          x_percent?: number
          y_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "coordinate_post_pins_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "coordinate_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinate_post_pins_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinate_post_pins_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "coordinate_post_pins_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinate_post_pins_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinate_posts: {
        Row: {
          caption: string
          created_at: string
          id: string
          image_storage_path: string
          user_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          id?: string
          image_storage_path: string
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          image_storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordinate_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "coordinate_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_applications: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          message: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["creator_application_status"]
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          message: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["creator_application_status"]
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          message?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["creator_application_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_follows: {
        Row: {
          created_at: string
          creator_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_order_quotes: {
        Row: {
          accepted_at: string | null
          asset_id: string | null
          base_work_id: string | null
          buyer_id: string
          created_at: string
          creator_id: string
          est_filament_grams: number | null
          est_print_hours: number | null
          expires_at: string
          id: string
          lead_time_days: number
          max_part_bbox_x_mm: number | null
          max_part_bbox_y_mm: number | null
          max_part_bbox_z_mm: number | null
          note: string | null
          ordered_at: string | null
          part_count: number
          price_jpy: number
          print_fee_jpy: number
          quote_no: string | null
          request_id: string
          shipping_fee_jpy: number
          spec: Json
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          asset_id?: string | null
          base_work_id?: string | null
          buyer_id: string
          created_at?: string
          creator_id: string
          est_filament_grams?: number | null
          est_print_hours?: number | null
          expires_at?: string
          id?: string
          lead_time_days?: number
          max_part_bbox_x_mm?: number | null
          max_part_bbox_y_mm?: number | null
          max_part_bbox_z_mm?: number | null
          note?: string | null
          ordered_at?: string | null
          part_count?: number
          price_jpy: number
          print_fee_jpy?: number
          quote_no?: string | null
          request_id: string
          shipping_fee_jpy?: number
          spec?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          asset_id?: string | null
          base_work_id?: string | null
          buyer_id?: string
          created_at?: string
          creator_id?: string
          est_filament_grams?: number | null
          est_print_hours?: number | null
          expires_at?: string
          id?: string
          lead_time_days?: number
          max_part_bbox_x_mm?: number | null
          max_part_bbox_y_mm?: number | null
          max_part_bbox_z_mm?: number | null
          note?: string | null
          ordered_at?: string | null
          part_count?: number
          price_jpy?: number
          print_fee_jpy?: number
          quote_no?: string | null
          request_id?: string
          shipping_fee_jpy?: number
          spec?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_order_quotes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "work_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_base_work_id_fkey"
            columns: ["base_work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_base_work_id_fkey"
            columns: ["base_work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "custom_order_quotes_base_work_id_fkey"
            columns: ["base_work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_base_work_id_fkey"
            columns: ["base_work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "custom_order_quotes_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "custom_order_quotes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "custom_order_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "custom_order_quotes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "custom_order_quotes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_quotes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_order_requests: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          message: string
          reference_work_id: string | null
          requester_id: string
          status: Database["public"]["Enums"]["custom_request_status"]
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          message: string
          reference_work_id?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["custom_request_status"]
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          message?: string
          reference_work_id?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["custom_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "custom_order_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "custom_order_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_requests_reference_work_id_fkey"
            columns: ["reference_work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_requests_reference_work_id_fkey"
            columns: ["reference_work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "custom_order_requests_reference_work_id_fkey"
            columns: ["reference_work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_requests_reference_work_id_fkey"
            columns: ["reference_work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_order_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "custom_order_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      filament_ledger: {
        Row: {
          actor_id: string | null
          created_at: string
          delta_grams: number
          filament_id: string
          id: string
          print_job_id: string | null
          reason: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delta_grams: number
          filament_id: string
          id?: string
          print_job_id?: string | null
          reason: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delta_grams?: number
          filament_id?: string
          id?: string
          print_job_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "filament_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "filament_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_ledger_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_ledger_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_ledger_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      filaments: {
        Row: {
          color_hex: string
          color_name: string
          created_at: string
          id: string
          is_active: boolean
          material: Database["public"]["Enums"]["filament_material"]
          price_per_gram: number
          stock_grams: number
        }
        Insert: {
          color_hex: string
          color_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          material: Database["public"]["Enums"]["filament_material"]
          price_per_gram?: number
          stock_grams?: number
        }
        Update: {
          color_hex?: string
          color_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          material?: Database["public"]["Enums"]["filament_material"]
          price_per_gram?: number
          stock_grams?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string | null
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean
          in_app: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email?: boolean
          in_app?: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email?: boolean
          in_app?: boolean
          kind?: Database["public"]["Enums"]["notification_kind"]
          push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          digest: Database["public"]["Enums"]["notification_digest"]
          digest_hour: number
          email_to: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          digest?: Database["public"]["Enums"]["notification_digest"]
          digest_hour?: number
          email_to?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          digest?: Database["public"]["Enums"]["notification_digest"]
          digest_hour?: number
          email_to?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          emailed_at: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link_path: string
          pushed_at: string | null
          read_at: string | null
          source_id: string | null
          source_table: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link_path: string
          pushed_at?: string | null
          read_at?: string | null
          source_id?: string | null
          source_table?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link_path?: string
          pushed_at?: string | null
          read_at?: string | null
          source_id?: string | null
          source_table?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nui_assets: {
        Row: {
          bytes: number | null
          created_at: string
          id: string
          kind: string
          nui_id: string
          scan_id: string | null
          storage_path: string
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          id?: string
          kind: string
          nui_id: string
          scan_id?: string | null
          storage_path: string
        }
        Update: {
          bytes?: number | null
          created_at?: string
          id?: string
          kind?: string
          nui_id?: string
          scan_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "nui_assets_nui_id_fkey"
            columns: ["nui_id"]
            isOneToOne: false
            referencedRelation: "nui_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nui_assets_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "nui_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      nui_profiles: {
        Row: {
          created_at: string
          has_scan: boolean
          hug_width_mm: number | null
          id: string
          is_main: boolean
          kind: Database["public"]["Enums"]["nui_kind"]
          name: string
          nui_size_cm: number | null
          shoulder_width_mm: number | null
          sit_height_mm: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_scan?: boolean
          hug_width_mm?: number | null
          id?: string
          is_main?: boolean
          kind?: Database["public"]["Enums"]["nui_kind"]
          name: string
          nui_size_cm?: number | null
          shoulder_width_mm?: number | null
          sit_height_mm: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_scan?: boolean
          hug_width_mm?: number | null
          id?: string
          is_main?: boolean
          kind?: Database["public"]["Enums"]["nui_kind"]
          name?: string
          nui_size_cm?: number | null
          shoulder_width_mm?: number | null
          sit_height_mm?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nui_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "nui_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nui_scans: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          external_session_id: string | null
          id: string
          measure_confidence: number | null
          measured_hug_width_mm: number | null
          measured_shoulder_width_mm: number | null
          measured_sit_height_mm: number | null
          nui_id: string | null
          photos_expire_at: string
          provider: string
          shot_count: number
          status: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          external_session_id?: string | null
          id?: string
          measure_confidence?: number | null
          measured_hug_width_mm?: number | null
          measured_shoulder_width_mm?: number | null
          measured_sit_height_mm?: number | null
          nui_id?: string | null
          photos_expire_at?: string
          provider?: string
          shot_count?: number
          status?: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          external_session_id?: string | null
          id?: string
          measure_confidence?: number | null
          measured_hug_width_mm?: number | null
          measured_shoulder_width_mm?: number | null
          measured_sit_height_mm?: number | null
          nui_id?: string | null
          photos_expire_at?: string
          provider?: string
          shot_count?: number
          status?: Database["public"]["Enums"]["scan_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nui_scans_nui_id_fkey"
            columns: ["nui_id"]
            isOneToOne: false
            referencedRelation: "nui_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nui_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "nui_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          color_slots_snapshot: Json
          created_at: string
          creator_id: string
          creator_payout_amount: number
          filament_color_snapshot: string
          filament_material_snapshot: string
          id: string
          order_id: string
          part_instructions_snapshot: Json
          platform_fee_amount: number
          print_cost_amount: number
          print_fee_snapshot: number | null
          quantity: number
          size_label_snapshot: string | null
          stl_storage_path_snapshot: string
          unit_price: number
          variant_id: string | null
          work_id: string
        }
        Insert: {
          color_slots_snapshot?: Json
          created_at?: string
          creator_id: string
          creator_payout_amount: number
          filament_color_snapshot: string
          filament_material_snapshot: string
          id?: string
          order_id: string
          part_instructions_snapshot?: Json
          platform_fee_amount: number
          print_cost_amount: number
          print_fee_snapshot?: number | null
          quantity: number
          size_label_snapshot?: string | null
          stl_storage_path_snapshot: string
          unit_price: number
          variant_id?: string | null
          work_id: string
        }
        Update: {
          color_slots_snapshot?: Json
          created_at?: string
          creator_id?: string
          creator_payout_amount?: number
          filament_color_snapshot?: string
          filament_material_snapshot?: string
          id?: string
          order_id?: string
          part_instructions_snapshot?: Json
          platform_fee_amount?: number
          print_cost_amount?: number
          print_fee_snapshot?: number | null
          quantity?: number
          size_label_snapshot?: string | null
          stl_storage_path_snapshot?: string
          unit_price?: number
          variant_id?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "order_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          created_at: string
          gift_wrapping: boolean
          id: string
          platform_fee_amount: number
          platform_fee_rate: number | null
          print_cost_amount: number
          ship_due_at: string | null
          shipped_at: string | null
          shipping_address_id: string | null
          shipping_fee_amount: number
          status: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id: string | null
          subtotal_amount: number
          total_amount: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          gift_wrapping?: boolean
          id?: string
          platform_fee_amount?: number
          platform_fee_rate?: number | null
          print_cost_amount?: number
          ship_due_at?: string | null
          shipped_at?: string | null
          shipping_address_id?: string | null
          shipping_fee_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id?: string | null
          subtotal_amount: number
          total_amount: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          gift_wrapping?: boolean
          id?: string
          platform_fee_amount?: number
          platform_fee_rate?: number | null
          print_cost_amount?: number
          ship_due_at?: string | null
          shipped_at?: string | null
          shipping_address_id?: string | null
          shipping_fee_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id?: string | null
          subtotal_amount?: number
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          account_holder_name: string
          account_number: string
          account_type: string
          bank_name: string
          branch_name: string
          created_at: string
          creator_id: string
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          account_type: string
          bank_name: string
          branch_name: string
          created_at?: string
          creator_id: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          branch_name?: string
          created_at?: string
          creator_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "payout_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount: number
          creator_id: string
          id: string
          processed_at: string | null
          requested_at: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          amount: number
          creator_id: string
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          amount?: number
          creator_id?: string
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "payout_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_job_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          print_job_id: string
          status: Database["public"]["Enums"]["print_job_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          print_job_id: string
          status: Database["public"]["Enums"]["print_job_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          print_job_id?: string
          status?: Database["public"]["Enums"]["print_job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "print_job_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "print_job_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_job_events_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_job_events_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          actual_filament_grams: number | null
          actual_print_hours: number | null
          assignee_id: string | null
          batch_count: number
          batch_done: number
          created_at: string
          due_at: string | null
          est_filament_grams: number | null
          est_print_hours: number | null
          failure_count: number
          finished_at: string | null
          id: string
          job_no: string | null
          order_id: string
          order_item_id: string
          part_count: number
          print_fee_snapshot: number | null
          printer_id: string | null
          quantity: number
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          actual_filament_grams?: number | null
          actual_print_hours?: number | null
          assignee_id?: string | null
          batch_count?: number
          batch_done?: number
          created_at?: string
          due_at?: string | null
          est_filament_grams?: number | null
          est_print_hours?: number | null
          failure_count?: number
          finished_at?: string | null
          id?: string
          job_no?: string | null
          order_id: string
          order_item_id: string
          part_count?: number
          print_fee_snapshot?: number | null
          printer_id?: string | null
          quantity?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          actual_filament_grams?: number | null
          actual_print_hours?: number | null
          assignee_id?: string | null
          batch_count?: number
          batch_done?: number
          created_at?: string
          due_at?: string | null
          est_filament_grams?: number | null
          est_print_hours?: number | null
          failure_count?: number
          finished_at?: string | null
          id?: string
          job_no?: string | null
          order_id?: string
          order_item_id?: string
          part_count?: number
          print_fee_snapshot?: number | null
          printer_id?: string | null
          quantity?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "print_jobs_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "creator_item_settlements"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "print_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "print_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_pricing_rules: {
        Row: {
          bed_x_mm: number
          bed_y_mm: number
          bed_z_mm: number
          created_at: string
          effective_from: string
          fee_billing: Database["public"]["Enums"]["print_fee_billing"]
          handling_base_yen: number
          handling_per_part_yen: number
          id: string
          is_active: boolean
          machine_yen_per_hour: number
          material_yen_per_gram: number
          max_batch_hours: number
          platform_fee_rate: number
          shipping_fee_jpy: number
        }
        Insert: {
          bed_x_mm?: number
          bed_y_mm?: number
          bed_z_mm?: number
          created_at?: string
          effective_from?: string
          fee_billing?: Database["public"]["Enums"]["print_fee_billing"]
          handling_base_yen?: number
          handling_per_part_yen?: number
          id?: string
          is_active?: boolean
          machine_yen_per_hour?: number
          material_yen_per_gram?: number
          max_batch_hours?: number
          platform_fee_rate?: number
          shipping_fee_jpy?: number
        }
        Update: {
          bed_x_mm?: number
          bed_y_mm?: number
          bed_z_mm?: number
          created_at?: string
          effective_from?: string
          fee_billing?: Database["public"]["Enums"]["print_fee_billing"]
          handling_base_yen?: number
          handling_per_part_yen?: number
          id?: string
          is_active?: boolean
          machine_yen_per_hour?: number
          material_yen_per_gram?: number
          max_batch_hours?: number
          platform_fee_rate?: number
          shipping_fee_jpy?: number
        }
        Relationships: []
      }
      printers: {
        Row: {
          bed_x_mm: number
          bed_y_mm: number
          bed_z_mm: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          model_name: string
          note: string | null
          nozzle_mm: number
          supports_multicolor: boolean
        }
        Insert: {
          bed_x_mm?: number
          bed_y_mm?: number
          bed_z_mm?: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_name: string
          note?: string | null
          nozzle_mm?: number
          supports_multicolor?: boolean
        }
        Update: {
          bed_x_mm?: number
          bed_y_mm?: number
          bed_z_mm?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_name?: string
          note?: string | null
          nozzle_mm?: number
          supports_multicolor?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          sns_links: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          sns_links?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          sns_links?: Json
          updated_at?: string
        }
        Relationships: []
      }
      qc_check_definitions: {
        Row: {
          code: string
          description: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      qc_check_results: {
        Row: {
          code: string
          id: string
          inspection_id: string
          note: string | null
          passed: boolean
        }
        Insert: {
          code: string
          id?: string
          inspection_id: string
          note?: string | null
          passed: boolean
        }
        Update: {
          code?: string
          id?: string
          inspection_id?: string
          note?: string | null
          passed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "qc_check_results_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "qc_check_definitions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qc_check_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "qc_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_inspections: {
        Row: {
          created_at: string
          id: string
          inspector_id: string | null
          memo: string | null
          photo_paths: string[]
          print_job_id: string
          reprint_cause: Database["public"]["Enums"]["reprint_cause"] | null
          result: Database["public"]["Enums"]["qc_result"]
        }
        Insert: {
          created_at?: string
          id?: string
          inspector_id?: string | null
          memo?: string | null
          photo_paths?: string[]
          print_job_id: string
          reprint_cause?: Database["public"]["Enums"]["reprint_cause"] | null
          result: Database["public"]["Enums"]["qc_result"]
        }
        Update: {
          created_at?: string
          id?: string
          inspector_id?: string | null
          memo?: string | null
          photo_paths?: string[]
          print_job_id?: string
          reprint_cause?: Database["public"]["Enums"]["reprint_cause"] | null
          result?: Database["public"]["Enums"]["qc_result"]
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "qc_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      qna_threads: {
        Row: {
          answer: string | null
          answered_at: string | null
          asker_id: string
          created_at: string
          id: string
          question: string
          work_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asker_id: string
          created_at?: string
          id?: string
          question: string
          work_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asker_id?: string
          created_at?: string
          id?: string
          question?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qna_threads_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "qna_threads_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_threads_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_threads_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "qna_threads_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_threads_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          accuracy_rating: number | null
          comment: string | null
          created_at: string
          creator_id: string
          design_rating: number | null
          id: string
          is_anonymous: boolean
          order_item_id: string
          packaging_rating: number | null
          photo_storage_path: string | null
          print_quality_rating: number | null
          rating: number
          reviewer_id: string
          shipping_rating: number | null
          size_fit_rating: number | null
          work_id: string
        }
        Insert: {
          accuracy_rating?: number | null
          comment?: string | null
          created_at?: string
          creator_id: string
          design_rating?: number | null
          id?: string
          is_anonymous?: boolean
          order_item_id: string
          packaging_rating?: number | null
          photo_storage_path?: string | null
          print_quality_rating?: number | null
          rating: number
          reviewer_id: string
          shipping_rating?: number | null
          size_fit_rating?: number | null
          work_id: string
        }
        Update: {
          accuracy_rating?: number | null
          comment?: string | null
          created_at?: string
          creator_id?: string
          design_rating?: number | null
          id?: string
          is_anonymous?: boolean
          order_item_id?: string
          packaging_rating?: number | null
          photo_storage_path?: string | null
          print_quality_rating?: number | null
          rating?: number
          reviewer_id?: string
          shipping_rating?: number | null
          size_fit_rating?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reviews_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "creator_item_settlements"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "reviews_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_requests: {
        Row: {
          cause: Database["public"]["Enums"]["reprint_cause"]
          charged_to_creator: boolean
          created_at: string
          created_by: string | null
          creator_id: string
          due_at: string
          id: string
          inspection_id: string | null
          message: string
          object_id: string | null
          photo_paths: string[]
          print_job_id: string | null
          reprint_fee_jpy: number
          resolution: Database["public"]["Enums"]["revision_resolution"] | null
          resolution_note: string | null
          resolved_at: string | null
          revision_no: string | null
          status: Database["public"]["Enums"]["revision_status"]
          updated_at: string
          variant_id: string | null
          work_id: string
        }
        Insert: {
          cause?: Database["public"]["Enums"]["reprint_cause"]
          charged_to_creator?: boolean
          created_at?: string
          created_by?: string | null
          creator_id: string
          due_at?: string
          id?: string
          inspection_id?: string | null
          message: string
          object_id?: string | null
          photo_paths?: string[]
          print_job_id?: string | null
          reprint_fee_jpy?: number
          resolution?: Database["public"]["Enums"]["revision_resolution"] | null
          resolution_note?: string | null
          resolved_at?: string | null
          revision_no?: string | null
          status?: Database["public"]["Enums"]["revision_status"]
          updated_at?: string
          variant_id?: string | null
          work_id: string
        }
        Update: {
          cause?: Database["public"]["Enums"]["reprint_cause"]
          charged_to_creator?: boolean
          created_at?: string
          created_by?: string | null
          creator_id?: string
          due_at?: string
          id?: string
          inspection_id?: string | null
          message?: string
          object_id?: string | null
          photo_paths?: string[]
          print_job_id?: string | null
          reprint_fee_jpy?: number
          resolution?: Database["public"]["Enums"]["revision_resolution"] | null
          resolution_note?: string | null
          resolved_at?: string | null
          revision_no?: string | null
          status?: Database["public"]["Enums"]["revision_status"]
          updated_at?: string
          variant_id?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "revision_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "revision_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "qc_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "work_asset_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "revision_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "revision_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "revision_requests_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_requests_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          box_type: string | null
          buyer_notified_at: string | null
          carrier: Database["public"]["Enums"]["shipping_carrier"]
          created_at: string
          id: string
          order_id: string
          packer_id: string | null
          service_name: string | null
          shipped_at: string
          shipping_fee_jpy: number
          size_sum_cm: number | null
          tracking_number: string | null
          weight_grams: number | null
        }
        Insert: {
          box_type?: string | null
          buyer_notified_at?: string | null
          carrier: Database["public"]["Enums"]["shipping_carrier"]
          created_at?: string
          id?: string
          order_id: string
          packer_id?: string | null
          service_name?: string | null
          shipped_at?: string
          shipping_fee_jpy?: number
          size_sum_cm?: number | null
          tracking_number?: string | null
          weight_grams?: number | null
        }
        Update: {
          box_type?: string | null
          buyer_notified_at?: string | null
          carrier?: Database["public"]["Enums"]["shipping_carrier"]
          created_at?: string
          id?: string
          order_id?: string
          packer_id?: string | null
          service_name?: string | null
          shipped_at?: string
          shipping_fee_jpy?: number
          size_sum_cm?: number | null
          tracking_number?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_packer_id_fkey"
            columns: ["packer_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "shipments_packer_id_fkey"
            columns: ["packer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          id: string
          name: string
          slug: string
          sort_order: number
          type: Database["public"]["Enums"]["tag_type"]
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort_order?: number
          type: Database["public"]["Enums"]["tag_type"]
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["tag_type"]
        }
        Relationships: []
      }
      tryon_renders: {
        Row: {
          created_at: string
          id: string
          nui_id: string
          storage_path: string
          variant_id: string
          view: string
        }
        Insert: {
          created_at?: string
          id?: string
          nui_id: string
          storage_path: string
          variant_id: string
          view: string
        }
        Update: {
          created_at?: string
          id?: string
          nui_id?: string
          storage_path?: string
          variant_id?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryon_renders_nui_id_fkey"
            columns: ["nui_id"]
            isOneToOne: false
            referencedRelation: "nui_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryon_renders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "tryon_renders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "tryon_renders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryon_renders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_nui_sizes: {
        Row: {
          created_at: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_nui_sizes_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_nui_sizes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_nui_sizes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_assembly: {
        Row: {
          adhesive: string | null
          diagram_storage_path: string | null
          fit_clearance_mm: number | null
          steps_text: string | null
          updated_at: string
          work_id: string
        }
        Insert: {
          adhesive?: string | null
          diagram_storage_path?: string | null
          fit_clearance_mm?: number | null
          steps_text?: string | null
          updated_at?: string
          work_id: string
        }
        Update: {
          adhesive?: string | null
          diagram_storage_path?: string | null
          fit_clearance_mm?: number | null
          steps_text?: string | null
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_assembly_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assembly_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_assembly_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assembly_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_asset_objects: {
        Row: {
          asset_id: string
          bbox_x_mm: number
          bbox_y_mm: number
          bbox_z_mm: number
          created_at: string
          flipped_normal_count: number
          id: string
          is_manifold: boolean
          min_wall_thickness_mm: number | null
          name: string
          object_index: number
          open_edge_count: number
          self_intersection_count: number
          surface_area_cm2: number | null
          triangle_count: number | null
          volume_cm3: number
        }
        Insert: {
          asset_id: string
          bbox_x_mm: number
          bbox_y_mm: number
          bbox_z_mm: number
          created_at?: string
          flipped_normal_count?: number
          id?: string
          is_manifold?: boolean
          min_wall_thickness_mm?: number | null
          name: string
          object_index: number
          open_edge_count?: number
          self_intersection_count?: number
          surface_area_cm2?: number | null
          triangle_count?: number | null
          volume_cm3: number
        }
        Update: {
          asset_id?: string
          bbox_x_mm?: number
          bbox_y_mm?: number
          bbox_z_mm?: number
          created_at?: string
          flipped_normal_count?: number
          id?: string
          is_manifold?: boolean
          min_wall_thickness_mm?: number | null
          name?: string
          object_index?: number
          open_edge_count?: number
          self_intersection_count?: number
          surface_area_cm2?: number | null
          triangle_count?: number | null
          volume_cm3?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_asset_objects_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "work_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      work_assets: {
        Row: {
          bbox_x_mm: number | null
          bbox_y_mm: number | null
          bbox_z_mm: number | null
          created_at: string
          file_format: Database["public"]["Enums"]["model_file_format"]
          file_name: string
          file_size_bytes: number
          id: string
          is_primary: boolean
          object_count: number
          storage_path: string
          total_surface_area_cm2: number | null
          total_volume_cm3: number | null
          triangle_count: number | null
          unit: string
          validated_at: string | null
          validation_status: Database["public"]["Enums"]["validation_status"]
          vertex_count: number | null
          work_id: string
        }
        Insert: {
          bbox_x_mm?: number | null
          bbox_y_mm?: number | null
          bbox_z_mm?: number | null
          created_at?: string
          file_format: Database["public"]["Enums"]["model_file_format"]
          file_name: string
          file_size_bytes: number
          id?: string
          is_primary?: boolean
          object_count?: number
          storage_path: string
          total_surface_area_cm2?: number | null
          total_volume_cm3?: number | null
          triangle_count?: number | null
          unit?: string
          validated_at?: string | null
          validation_status?: Database["public"]["Enums"]["validation_status"]
          vertex_count?: number | null
          work_id: string
        }
        Update: {
          bbox_x_mm?: number | null
          bbox_y_mm?: number | null
          bbox_z_mm?: number | null
          created_at?: string
          file_format?: Database["public"]["Enums"]["model_file_format"]
          file_name?: string
          file_size_bytes?: number
          id?: string
          is_primary?: boolean
          object_count?: number
          storage_path?: string
          total_surface_area_cm2?: number | null
          total_volume_cm3?: number | null
          triangle_count?: number | null
          unit?: string
          validated_at?: string | null
          validation_status?: Database["public"]["Enums"]["validation_status"]
          vertex_count?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_assets_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assets_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_assets_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assets_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_color_slots: {
        Row: {
          asset_id: string
          created_at: string
          face_count: number | null
          filament_id: string | null
          id: string
          slot_index: number
          source_hex: string
          source_name: string
          work_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          face_count?: number | null
          filament_id?: string | null
          id?: string
          slot_index: number
          source_hex: string
          source_name: string
          work_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          face_count?: number | null
          filament_id?: string | null
          id?: string
          slot_index?: number
          source_hex?: string
          source_name?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_color_slots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "work_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_color_slots_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_color_slots_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_color_slots_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_color_slots_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_color_slots_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_favorites: {
        Row: {
          created_at: string
          user_id: string
          work_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          work_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "work_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_favorites_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_favorites_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_favorites_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_favorites_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_images: {
        Row: {
          id: string
          sort_order: number
          storage_path: string
          work_id: string
        }
        Insert: {
          id?: string
          sort_order?: number
          storage_path: string
          work_id: string
        }
        Update: {
          id?: string
          sort_order?: number
          storage_path?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_images_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_images_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_images_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_images_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_part_instructions: {
        Row: {
          created_at: string
          id: string
          no_rotate: boolean
          note: string | null
          object_id: string
          orientation: Database["public"]["Enums"]["print_orientation"]
          support: Database["public"]["Enums"]["support_mode"]
          support_note: string | null
          variant_id: string | null
          work_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          no_rotate?: boolean
          note?: string | null
          object_id: string
          orientation?: Database["public"]["Enums"]["print_orientation"]
          support?: Database["public"]["Enums"]["support_mode"]
          support_note?: string | null
          variant_id?: string | null
          work_id: string
        }
        Update: {
          created_at?: string
          id?: string
          no_rotate?: boolean
          note?: string | null
          object_id?: string
          orientation?: Database["public"]["Enums"]["print_orientation"]
          support?: Database["public"]["Enums"]["support_mode"]
          support_note?: string | null
          variant_id?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_part_instructions_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "work_asset_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_part_instructions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "work_part_instructions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "work_part_instructions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_part_instructions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_part_instructions_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_part_instructions_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_part_instructions_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_part_instructions_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_tags: {
        Row: {
          tag_id: string
          work_id: string
        }
        Insert: {
          tag_id: string
          work_id: string
        }
        Update: {
          tag_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tags_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tags_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_tags_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tags_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_validation_issues: {
        Row: {
          asset_id: string
          code: string
          created_at: string
          detail: Json
          id: string
          message: string
          object_id: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
        }
        Insert: {
          asset_id: string
          code: string
          created_at?: string
          detail?: Json
          id?: string
          message: string
          object_id?: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
        }
        Update: {
          asset_id?: string
          code?: string
          created_at?: string
          detail?: Json
          id?: string
          message?: string
          object_id?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "work_validation_issues_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "work_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_validation_issues_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "work_asset_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_variants: {
        Row: {
          asset_id: string | null
          batch_count: number
          batch_count_override: number | null
          bbox_x_mm: number | null
          bbox_y_mm: number | null
          bbox_z_mm: number | null
          created_at: string
          est_filament_grams: number | null
          est_print_hours: number | null
          fit_depth_mm: number | null
          fit_height_mm: number | null
          fit_note: string | null
          fit_source: string
          fit_width_mm: number | null
          id: string
          is_base: boolean
          is_listed: boolean
          is_printable: boolean
          max_part_bbox_x_mm: number | null
          max_part_bbox_y_mm: number | null
          max_part_bbox_z_mm: number | null
          nui_size_cm: number | null
          oversized_parts: string[]
          part_count: number
          price_jpy: number | null
          print_fee_jpy: number | null
          scale_ratio: number
          size_label: string
          stock: number | null
          unprintable_reason: string | null
          updated_at: string
          work_id: string
        }
        Insert: {
          asset_id?: string | null
          batch_count?: number
          batch_count_override?: number | null
          bbox_x_mm?: number | null
          bbox_y_mm?: number | null
          bbox_z_mm?: number | null
          created_at?: string
          est_filament_grams?: number | null
          est_print_hours?: number | null
          fit_depth_mm?: number | null
          fit_height_mm?: number | null
          fit_note?: string | null
          fit_source?: string
          fit_width_mm?: number | null
          id?: string
          is_base?: boolean
          is_listed?: boolean
          is_printable?: boolean
          max_part_bbox_x_mm?: number | null
          max_part_bbox_y_mm?: number | null
          max_part_bbox_z_mm?: number | null
          nui_size_cm?: number | null
          oversized_parts?: string[]
          part_count?: number
          price_jpy?: number | null
          print_fee_jpy?: number | null
          scale_ratio?: number
          size_label: string
          stock?: number | null
          unprintable_reason?: string | null
          updated_at?: string
          work_id: string
        }
        Update: {
          asset_id?: string | null
          batch_count?: number
          batch_count_override?: number | null
          bbox_x_mm?: number | null
          bbox_y_mm?: number | null
          bbox_z_mm?: number | null
          created_at?: string
          est_filament_grams?: number | null
          est_print_hours?: number | null
          fit_depth_mm?: number | null
          fit_height_mm?: number | null
          fit_note?: string | null
          fit_source?: string
          fit_width_mm?: number | null
          id?: string
          is_base?: boolean
          is_listed?: boolean
          is_printable?: boolean
          max_part_bbox_x_mm?: number | null
          max_part_bbox_y_mm?: number | null
          max_part_bbox_z_mm?: number | null
          nui_size_cm?: number | null
          oversized_parts?: string[]
          part_count?: number
          price_jpy?: number | null
          print_fee_jpy?: number | null
          scale_ratio?: number
          size_label?: string
          stock?: number | null
          unprintable_reason?: string | null
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_variants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "work_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      works: {
        Row: {
          accepts_color_change: boolean
          accepts_custom_size: boolean
          accepts_mirror: boolean
          accepts_other_request: boolean
          accepts_stand_hole: boolean
          created_at: string
          creator_id: string
          description: string
          favorite_count: number
          id: string
          min_buyer_total_jpy: number | null
          min_price_jpy: number | null
          previous_min_price_jpy: number | null
          price_changed_at: string | null
          status: Database["public"]["Enums"]["work_status"]
          title: string
          updated_at: string
        }
        Insert: {
          accepts_color_change?: boolean
          accepts_custom_size?: boolean
          accepts_mirror?: boolean
          accepts_other_request?: boolean
          accepts_stand_hole?: boolean
          created_at?: string
          creator_id: string
          description?: string
          favorite_count?: number
          id?: string
          min_buyer_total_jpy?: number | null
          min_price_jpy?: number | null
          previous_min_price_jpy?: number | null
          price_changed_at?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          title: string
          updated_at?: string
        }
        Update: {
          accepts_color_change?: boolean
          accepts_custom_size?: boolean
          accepts_mirror?: boolean
          accepts_other_request?: boolean
          accepts_stand_hole?: boolean
          created_at?: string
          creator_id?: string
          description?: string
          favorite_count?: number
          id?: string
          min_buyer_total_jpy?: number | null
          min_price_jpy?: number | null
          previous_min_price_jpy?: number | null
          price_changed_at?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      creator_item_settlements: {
        Row: {
          creator_id: string | null
          fee_amount: number | null
          goods_amount: number | null
          is_final: boolean | null
          item_id: string | null
          order_id: string | null
          ordered_at: string | null
          payout_amount: number | null
          payout_estimate: number | null
          quantity: number | null
          shipped_at: string | null
          size_label_snapshot: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          thumbnail_path: string | null
          variant_id: string | null
          work_id: string | null
          work_title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "order_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants_missing_fit_dims"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variant_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "work_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_balances: {
        Row: {
          available_amount: number | null
          creator_id: string | null
          paid_amount: number | null
          pending_payout: number | null
          reprint_charges: number | null
          requested_amount: number | null
          settled_payout: number | null
          sold_items: number | null
        }
        Relationships: []
      }
      creator_rating_summary: {
        Row: {
          avg_accuracy: number | null
          avg_design: number | null
          avg_rating: number | null
          avg_size_fit: number | null
          creator_id: string | null
          five_star_count: number | null
          last_reviewed_at: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reviews_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_favorites: {
        Row: {
          avg_rating: number | null
          created_at: string | null
          creator_id: string | null
          creator_name: string | null
          dropped_since_favorited: boolean | null
          favorite_count: number | null
          favorited_at: string | null
          has_stock: boolean | null
          id: string | null
          is_available: boolean | null
          is_price_dropped: boolean | null
          min_price_jpy: number | null
          previous_min_price_jpy: number | null
          price_changed_at: string | null
          review_count: number | null
          status: Database["public"]["Enums"]["work_status"] | null
          title: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "work_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_rating_summary: {
        Row: {
          answered_count: number | null
          avg_packaging: number | null
          avg_print_quality: number | null
          avg_shipping: number | null
          month: string | null
        }
        Relationships: []
      }
      order_settlements: {
        Row: {
          buyer_id: string | null
          fee_amount: number | null
          goods_amount: number | null
          gross_amount: number | null
          is_final: boolean | null
          order_id: string | null
          ordered_at: string | null
          payout_amount: number | null
          platform_fee_rate: number | null
          pool_amount: number | null
          print_actual_amount: number | null
          print_cost_used: number | null
          print_fee_amount: number | null
          shipped_at: string | null
          shipping_actual_amount: number | null
          shipping_charged_amount: number | null
          shipping_used: number | null
          status: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_queue: {
        Row: {
          actual_filament_grams: number | null
          actual_print_hours: number | null
          assignee_id: string | null
          assignee_name: string | null
          batch_count: number | null
          batch_done: number | null
          buyer_id: string | null
          buyer_name: string | null
          color_hex: string | null
          color_name: string | null
          created_at: string | null
          due_at: string | null
          est_filament_grams: number | null
          est_print_hours: number | null
          failure_count: number | null
          gift_wrapping: boolean | null
          id: string | null
          is_overdue: boolean | null
          job_no: string | null
          material: Database["public"]["Enums"]["filament_material"] | null
          nui_size_cm: number | null
          order_id: string | null
          ordered_at: string | null
          part_count: number | null
          printer_code: string | null
          printer_id: string | null
          quantity: number | null
          size_label: string | null
          status: Database["public"]["Enums"]["print_job_status"] | null
          thumbnail_path: string | null
          variant_id: string | null
          work_id: string | null
          work_title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "print_jobs_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_settlements"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      variants_missing_fit_dims: {
        Row: {
          creator_id: string | null
          is_listed: boolean | null
          size_label: string | null
          title: string | null
          variant_id: string | null
          work_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_list_items: {
        Row: {
          avg_rating: number | null
          created_at: string | null
          creator_id: string | null
          creator_name: string | null
          favorite_count: number | null
          has_stock: boolean | null
          id: string | null
          is_available: boolean | null
          is_price_dropped: boolean | null
          min_buyer_total_jpy: number | null
          min_price_jpy: number | null
          previous_min_price_jpy: number | null
          price_changed_at: string | null
          review_count: number | null
          status: Database["public"]["Enums"]["work_status"] | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_balances"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "works_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_variant_pricing: {
        Row: {
          batch_count: number | null
          bbox_x_mm: number | null
          bbox_y_mm: number | null
          bbox_z_mm: number | null
          buyer_total_jpy: number | null
          creator_payout_jpy: number | null
          est_filament_grams: number | null
          est_print_hours: number | null
          fee_billing: Database["public"]["Enums"]["print_fee_billing"] | null
          id: string | null
          is_base: boolean | null
          is_listed: boolean | null
          is_printable: boolean | null
          max_part_bbox_x_mm: number | null
          max_part_bbox_y_mm: number | null
          max_part_bbox_z_mm: number | null
          min_price_jpy: number | null
          nui_size_cm: number | null
          oversized_parts: string[] | null
          part_count: number | null
          price_jpy: number | null
          print_fee_jpy: number | null
          scale_ratio: number | null
          size_label: string | null
          stock: number | null
          unprintable_reason: string | null
          work_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "my_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "print_queue"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_variants_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_custom_quote: { Args: { p_quote_id: string }; Returns: string }
      calc_print_fee: {
        Args: { grams: number; hours: number; parts: number }
        Returns: number
      }
      cancel_unpaid_order: { Args: { p_order_id: string }; Returns: boolean }
      confirm_order_payment: {
        Args: { p_order_id: string; p_payment_ref?: string }
        Returns: boolean
      }
      create_print_jobs_for_order: {
        Args: { p_lead_days?: number; p_order_id: string }
        Returns: number
      }
      creator_payout_for: {
        Args: { variant: Database["public"]["Tables"]["work_variants"]["Row"] }
        Returns: number
      }
      decline_custom_quote: { Args: { p_quote_id: string }; Returns: boolean }
      estimate_filament_grams: {
        Args: {
          density?: number
          infill?: number
          shell_cm?: number
          surface_area_cm2: number
          volume_cm3: number
        }
        Returns: number
      }
      expire_custom_quotes: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      judge_axis: {
        Args: { p_loose_mm?: number; p_nui_mm: number; p_slot_mm: number }
        Returns: Database["public"]["Enums"]["fit_verdict"]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      nui_fit_axes: {
        Args: { p_nui_id: string; p_variant_id: string }
        Returns: {
          axis: string
          margin_mm: number
          nui_mm: number
          slot_mm: number
          verdict: Database["public"]["Enums"]["fit_verdict"]
        }[]
      }
      nui_fit_for_work: {
        Args: { p_nui_id: string; p_work_id: string }
        Returns: {
          is_listed: boolean
          note: string
          nui_size_cm: number
          price_jpy: number
          size_label: string
          variant_id: string
          verdict: Database["public"]["Enums"]["fit_verdict"]
        }[]
      }
      nui_fit_verdict: {
        Args: { p_nui_id: string; p_variant_id: string }
        Returns: Database["public"]["Enums"]["fit_verdict"]
      }
      order_actual_print_cost: { Args: { p_order_id: string }; Returns: number }
      order_has_creator_items: {
        Args: { p_creator_id: string; p_order_id: string }
        Returns: boolean
      }
      place_order: {
        Args: { p_address_id: string; p_note?: string }
        Returns: string
      }
      popular_works: {
        Args: { p_limit?: number; p_nui_size_cm?: number; p_offset?: number }
        Returns: {
          avg_rating: number | null
          created_at: string | null
          creator_id: string | null
          creator_name: string | null
          favorite_count: number | null
          has_stock: boolean | null
          id: string | null
          is_available: boolean | null
          is_price_dropped: boolean | null
          min_buyer_total_jpy: number | null
          min_price_jpy: number | null
          previous_min_price_jpy: number | null
          price_changed_at: string | null
          review_count: number | null
          status: Database["public"]["Enums"]["work_status"] | null
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "work_list_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      purge_old_notifications: { Args: never; Returns: number }
      push_notification: {
        Args: {
          p_body: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_link_path: string
          p_source_id?: string
          p_source_table?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      quote_total_jpy: {
        Args: { q: Database["public"]["Tables"]["custom_order_quotes"]["Row"] }
        Returns: number
      }
      unread_notification_count: { Args: never; Returns: number }
      variant_reserved_for: {
        Args: { p_user_id: string; p_variant_id: string }
        Returns: boolean
      }
      work_reserved_for: {
        Args: { p_user_id: string; p_work_id: string }
        Returns: boolean
      }
    }
    Enums: {
      creator_application_status: "pending" | "approved" | "rejected"
      custom_request_status: "pending" | "responded" | "accepted" | "declined"
      filament_material: "PLA" | "PETG" | "ABS" | "TPU"
      fit_verdict: "too_small" | "tight" | "good" | "loose" | "unknown"
      issue_severity: "ok" | "warning" | "error"
      model_file_format: "3mf" | "stl"
      notification_digest: "instant" | "daily"
      notification_kind:
        | "order_shipping"
        | "favorite_price"
        | "message"
        | "review"
        | "creator"
        | "announcement"
      nui_kind: "plush" | "acrylic_stand" | "figure" | "other"
      order_status:
        | "payment_pending"
        | "paid"
        | "printing_queued"
        | "printing"
        | "packaging"
        | "shipped"
        | "completed"
        | "cancelled"
        | "refunded"
      payout_status: "requested" | "processing" | "paid" | "rejected"
      print_fee_billing: "bundled" | "separate"
      print_job_status:
        | "queued"
        | "printing"
        | "printed"
        | "qc_passed"
        | "qc_failed"
        | "reprinting"
        | "cancelled"
      print_orientation: "flat" | "upright" | "tilted" | "as_is"
      qc_result: "passed" | "failed"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "ordered"
        | "revision"
        | "declined"
        | "expired"
      reprint_cause: "model" | "print" | "material" | "handling"
      revision_resolution: "reupload" | "instruction" | "unlist" | "no_action"
      revision_status:
        | "open"
        | "in_progress"
        | "resolved"
        | "disputed"
        | "cancelled"
      scan_status: "capturing" | "generating" | "ready" | "failed"
      shipping_carrier: "yamato" | "sagawa" | "japanpost" | "other"
      support_mode: "none" | "auto" | "custom"
      tag_type: "category" | "nui_size" | "worldview"
      user_role: "buyer" | "creator" | "admin"
      validation_status: "pending" | "passed" | "warning" | "failed"
      work_status: "draft" | "published" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      creator_application_status: ["pending", "approved", "rejected"],
      custom_request_status: ["pending", "responded", "accepted", "declined"],
      filament_material: ["PLA", "PETG", "ABS", "TPU"],
      fit_verdict: ["too_small", "tight", "good", "loose", "unknown"],
      issue_severity: ["ok", "warning", "error"],
      model_file_format: ["3mf", "stl"],
      notification_digest: ["instant", "daily"],
      notification_kind: [
        "order_shipping",
        "favorite_price",
        "message",
        "review",
        "creator",
        "announcement",
      ],
      nui_kind: ["plush", "acrylic_stand", "figure", "other"],
      order_status: [
        "payment_pending",
        "paid",
        "printing_queued",
        "printing",
        "packaging",
        "shipped",
        "completed",
        "cancelled",
        "refunded",
      ],
      payout_status: ["requested", "processing", "paid", "rejected"],
      print_fee_billing: ["bundled", "separate"],
      print_job_status: [
        "queued",
        "printing",
        "printed",
        "qc_passed",
        "qc_failed",
        "reprinting",
        "cancelled",
      ],
      print_orientation: ["flat", "upright", "tilted", "as_is"],
      qc_result: ["passed", "failed"],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "ordered",
        "revision",
        "declined",
        "expired",
      ],
      reprint_cause: ["model", "print", "material", "handling"],
      revision_resolution: ["reupload", "instruction", "unlist", "no_action"],
      revision_status: [
        "open",
        "in_progress",
        "resolved",
        "disputed",
        "cancelled",
      ],
      scan_status: ["capturing", "generating", "ready", "failed"],
      shipping_carrier: ["yamato", "sagawa", "japanpost", "other"],
      support_mode: ["none", "auto", "custom"],
      tag_type: ["category", "nui_size", "worldview"],
      user_role: ["buyer", "creator", "admin"],
      validation_status: ["pending", "passed", "warning", "failed"],
      work_status: ["draft", "published", "archived"],
    },
  },
} as const

