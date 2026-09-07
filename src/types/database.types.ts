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
      asset_access_logs: {
        Row: {
          action: string
          asset_id: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          asset_id: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          action?: string
          asset_id?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_access_logs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          filament_id: number
          id: string
          nui_size_id: number | null
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filament_id: number
          id?: string
          nui_size_id?: number | null
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filament_id?: number
          id?: string
          nui_size_id?: number | null
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: number
          is_active: boolean
          name: string
          parent_id: number | null
          slug: string
          sort_order: number
        }
        Insert: {
          id?: never
          is_active?: boolean
          name: string
          parent_id?: number | null
          slug: string
          sort_order?: number
        }
        Update: {
          id?: never
          is_active?: boolean
          name?: string
          parent_id?: number | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinate_images: {
        Row: {
          coordinate_id: string
          id: string
          image_url: string
          sort_order: number
        }
        Insert: {
          coordinate_id: string
          id?: string
          image_url: string
          sort_order?: number
        }
        Update: {
          coordinate_id?: string
          id?: string
          image_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "coordinate_images_coordinate_id_fkey"
            columns: ["coordinate_id"]
            isOneToOne: false
            referencedRelation: "coordinates"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinate_items: {
        Row: {
          coordinate_id: string
          id: string
          note: string | null
          pin_x: number | null
          pin_y: number | null
          product_id: string
          sort_order: number
        }
        Insert: {
          coordinate_id: string
          id?: string
          note?: string | null
          pin_x?: number | null
          pin_y?: number | null
          product_id: string
          sort_order?: number
        }
        Update: {
          coordinate_id?: string
          id?: string
          note?: string | null
          pin_x?: number | null
          pin_y?: number | null
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "coordinate_items_coordinate_id_fkey"
            columns: ["coordinate_id"]
            isOneToOne: false
            referencedRelation: "coordinates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinate_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinate_likes: {
        Row: {
          coordinate_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          coordinate_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          coordinate_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordinate_likes_coordinate_id_fkey"
            columns: ["coordinate_id"]
            isOneToOne: false
            referencedRelation: "coordinates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinate_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinates: {
        Row: {
          body: string | null
          cover_image_url: string
          created_at: string
          deleted_at: string | null
          id: string
          is_public: boolean
          like_count: number
          nui_size_id: number | null
          title: string
          updated_at: string
          user_id: string
          user_nui_id: string | null
        }
        Insert: {
          body?: string | null
          cover_image_url: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          like_count?: number
          nui_size_id?: number | null
          title: string
          updated_at?: string
          user_id: string
          user_nui_id?: string | null
        }
        Update: {
          body?: string | null
          cover_image_url?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          like_count?: number
          nui_size_id?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          user_nui_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coordinates_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinates_user_nui_id_fkey"
            columns: ["user_nui_id"]
            isOneToOne: false
            referencedRelation: "user_nuis"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          birth_date: string
          commission_rate: number
          created_at: string
          intro: string | null
          legal_name: string
          legal_name_kana: string
          portfolio_url: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["creator_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          birth_date: string
          commission_rate?: number
          created_at?: string
          intro?: string | null
          legal_name: string
          legal_name_kana: string
          portfolio_url?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["creator_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          birth_date?: string
          commission_rate?: number
          created_at?: string
          intro?: string | null
          legal_name?: string
          legal_name_kana?: string
          portfolio_url?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["creator_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_orders: {
        Row: {
          approved_at: string | null
          buyer_id: string
          color_note: string | null
          created_at: string
          creator_id: string
          desired_date: string | null
          finish_note: string | null
          id: string
          nui_size_id: number | null
          order_id: string | null
          product_id: string
          quote_filament_g: number | null
          quote_lead_days: number | null
          quote_note: string | null
          quote_part_count: number | null
          quote_price: number | null
          quote_print_min: number | null
          quote_spec: string | null
          quoted_at: string | null
          request_note: string
          status: Database["public"]["Enums"]["custom_order_status"]
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          buyer_id: string
          color_note?: string | null
          created_at?: string
          creator_id: string
          desired_date?: string | null
          finish_note?: string | null
          id?: string
          nui_size_id?: number | null
          order_id?: string | null
          product_id: string
          quote_filament_g?: number | null
          quote_lead_days?: number | null
          quote_note?: string | null
          quote_part_count?: number | null
          quote_price?: number | null
          quote_print_min?: number | null
          quote_spec?: string | null
          quoted_at?: string | null
          request_note: string
          status?: Database["public"]["Enums"]["custom_order_status"]
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          buyer_id?: string
          color_note?: string | null
          created_at?: string
          creator_id?: string
          desired_date?: string | null
          finish_note?: string | null
          id?: string
          nui_size_id?: number | null
          order_id?: string | null
          product_id?: string
          quote_filament_g?: number | null
          quote_lead_days?: number | null
          quote_note?: string | null
          quote_part_count?: number | null
          quote_price?: number | null
          quote_print_min?: number | null
          quote_spec?: string | null
          quoted_at?: string | null
          request_note?: string
          status?: Database["public"]["Enums"]["custom_order_status"]
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "custom_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      filaments: {
        Row: {
          code: string
          color_hex: string
          color_name: string
          finish: Database["public"]["Enums"]["filament_finish"]
          id: number
          is_active: boolean
          material: string
          name: string
          sort_order: number
          surcharge: number
          swatch_url: string | null
        }
        Insert: {
          code: string
          color_hex: string
          color_name: string
          finish?: Database["public"]["Enums"]["filament_finish"]
          id?: never
          is_active?: boolean
          material: string
          name: string
          sort_order?: number
          surcharge?: number
          swatch_url?: string | null
        }
        Update: {
          code?: string
          color_hex?: string
          color_name?: string
          finish?: Database["public"]["Enums"]["filament_finish"]
          id?: never
          is_active?: boolean
          material?: string
          name?: string
          sort_order?: number
          surcharge?: number
          swatch_url?: string | null
        }
        Relationships: []
      }
      message_threads: {
        Row: {
          buyer_id: string
          buyer_unread_count: number
          created_at: string
          creator_id: string
          creator_unread_count: number
          id: string
          is_closed: boolean
          kind: Database["public"]["Enums"]["thread_kind"]
          last_message_at: string
          order_id: string | null
          product_id: string | null
          subject: string | null
        }
        Insert: {
          buyer_id: string
          buyer_unread_count?: number
          created_at?: string
          creator_id: string
          creator_unread_count?: number
          id?: string
          is_closed?: boolean
          kind: Database["public"]["Enums"]["thread_kind"]
          last_message_at?: string
          order_id?: string | null
          product_id?: string | null
          subject?: string | null
        }
        Update: {
          buyer_id?: string
          buyer_unread_count?: number
          created_at?: string
          creator_id?: string
          creator_unread_count?: number
          id?: string
          is_closed?: boolean
          kind?: Database["public"]["Enums"]["thread_kind"]
          last_message_at?: string
          order_id?: string | null
          product_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "message_threads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          is_admin_note: boolean
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachment_url?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_admin_note?: boolean
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_admin_note?: boolean
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      nui_sizes: {
        Row: {
          height_mm: number
          id: number
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          height_mm: number
          id: number
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          height_mm?: number
          id?: number
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          commission_rate: number
          created_at: string
          creator_id: string
          creator_revenue: number
          filament_color_hex: string
          filament_id: number
          filament_name: string
          id: string
          item_status: Database["public"]["Enums"]["item_status"]
          line_total: number
          nui_size_id: number | null
          nui_size_label: string | null
          order_id: string
          printed_at: string | null
          product_id: string
          product_image_url: string | null
          product_title: string
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          commission_rate: number
          created_at?: string
          creator_id: string
          creator_revenue: number
          filament_color_hex: string
          filament_id: number
          filament_name: string
          id?: string
          item_status?: Database["public"]["Enums"]["item_status"]
          line_total: number
          nui_size_id?: number | null
          nui_size_label?: string | null
          order_id: string
          printed_at?: string | null
          product_id: string
          product_image_url?: string | null
          product_title: string
          quantity: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          creator_id?: string
          creator_revenue?: number
          filament_color_hex?: string
          filament_id?: number
          filament_name?: string
          id?: string
          item_status?: Database["public"]["Enums"]["item_status"]
          line_total?: number
          nui_size_id?: number | null
          nui_size_label?: string | null
          order_id?: string
          printed_at?: string | null
          product_id?: string
          product_image_url?: string | null
          product_title?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_note: string | null
          buyer_id: string
          buyer_note: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          discount: number
          id: string
          order_number: string
          paid_at: string | null
          printing_at: string | null
          refunded_at: string | null
          ship_address_line1: string
          ship_address_line2: string | null
          ship_city: string
          ship_phone: string
          ship_postal_code: string
          ship_prefecture: string
          ship_recipient_name: string
          shipped_at: string | null
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          buyer_id: string
          buyer_note?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          discount?: number
          id?: string
          order_number: string
          paid_at?: string | null
          printing_at?: string | null
          refunded_at?: string | null
          ship_address_line1: string
          ship_address_line2?: string | null
          ship_city: string
          ship_phone: string
          ship_postal_code: string
          ship_prefecture: string
          ship_recipient_name: string
          shipped_at?: string | null
          shipping_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          buyer_id?: string
          buyer_note?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          discount?: number
          id?: string
          order_number?: string
          paid_at?: string | null
          printing_at?: string | null
          refunded_at?: string | null
          ship_address_line1?: string
          ship_address_line2?: string | null
          ship_city?: string
          ship_phone?: string
          ship_postal_code?: string
          ship_prefecture?: string
          ship_recipient_name?: string
          shipped_at?: string | null
          shipping_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          account_holder_kana: string
          account_number_enc: string
          account_type: string
          bank_code: string
          bank_name: string
          branch_code: string
          branch_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_kana: string
          account_number_enc: string
          account_type: string
          bank_code: string
          bank_name: string
          branch_code: string
          branch_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_kana?: string
          account_number_enc?: string
          account_type?: string
          bank_code?: string
          bank_name?: string
          branch_code?: string
          branch_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_export_logs: {
        Row: {
          created_at: string
          exported_by: string
          id: number
          payout_ids: string[]
          row_count: number
        }
        Insert: {
          created_at?: string
          exported_by: string
          id?: never
          payout_ids: string[]
          row_count: number
        }
        Update: {
          created_at?: string
          exported_by?: string
          id?: never
          payout_ids?: string[]
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_export_logs_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_item_id: string
          payout_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_item_id: string
          payout_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_item_id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "payout_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "creator_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          commission: number
          created_at: string
          creator_id: string
          gross_amount: number
          id: string
          net_amount: number
          note: string | null
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["payout_status"]
          transaction_ref: string | null
          transfer_fee: number
          updated_at: string
        }
        Insert: {
          commission: number
          created_at?: string
          creator_id: string
          gross_amount: number
          id?: string
          net_amount: number
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          transaction_ref?: string | null
          transfer_fee?: number
          updated_at?: string
        }
        Update: {
          commission?: number
          created_at?: string
          creator_id?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          transaction_ref?: string | null
          transfer_fee?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_job_inspections: {
        Row: {
          checks: Json
          comment: string | null
          created_at: string
          id: string
          inspector_id: string
          job_id: string
          photo_url: string | null
          result: Database["public"]["Enums"]["inspection_result"]
        }
        Insert: {
          checks?: Json
          comment?: string | null
          created_at?: string
          id?: string
          inspector_id: string
          job_id: string
          photo_url?: string | null
          result: Database["public"]["Enums"]["inspection_result"]
        }
        Update: {
          checks?: Json
          comment?: string | null
          created_at?: string
          id?: string
          inspector_id?: string
          job_id?: string
          photo_url?: string | null
          result?: Database["public"]["Enums"]["inspection_result"]
        }
        Relationships: [
          {
            foreignKeyName: "print_job_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_job_inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          actual_filament_id: number | null
          actual_print_min: number | null
          actual_weight_g: number | null
          created_at: string
          creator_id: string
          due_at: string | null
          est_print_min: number | null
          est_weight_g: number | null
          id: string
          inspected_at: string | null
          note: string | null
          nui_size_id: number | null
          operator_id: string | null
          order_id: string
          order_item_id: string
          part_count: number
          printed_at: string | null
          product_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        Insert: {
          actual_filament_id?: number | null
          actual_print_min?: number | null
          actual_weight_g?: number | null
          created_at?: string
          creator_id: string
          due_at?: string | null
          est_print_min?: number | null
          est_weight_g?: number | null
          id?: string
          inspected_at?: string | null
          note?: string | null
          nui_size_id?: number | null
          operator_id?: string | null
          order_id: string
          order_item_id: string
          part_count?: number
          printed_at?: string | null
          product_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
        }
        Update: {
          actual_filament_id?: number | null
          actual_print_min?: number | null
          actual_weight_g?: number | null
          created_at?: string
          creator_id?: string
          due_at?: string | null
          est_print_min?: number | null
          est_weight_g?: number | null
          id?: string
          inspected_at?: string | null
          note?: string | null
          nui_size_id?: number | null
          operator_id?: string | null
          order_id?: string
          order_item_id?: string
          part_count?: number
          printed_at?: string | null
          product_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_actual_filament_id_fkey"
            columns: ["actual_filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
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
            isOneToOne: true
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "creator_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_asset_validations: {
        Row: {
          asset_id: string
          bbox_d_mm: number | null
          bbox_h_mm: number | null
          bbox_w_mm: number | null
          checks: Json
          created_at: string
          passed: boolean
          product_id: string
          shell_count: number | null
          triangle_count: number | null
        }
        Insert: {
          asset_id: string
          bbox_d_mm?: number | null
          bbox_h_mm?: number | null
          bbox_w_mm?: number | null
          checks?: Json
          created_at?: string
          passed: boolean
          product_id: string
          shell_count?: number | null
          triangle_count?: number | null
        }
        Update: {
          asset_id?: string
          bbox_d_mm?: number | null
          bbox_h_mm?: number | null
          bbox_w_mm?: number | null
          checks?: Json
          created_at?: string
          passed?: boolean
          product_id?: string
          shell_count?: number | null
          triangle_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_asset_validations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "product_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_validations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          checksum_sha256: string | null
          color_slot: number | null
          created_at: string
          filament_id: number | null
          file_ext: string
          file_size: number
          id: string
          layer_direction: string | null
          original_name: string
          part_label: string | null
          print_note: string | null
          product_id: string
          quantity_per_item: number
          sort_order: number
          storage_path: string
          support_type: string | null
        }
        Insert: {
          checksum_sha256?: string | null
          color_slot?: number | null
          created_at?: string
          filament_id?: number | null
          file_ext: string
          file_size: number
          id?: string
          layer_direction?: string | null
          original_name: string
          part_label?: string | null
          print_note?: string | null
          product_id: string
          quantity_per_item?: number
          sort_order?: number
          storage_path: string
          support_type?: string | null
        }
        Update: {
          checksum_sha256?: string | null
          color_slot?: number | null
          created_at?: string
          filament_id?: number | null
          file_ext?: string
          file_size?: number
          id?: string
          layer_direction?: string | null
          original_name?: string
          part_label?: string | null
          print_note?: string | null
          product_id?: string
          quantity_per_item?: number
          sort_order?: number
          storage_path?: string
          support_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_filaments: {
        Row: {
          filament_id: number
          is_default: boolean
          product_id: string
        }
        Insert: {
          filament_id: number
          is_default?: boolean
          product_id: string
        }
        Update: {
          filament_id?: number
          is_default?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_filaments_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_filaments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_fix_requests: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          inspector_comment: string | null
          job_id: string | null
          photo_url: string | null
          product_id: string
          reason: string
          reprint_fee: number
          resolved_at: string | null
          status: Database["public"]["Enums"]["fix_request_status"]
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          inspector_comment?: string | null
          job_id?: string | null
          photo_url?: string | null
          product_id: string
          reason: string
          reprint_fee?: number
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["fix_request_status"]
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          inspector_comment?: string | null
          job_id?: string | null
          photo_url?: string | null
          product_id?: string
          reason?: string
          reprint_fee?: number
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["fix_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "product_fix_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fix_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fix_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          image_url: string
          product_id: string
          sort_order: number
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          image_url: string
          product_id: string
          sort_order?: number
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          image_url?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_nui_sizes: {
        Row: {
          nui_size_id: number
          product_id: string
        }
        Insert: {
          nui_size_id: number
          product_id: string
        }
        Update: {
          nui_size_id?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_nui_sizes_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_nui_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_size_variants: {
        Row: {
          agency_fee: number
          created_at: string
          est_print_min: number | null
          est_weight_g: number | null
          is_active: boolean
          nui_size_id: number
          price: number
          product_id: string
          stock: number
          unavailable_reason: string | null
          updated_at: string
        }
        Insert: {
          agency_fee?: number
          created_at?: string
          est_print_min?: number | null
          est_weight_g?: number | null
          is_active?: boolean
          nui_size_id: number
          price: number
          product_id: string
          stock?: number
          unavailable_reason?: string | null
          updated_at?: string
        }
        Update: {
          agency_fee?: number
          created_at?: string
          est_print_min?: number | null
          est_weight_g?: number | null
          is_active?: boolean
          nui_size_id?: number
          price?: number
          product_id?: string
          stock?: number
          unavailable_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_size_variants_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_size_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: number
        }
        Insert: {
          product_id: string
          tag_id: number
        }
        Update: {
          product_id?: string
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category_id: number
          created_at: string
          creator_id: string
          deleted_at: string | null
          description: string
          est_print_min: number | null
          est_weight_g: number | null
          favorite_count: number
          id: string
          max_concurrent_orders: number | null
          print_note: string | null
          published_at: string | null
          rejected_reason: string | null
          review_avg: number
          review_count: number
          size_d_mm: number | null
          size_h_mm: number | null
          size_w_mm: number | null
          slug: string
          sold_count: number
          status: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at: string
        }
        Insert: {
          base_price: number
          category_id: number
          created_at?: string
          creator_id: string
          deleted_at?: string | null
          description: string
          est_print_min?: number | null
          est_weight_g?: number | null
          favorite_count?: number
          id?: string
          max_concurrent_orders?: number | null
          print_note?: string | null
          published_at?: string | null
          rejected_reason?: string | null
          review_avg?: number
          review_count?: number
          size_d_mm?: number | null
          size_h_mm?: number | null
          size_w_mm?: number | null
          slug: string
          sold_count?: number
          status?: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          category_id?: number
          created_at?: string
          creator_id?: string
          deleted_at?: string | null
          description?: string
          est_print_min?: number | null
          est_weight_g?: number | null
          favorite_count?: number
          id?: string
          max_concurrent_orders?: number | null
          print_note?: string | null
          published_at?: string | null
          rejected_reason?: string | null
          review_avg?: number
          review_count?: number
          size_d_mm?: number | null
          size_h_mm?: number | null
          size_w_mm?: number | null
          slug?: string
          sold_count?: number
          status?: Database["public"]["Enums"]["product_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          email_opt_in: boolean
          handle: string
          id: string
          is_creator: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          email_opt_in?: boolean
          handle: string
          id: string
          is_creator?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email_opt_in?: boolean
          handle?: string
          id?: string
          is_creator?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      review_images: {
        Row: {
          id: string
          image_url: string
          review_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          image_url: string
          review_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          image_url?: string
          review_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          creator_replied_at: string | null
          creator_reply: string | null
          deleted_at: string | null
          id: string
          is_public: boolean
          order_item_id: string
          product_id: string
          rating: number
          rating_accuracy: number | null
          rating_design: number | null
          rating_size: number | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          creator_replied_at?: string | null
          creator_reply?: string | null
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          order_item_id: string
          product_id: string
          rating: number
          rating_accuracy?: number | null
          rating_design?: number | null
          rating_size?: number | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          creator_replied_at?: string | null
          creator_reply?: string | null
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          order_item_id?: string
          product_id?: string
          rating?: number
          rating_accuracy?: number | null
          rating_design?: number | null
          rating_size?: number | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "creator_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating_delivery: number
          rating_packing: number
          rating_print: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating_delivery: number
          rating_packing: number
          rating_print: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating_delivery?: number
          rating_packing?: number
          rating_print?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "service_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string
          created_at: string
          created_by: string
          id: string
          order_id: string
          shipped_at: string
          tracking_number: string
          tracking_url: string | null
        }
        Insert: {
          carrier: string
          created_at?: string
          created_by: string
          id?: string
          order_id: string
          shipped_at?: string
          tracking_number: string
          tracking_url?: string | null
        }
        Update: {
          carrier?: string
          created_at?: string
          created_by?: string
          id?: string
          order_id?: string
          shipped_at?: string
          tracking_number?: string
          tracking_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          phone: string
          postal_code: string
          prefecture: string
          recipient_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          phone: string
          postal_code: string
          prefecture: string
          recipient_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          phone?: string
          postal_code?: string
          prefecture?: string
          recipient_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          created_at: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string
          id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: number
          is_active: boolean
          kind: string
          name: string
          slug: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          kind?: string
          name: string
          slug: string
        }
        Update: {
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_nuis: {
        Row: {
          created_at: string
          custom_height_mm: number | null
          id: string
          is_primary: boolean
          name: string
          note: string | null
          nui_size_id: number
          photo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_height_mm?: number | null
          id?: string
          is_primary?: boolean
          name: string
          note?: string | null
          nui_size_id: number
          photo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_height_mm?: number | null
          id?: string
          is_primary?: boolean
          name?: string
          note?: string | null
          nui_size_id?: number
          photo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_nuis_nui_size_id_fkey"
            columns: ["nui_size_id"]
            isOneToOne: false
            referencedRelation: "nui_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_nuis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_production_sheets: {
        Row: {
          assets: Json | null
          creator_name: string | null
          est_print_min: number | null
          est_weight_g: number | null
          filament_color_hex: string | null
          filament_name: string | null
          item_status: Database["public"]["Enums"]["item_status"] | null
          nui_size_label: string | null
          order_id: string | null
          order_item_id: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          paid_at: string | null
          print_note: string | null
          product_title: string | null
          quantity: number | null
        }
        Relationships: []
      }
      creator_order_items: {
        Row: {
          commission_rate: number | null
          created_at: string | null
          creator_revenue: number | null
          filament_name: string | null
          id: string | null
          item_status: Database["public"]["Enums"]["item_status"] | null
          line_total: number | null
          nui_size_label: string | null
          order_id: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          paid_at: string | null
          product_id: string | null
          product_title: string | null
          quantity: number | null
          shipped_at: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_production_sheets"
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_export_payout_accounts: {
        Args: { p_key: string; p_payout_ids: string[] }
        Returns: {
          account_holder_kana: string
          account_number: string
          account_type: string
          bank_code: string
          bank_name: string
          branch_code: string
          branch_name: string
          creator_id: string
          net_amount: number
          payout_id: string
        }[]
      }
      admin_mark_payout_paid: {
        Args: { p_payout_id: string; p_transaction_ref: string }
        Returns: undefined
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      close_payouts: {
        Args: {
          p_min_amount: number
          p_period_end: string
          p_period_start: string
          p_transfer_fee: number
        }
        Returns: {
          creator_id: string
          net_amount: number
          status: string
        }[]
      }
      create_order_from_custom_order: {
        Args: {
          p_address_id: string
          p_custom_order_id: string
          p_shipping_fee: number
        }
        Returns: {
          order_id: string
        }[]
      }
      create_pending_order: {
        Args: {
          p_address_id: string
          p_buyer_id: string
          p_shipping_fee: number
        }
        Returns: {
          order_id: string
        }[]
      }
      create_product_with_relations: {
        Args: { p_creator_id: string; p_payload: Json }
        Returns: {
          id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved_creator: { Args: { uid?: string }; Returns: boolean }
      is_thread_member: { Args: { tid: string }; Returns: boolean }
      mark_order_paid: {
        Args: { p_order_id: string; p_payment_intent_id: string }
        Returns: undefined
      }
      owns_order: { Args: { oid: string }; Returns: boolean }
      owns_product: { Args: { pid: string }; Returns: boolean }
      resolve_unit_price: {
        Args: { p_nui_size_id: number; p_product_id: string }
        Returns: number
      }
      search_products: {
        Args: {
          p_category_id?: number
          p_creator_handle?: string
          p_filament_ids?: number[]
          p_nui_size_ids?: number[]
          p_page?: number
          p_per_page?: number
          p_price_max?: number
          p_price_min?: number
          p_q?: string
          p_sort?: string
          p_tag_ids?: number[]
        }
        Returns: {
          base_price: number
          creator_display_name: string
          creator_handle: string
          creator_id: string
          favorite_count: number
          id: string
          image_url: string
          max_price: number
          review_avg: number
          review_count: number
          slug: string
          title: string
          total_count: number
          variant_count: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_product_with_relations: {
        Args: { p_creator_id: string; p_payload: Json; p_product_id: string }
        Returns: {
          id: string
        }[]
      }
      upsert_payout_account: {
        Args: {
          p_account_holder_kana: string
          p_account_number: string
          p_account_type: string
          p_bank_code: string
          p_bank_name: string
          p_branch_code: string
          p_branch_name: string
          p_key: string
        }
        Returns: undefined
      }
    }
    Enums: {
      creator_status: "pending" | "approved" | "suspended"
      custom_order_status:
        | "requested"
        | "quoted"
        | "approved"
        | "rejected"
        | "paid"
        | "cancelled"
      filament_finish: "matte" | "glossy" | "silk" | "glitter" | "transparent"
      fix_request_status: "open" | "resolved" | "dismissed"
      inspection_result: "pass" | "fail_model" | "fail_print"
      item_status: "pending" | "printing" | "printed" | "shipped" | "cancelled"
      order_status:
        | "pending_payment"
        | "paid"
        | "printing"
        | "shipped"
        | "completed"
        | "cancelled"
        | "refunded"
      payout_status: "unpaid" | "scheduled" | "paid" | "failed"
      print_job_status: "queued" | "printing" | "inspection" | "done" | "failed"
      product_status:
        | "draft"
        | "in_review"
        | "published"
        | "rejected"
        | "archived"
      thread_kind: "pre_purchase" | "order"
      user_role: "user" | "admin"
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
      creator_status: ["pending", "approved", "suspended"],
      custom_order_status: [
        "requested",
        "quoted",
        "approved",
        "rejected",
        "paid",
        "cancelled",
      ],
      filament_finish: ["matte", "glossy", "silk", "glitter", "transparent"],
      fix_request_status: ["open", "resolved", "dismissed"],
      inspection_result: ["pass", "fail_model", "fail_print"],
      item_status: ["pending", "printing", "printed", "shipped", "cancelled"],
      order_status: [
        "pending_payment",
        "paid",
        "printing",
        "shipped",
        "completed",
        "cancelled",
        "refunded",
      ],
      payout_status: ["unpaid", "scheduled", "paid", "failed"],
      print_job_status: ["queued", "printing", "inspection", "done", "failed"],
      product_status: [
        "draft",
        "in_review",
        "published",
        "rejected",
        "archived",
      ],
      thread_kind: ["pre_purchase", "order"],
      user_role: ["user", "admin"],
    },
  },
} as const

