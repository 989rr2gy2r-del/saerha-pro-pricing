export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          brand: string | null
          created_at: string
          extra: Json
          free_quantity: number | null
          id: string
          line_no: number | null
          line_total: number | null
          matched_sku: string | null
          notes: string | null
          order_id: string
          product_id: string | null
          quantity: number | null
          raw_name: string | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          extra?: Json
          free_quantity?: number | null
          id?: string
          line_no?: number | null
          line_total?: number | null
          matched_sku?: string | null
          notes?: string | null
          order_id: string
          product_id?: string | null
          quantity?: number | null
          raw_name?: string | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          extra?: Json
          free_quantity?: number | null
          id?: string
          line_no?: number | null
          line_total?: number | null
          matched_sku?: string | null
          notes?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number | null
          raw_name?: string | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
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
          created_at: string
          customer_id: string | null
          file_url: string | null
          id: string
          notes: string | null
          raw_text: string | null
          received_at: string
          reference: string
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          raw_text?: string | null
          received_at?: string
          reference: string
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          raw_text?: string | null
          received_at?: string
          reference?: string
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          currency: string
          customer_id: string | null
          id: string
          new_amount: number | null
          old_amount: number | null
          price_id: string | null
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          new_amount?: number | null
          old_amount?: number | null
          price_id?: string | null
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          new_amount?: number | null
          old_amount?: number | null
          price_id?: string | null
          price_type?: Database["public"]["Enums"]["price_type"]
          product_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          extra: Json
          id: string
          is_active: boolean
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          source: string | null
          source_field: string | null
          source_price_type: string | null
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          extra?: Json
          id?: string
          is_active?: boolean
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          source?: string | null
          source_field?: string | null
          source_price_type?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          extra?: Json
          id?: string
          is_active?: boolean
          price_type?: Database["public"]["Enums"]["price_type"]
          product_id?: string
          source?: string | null
          source_field?: string | null
          source_price_type?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          lang: string | null
          normalized_alias: string | null
          product_id: string
          source: Database["public"]["Enums"]["alias_source"]
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          lang?: string | null
          normalized_alias?: string | null
          product_id: string
          source?: Database["public"]["Enums"]["alias_source"]
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          lang?: string | null
          normalized_alias?: string | null
          product_id?: string
          source?: Database["public"]["Enums"]["alias_source"]
        }
        Relationships: [
          {
            foreignKeyName: "product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_main: string | null
          category_main_en: string | null
          category_sub: string | null
          category_sub_en: string | null
          category_third: string | null
          color: string | null
          country_of_origin: string | null
          created_at: string
          description: string | null
          extra: Json
          id: string
          image_url: string | null
          model: string | null
          name_ar: string
          name_en: string | null
          product_group: string | null
          short_name: string | null
          size: string | null
          sku: string
          source: string | null
          status: Database["public"]["Enums"]["product_status"]
          supplier: string | null
          unit: string | null
          updated_at: string
          warranty: string | null
        }
        Insert: {
          brand?: string | null
          category_main?: string | null
          category_main_en?: string | null
          category_sub?: string | null
          category_sub_en?: string | null
          category_third?: string | null
          color?: string | null
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          extra?: Json
          id?: string
          image_url?: string | null
          model?: string | null
          name_ar: string
          name_en?: string | null
          product_group?: string | null
          short_name?: string | null
          size?: string | null
          sku: string
          source?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          supplier?: string | null
          unit?: string | null
          updated_at?: string
          warranty?: string | null
        }
        Update: {
          brand?: string | null
          category_main?: string | null
          category_main_en?: string | null
          category_sub?: string | null
          category_sub_en?: string | null
          category_third?: string | null
          color?: string | null
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          extra?: Json
          id?: string
          image_url?: string | null
          model?: string | null
          name_ar?: string
          name_en?: string | null
          product_group?: string | null
          short_name?: string | null
          size?: string | null
          sku?: string
          source?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          supplier?: string | null
          unit?: string | null
          updated_at?: string
          warranty?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          applied_price_type: Database["public"]["Enums"]["price_type"]
          created_at: string
          discount_amount: number
          id: string
          is_manual_price: boolean
          line_no: number | null
          line_total: number
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          quotation_id: string
          sku: string | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          applied_price_type?: Database["public"]["Enums"]["price_type"]
          created_at?: string
          discount_amount?: number
          id?: string
          is_manual_price?: boolean
          line_no?: number | null
          line_total?: number
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          quotation_id: string
          sku?: string | null
          unit?: string | null
          unit_price?: number
        }
        Update: {
          applied_price_type?: Database["public"]["Enums"]["price_type"]
          created_at?: string
          discount_amount?: number
          id?: string
          is_manual_price?: boolean
          line_no?: number | null
          line_total?: number
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          quotation_id?: string
          sku?: string | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          discount_amount: number
          expiry_date: string | null
          id: string
          issue_date: string
          notes: string | null
          order_id: string | null
          price_type: Database["public"]["Enums"]["price_type"]
          reference: string
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_amount?: number
          expiry_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          order_id?: string | null
          price_type?: Database["public"]["Enums"]["price_type"]
          reference: string
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_amount?: number
          expiry_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          order_id?: string | null
          price_type?: Database["public"]["Enums"]["price_type"]
          reference?: string
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string
          id: string
          name_ar: string
          name_en: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name_ar: string
          name_en?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alias_source: "manual" | "import" | "learned"
      app_role: "admin" | "sales" | "viewer"
      customer_type: "retail" | "wholesale" | "contractor" | "government"
      order_source: "image" | "pdf" | "excel" | "text" | "handwriting"
      order_status: "new" | "in_review" | "priced" | "closed"
      price_type:
        | "retail"
        | "reseller"
        | "customer_special"
        | "manual_quote"
        | "unit_price"
        | "price_after_discount"
        | "retail_min"
      product_status: "active" | "inactive"
      quote_status: "draft" | "sent" | "accepted" | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alias_source: ["manual", "import", "learned"],
      app_role: ["admin", "sales", "viewer"],
      customer_type: ["retail", "wholesale", "contractor", "government"],
      order_source: ["image", "pdf", "excel", "text", "handwriting"],
      order_status: ["new", "in_review", "priced", "closed"],
      price_type: [
        "retail",
        "reseller",
        "customer_special",
        "manual_quote",
        "unit_price",
        "price_after_discount",
        "retail_min",
      ],
      product_status: ["active", "inactive"],
      quote_status: ["draft", "sent", "accepted", "expired"],
    },
  },
} as const
