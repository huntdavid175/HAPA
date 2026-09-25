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
      broadcasts: {
        Row: {
          audience_filter: Json
          body: string
          channels: Database["public"]["Enums"]["delivery_channel"][]
          created_at: string
          created_by: string | null
          event_id: string
          failed_count: number
          id: string
          recipient_count: number
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["broadcast_status"]
          subject: string | null
          updated_at: string
          whatsapp_template: string | null
        }
        Insert: {
          audience_filter?: Json
          body: string
          channels: Database["public"]["Enums"]["delivery_channel"][]
          created_at?: string
          created_by?: string | null
          event_id: string
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["broadcast_status"]
          subject?: string | null
          updated_at?: string
          whatsapp_template?: string | null
        }
        Update: {
          audience_filter?: Json
          body?: string
          channels?: Database["public"]["Enums"]["delivery_channel"][]
          created_at?: string
          created_by?: string | null
          event_id?: string
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["broadcast_status"]
          subject?: string | null
          updated_at?: string
          whatsapp_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          booking_info: string
          cover_image: string | null
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          name: string
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          timezone: string
          updated_at: string
          venue: string
        }
        Insert: {
          booking_info?: string
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          id?: string
          name: string
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          updated_at?: string
          venue?: string
        }
        Update: {
          booking_info?: string
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          id?: string
          name?: string
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          updated_at?: string
          venue?: string
        }
        Relationships: []
      }
      message_deliveries: {
        Row: {
          attempts: number
          body: string
          broadcast_id: string | null
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at: string
          error: string | null
          id: string
          last_attempt_at: string | null
          next_attempt_at: string
          order_id: string | null
          provider: string
          provider_message_id: string | null
          recipient: string
          status: Database["public"]["Enums"]["delivery_status"]
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          body: string
          broadcast_id?: string | null
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string
          order_id?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient: string
          status?: Database["public"]["Enums"]["delivery_status"]
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string
          broadcast_id?: string | null
          channel?: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string
          order_id?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_deliveries_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deliveries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          tier_id: string
          unit_price_pesewas: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          tier_id: string
          unit_price_pesewas: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          tier_id?: string
          unit_price_pesewas?: number
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
            foreignKeyName: "order_items_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_email: string
          buyer_name: string
          buyer_phone: string
          created_at: string
          currency: string
          event_id: string
          hold_expires_at: string
          id: string
          ip_hash: string | null
          needs_refund: boolean
          paid_at: string | null
          paystack_channel: string | null
          paystack_reference: string
          refund_reason: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_pesewas: number
          updated_at: string
        }
        Insert: {
          buyer_email: string
          buyer_name: string
          buyer_phone: string
          created_at?: string
          currency?: string
          event_id: string
          hold_expires_at: string
          id?: string
          ip_hash?: string | null
          needs_refund?: boolean
          paid_at?: string | null
          paystack_channel?: string | null
          paystack_reference: string
          refund_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_pesewas: number
          updated_at?: string
        }
        Update: {
          buyer_email?: string
          buyer_name?: string
          buyer_phone?: string
          created_at?: string
          currency?: string
          event_id?: string
          hold_expires_at?: string
          id?: string
          ip_hash?: string | null
          needs_refund?: boolean
          paid_at?: string | null
          paystack_channel?: string | null
          paystack_reference?: string
          refund_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_pesewas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      ticket_tiers: {
        Row: {
          active: boolean
          badge: string | null
          benefits: string[]
          capacity: number
          created_at: string
          currency: string
          description: string
          event_id: string
          highlight: boolean
          id: string
          name: string
          position: number
          price_pesewas: number
          sales_end: string | null
          sales_start: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          benefits?: string[]
          capacity: number
          created_at?: string
          currency?: string
          description?: string
          event_id: string
          highlight?: boolean
          id?: string
          name: string
          position?: number
          price_pesewas: number
          sales_end?: string | null
          sales_start?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          benefits?: string[]
          capacity?: number
          created_at?: string
          currency?: string
          description?: string
          event_id?: string
          highlight?: boolean
          id?: string
          name?: string
          position?: number
          price_pesewas?: number
          sales_end?: string | null
          sales_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          created_at: string
          event_id: string
          id: string
          order_id: string
          qr_token: string
          refunded_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          tier_id: string
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id: string
          id?: string
          order_id: string
          qr_token?: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tier_id: string
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id?: string
          id?: string
          order_id?: string
          qr_token?: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tier_id?: string
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_in_ticket: {
        Args: { p_lookup: string; p_staff?: string }
        Returns: {
          buyer_name: string
          checked_in_at: string
          outcome: string
          ticket_code: string
          tier_name: string
        }[]
      }
      claim_message_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          body: string
          broadcast_id: string | null
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at: string
          error: string | null
          id: string
          last_attempt_at: string | null
          next_attempt_at: string
          order_id: string | null
          provider: string
          provider_message_id: string | null
          recipient: string
          status: Database["public"]["Enums"]["delivery_status"]
          ticket_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enqueue_broadcast: { Args: { p_broadcast_id: string }; Returns: number }
      expire_stale_holds: {
        Args: { p_grace_minutes?: number }
        Returns: number
      }
      generate_qr_token: { Args: never; Returns: string }
      generate_ticket_code: { Args: never; Returns: string }
      issue_tickets_for_order: {
        Args: { p_channel?: string; p_order_id: string }
        Returns: {
          issued: number
          shortfall: number
        }[]
      }
      lookup_tickets: {
        Args: { p_event: string; p_query: string }
        Returns: {
          buyer_name: string
          checked_in_at: string
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_id: string
          tier_name: string
        }[]
      }
      refresh_broadcast_counts: {
        Args: { p_broadcast_id: string }
        Returns: undefined
      }
      reserve_tickets: {
        Args: {
          p_buyer_email: string
          p_buyer_name: string
          p_buyer_phone: string
          p_event_id: string
          p_hold_minutes?: number
          p_ip_hash?: string
          p_items: Json
          p_reference: string
        }
        Returns: {
          currency: string
          order_id: string
          total_pesewas: number
        }[]
      }
      tier_availability: {
        Args: { p_event_id: string }
        Returns: {
          available: number
          capacity: number
          held: number
          sold: number
          tier_id: string
        }[]
      }
    }
    Enums: {
      broadcast_status: "draft" | "queued" | "sending" | "sent" | "failed"
      delivery_channel: "sms" | "whatsapp" | "email"
      delivery_status: "queued" | "sending" | "sent" | "delivered" | "failed"
      event_status: "draft" | "published" | "sales_closed" | "archived"
      order_status: "pending" | "paid" | "failed" | "expired"
      ticket_status: "issued" | "checked_in" | "void"
      user_role: "admin" | "staff"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      broadcast_status: ["draft", "queued", "sending", "sent", "failed"],
      delivery_channel: ["sms", "whatsapp", "email"],
      delivery_status: ["queued", "sending", "sent", "delivered", "failed"],
      event_status: ["draft", "published", "sales_closed", "archived"],
      order_status: ["pending", "paid", "failed", "expired"],
      ticket_status: ["issued", "checked_in", "void"],
      user_role: ["admin", "staff"],
    },
  },
} as const
