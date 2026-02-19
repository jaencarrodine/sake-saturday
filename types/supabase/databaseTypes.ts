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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      sakes: {
        Row: {
          id: string
          name: string
          brewery: string | null
          prefecture: string | null
          grade: string | null
          type: string | null
          alc_pct: number | null
          smv: number | null
          rice: string | null
          polishing_ratio: number | null
          opacity: string | null
          profile: string | null
          serving_temp: string | null
          front_image_url: string | null
          back_image_url: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          name: string
          brewery?: string | null
          prefecture?: string | null
          grade?: string | null
          type?: string | null
          alc_pct?: number | null
          smv?: number | null
          rice?: string | null
          polishing_ratio?: number | null
          opacity?: string | null
          profile?: string | null
          serving_temp?: string | null
          front_image_url?: string | null
          back_image_url?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          brewery?: string | null
          prefecture?: string | null
          grade?: string | null
          type?: string | null
          alc_pct?: number | null
          smv?: number | null
          rice?: string | null
          polishing_ratio?: number | null
          opacity?: string | null
          profile?: string | null
          serving_temp?: string | null
          front_image_url?: string | null
          back_image_url?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      tasters: {
        Row: {
          id: string
          name: string
          email: string | null
          profile_image_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          profile_image_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          profile_image_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tastings: {
        Row: {
          id: string
          sake_id: string
          date: string
          location_name: string | null
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          images: string[] | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          sake_id: string
          date?: string
          location_name?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          images?: string[] | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          sake_id?: string
          date?: string
          location_name?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          images?: string[] | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tastings_sake_id_fkey"
            columns: ["sake_id"]
            isOneToOne: false
            referencedRelation: "sakes"
            referencedColumns: ["id"]
          }
        ]
      }
      tasting_scores: {
        Row: {
          id: string
          tasting_id: string
          taster_id: string
          score: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tasting_id: string
          taster_id: string
          score: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tasting_id?: string
          taster_id?: string
          score?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasting_scores_tasting_id_fkey"
            columns: ["tasting_id"]
            isOneToOne: false
            referencedRelation: "tastings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasting_scores_taster_id_fkey"
            columns: ["taster_id"]
            isOneToOne: false
            referencedRelation: "tasters"
            referencedColumns: ["id"]
          }
        ]
      }
      tasting_tasters: {
        Row: {
          tasting_id: string
          taster_id: string
        }
        Insert: {
          tasting_id: string
          taster_id: string
        }
        Update: {
          tasting_id?: string
          taster_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasting_tasters_tasting_id_fkey"
            columns: ["tasting_id"]
            isOneToOne: false
            referencedRelation: "tastings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasting_tasters_taster_id_fkey"
            columns: ["taster_id"]
            isOneToOne: false
            referencedRelation: "tasters"
            referencedColumns: ["id"]
          }
        ]
      }
      tasting_images: {
        Row: {
          id: string
          tasting_id: string
          original_image_url: string | null
          generated_image_url: string | null
          image_type: string
          prompt_used: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tasting_id: string
          original_image_url?: string | null
          generated_image_url?: string | null
          image_type: string
          prompt_used?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tasting_id?: string
          original_image_url?: string | null
          generated_image_url?: string | null
          image_type?: string
          prompt_used?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasting_images_tasting_id_fkey"
            columns: ["tasting_id"]
            isOneToOne: false
            referencedRelation: "tastings"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      sake_averages: {
        Row: {
          id: string
          name: string
          brewery: string | null
          type: string | null
          front_image_url: string | null
          avg_score: number
          tasting_count: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
