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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      coffee_notes: {
        Row: {
          coffee_day: number
          note: string
        }
        Insert: {
          coffee_day: number
          note: string
        }
        Update: {
          coffee_day?: number
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "coffee_notes_coffee_day_fkey"
            columns: ["coffee_day"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["day"]
          },
        ]
      }
      coffees: {
        Row: {
          altitude_max: number | null
          altitude_min: number | null
          continent: string | null
          country: string | null
          day: number
          description: string | null
          image_url: string | null
          manual_fields: string[]
          name: string
          process: string | null
          product_url: string | null
          region: string | null
          roast: string | null
          scraped_at: string | null
          source_url: string | null
          variety: string | null
        }
        Insert: {
          altitude_max?: number | null
          altitude_min?: number | null
          continent?: string | null
          country?: string | null
          day: number
          description?: string | null
          image_url?: string | null
          manual_fields?: string[]
          name: string
          process?: string | null
          product_url?: string | null
          region?: string | null
          roast?: string | null
          scraped_at?: string | null
          source_url?: string | null
          variety?: string | null
        }
        Update: {
          altitude_max?: number | null
          altitude_min?: number | null
          continent?: string | null
          country?: string | null
          day?: number
          description?: string | null
          image_url?: string | null
          manual_fields?: string[]
          name?: string
          process?: string | null
          product_url?: string | null
          region?: string | null
          roast?: string | null
          scraped_at?: string | null
          source_url?: string | null
          variety?: string | null
        }
        Relationships: []
      }
      join_attempts: {
        Row: {
          created_at: string
          id: number
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          success: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_admin: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_admin?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      ratings: {
        Row: {
          coffee_day: number
          comment: string | null
          created_at: string
          fill_level: Database["public"]["Enums"]["fill_level"]
          id: string
          score: number
          steep_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coffee_day: number
          comment?: string | null
          created_at?: string
          fill_level?: Database["public"]["Enums"]["fill_level"]
          id?: string
          score: number
          steep_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          coffee_day?: number
          comment?: string | null
          created_at?: string
          fill_level?: Database["public"]["Enums"]["fill_level"]
          id?: string
          score?: number
          steep_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_coffee_day_fkey"
            columns: ["coffee_day"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["day"]
          },
          {
            foreignKeyName: "ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          calendar_year: number
          group_code_hash: string | null
          id: boolean
          show_future_days: boolean
        }
        Insert: {
          calendar_year?: number
          group_code_hash?: string | null
          id?: boolean
          show_future_days?: boolean
        }
        Update: {
          calendar_year?: number
          group_code_hash?: string | null
          id?: boolean
          show_future_days?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cph_date: { Args: { p_ts: string }; Returns: string }
      create_profile: {
        Args: { p_display_name: string; p_group_code: string }
        Returns: string
      }
      has_rated: { Args: { p_day: number }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      open_day: { Args: never; Returns: number }
      open_day_on: { Args: { p_date: string; p_year: number }; Returns: number }
      participation: {
        Args: never
        Returns: {
          coffee_day: number
          user_id: string
        }[]
      }
      set_group_code: { Args: { p_code: string }; Returns: undefined }
      today_cph: { Args: never; Returns: string }
    }
    Enums: {
      fill_level: "mild" | "medium" | "strong"
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
      fill_level: ["mild", "medium", "strong"],
    },
  },
} as const
