export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activity: {
        Row: {
          action: string;
          actor_id: string | null;
          after_state: Json | null;
          before_state: Json | null;
          created_at: string;
          household_id: string;
          id: number;
          item_id: string | null;
          label: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          household_id: string;
          id?: never;
          item_id?: string | null;
          label: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after_state?: Json | null;
          before_state?: Json | null;
          created_at?: string;
          household_id?: string;
          id?: never;
          item_id?: string | null;
          label?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'inventory';
            referencedColumns: ['id'];
          },
        ];
      };
      cooking_sessions: {
        Row: {
          expires_at: string;
          household_id: string;
          id: string;
          meal_data: NonNullable<Json>;
          recipe: NonNullable<Json>;
          user_id: string;
        };
        Insert: {
          expires_at?: string;
          household_id: string;
          id: string;
          meal_data: NonNullable<Json>;
          recipe: NonNullable<Json>;
          user_id: string;
        };
        Update: {
          expires_at?: string;
          household_id?: string;
          id?: string;
          meal_data?: NonNullable<Json>;
          recipe?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cooking_sessions_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          locations: string[];
          name: string;
          owner_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          locations?: string[];
          name: string;
          owner_id: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          locations?: string[];
          name?: string;
          owner_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      ingredient_reservations: {
        Row: {
          amount: number;
          item_id: string;
          session_id: string;
        };
        Insert: {
          amount: number;
          item_id: string;
          session_id: string;
        };
        Update: {
          amount?: number;
          item_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredient_reservations_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'inventory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ingredient_reservations_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'cooking_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory: {
        Row: {
          category: string;
          deleted: boolean;
          expiry_date: string;
          household_id: string;
          id: string;
          location: string;
          name: string;
          quantity: number | null;
          stock: number;
          unit: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          category?: string;
          deleted?: boolean;
          expiry_date: string;
          household_id: string;
          id?: string;
          location?: string;
          name: string;
          quantity?: number | null;
          stock?: number;
          unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          category?: string;
          deleted?: boolean;
          expiry_date?: string;
          household_id?: string;
          id?: string;
          location?: string;
          name?: string;
          quantity?: number | null;
          stock?: number;
          unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          household_id: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          household_id: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          household_id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      outcomes: {
        Row: {
          actor_id: string | null;
          created_at: string;
          household_id: string;
          id: string;
          ingredients: NonNullable<Json>;
          recipe: NonNullable<Json>;
          synthetic: boolean;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          household_id: string;
          id: string;
          ingredients: NonNullable<Json>;
          recipe: NonNullable<Json>;
          synthetic?: boolean;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          ingredients?: NonNullable<Json>;
          recipe?: NonNullable<Json>;
          synthetic?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'outcomes_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          display_name: string;
          exclusions: string[];
          id: string;
        };
        Insert: {
          display_name: string;
          exclusions?: string[];
          id: string;
        };
        Update: {
          display_name?: string;
          exclusions?: string[];
          id?: string;
        };
        Relationships: [];
      };
      quantity_events: {
        Row: {
          activity_id: number | null;
          amount: number;
          before_quantity: number | null;
          category: string;
          created_at: string;
          discard_reason: string | null;
          household_id: string;
          id: string;
          item_id: string;
          kind: string;
          name: string;
          quantity: number;
          sequence: number;
          synthetic: boolean;
          unit: string;
          voided: boolean;
        };
        Insert: {
          activity_id?: number | null;
          amount: number;
          before_quantity?: number | null;
          category: string;
          created_at?: string;
          discard_reason?: string | null;
          household_id: string;
          id?: string;
          item_id: string;
          kind: string;
          name: string;
          quantity: number;
          sequence?: never;
          synthetic?: boolean;
          unit: string;
          voided?: boolean;
        };
        Update: {
          activity_id?: number | null;
          amount?: number;
          before_quantity?: number | null;
          category?: string;
          created_at?: string;
          discard_reason?: string | null;
          household_id?: string;
          id?: string;
          item_id?: string;
          kind?: string;
          name?: string;
          quantity?: number;
          sequence?: never;
          synthetic?: boolean;
          unit?: string;
          voided?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'quantity_events_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quantity_events_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quantity_events_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'inventory';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_inventory_batch: {
        Args: { expected_household: string; items_data: Json; request_id: string };
        Returns: Json;
      };
      claim_meal_image: {
        Args: { actor: string; cache_key: string; household: string; session_id: string };
        Returns: Json;
      };
      complete_meal_image: {
        Args: { cache_key: string; image_data: string; media_type: string };
        Returns: undefined;
      };
      confirm_meal: {
        Args: {
          actor: string;
          changes: Json;
          household: string;
          recipe_data: Json;
          session_id: string;
        };
        Returns: string;
      };
      confirm_reserved_meal: {
        Args: {
          actor: string;
          changes: Json;
          household: string;
          recipe_data: Json;
          session_id: string;
        };
        Returns: string;
      };
      cooking_state: { Args: Record<PropertyKey, never>; Returns: Json };
      fail_meal_image: { Args: { cache_key: string }; Returns: undefined };
      manage_cooking: {
        Args: { action: string; actor: string; household: string; session_id: string };
        Returns: undefined;
      };
      member_directory: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          id: string;
        }[];
      };
      mutate: { Args: { command: string; payload: Json }; Returns: Json };
      record_ai_usage: {
        Args: { call_id: string; inputs: number; outputs: number };
        Returns: undefined;
      };
      reserve_ai:
        | { Args: { actor: string }; Returns: string }
        | { Args: { actor: string; request_limit: number }; Returns: string };
      reserve_meal_image:
        | { Args: { actor: string; cache_key: string }; Returns: string }
        | { Args: { actor: string; cache_key: string; request_limit: number }; Returns: string };
      reset_demo: {
        Args: {
          actor: string;
          events_data: Json;
          expected_version: number;
          household: string;
          items_data: Json;
          outcomes_data: Json;
        };
        Returns: undefined;
      };
      start_cooking: {
        Args: {
          actor: string;
          household: string;
          meal_data: Json;
          recipe_data: Json;
          session_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
