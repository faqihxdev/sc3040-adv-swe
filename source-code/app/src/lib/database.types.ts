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
      inventory: {
        Row: {
          category: string;
          deleted: boolean;
          expiry_date: string;
          household_id: string;
          id: string;
          location: string;
          name: string;
          stock: number;
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
          stock: number;
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
          stock?: number;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_inventory_batch: {
        Args: { expected_household: string; items_data: Json; request_id: string };
        Returns: Json;
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
      reserve_ai: { Args: { actor: string; request_limit: number }; Returns: string };
      reset_demo: {
        Args: {
          actor: string;
          expected_version: number;
          household: string;
          items_data: Json;
          outcomes_data: Json;
        };
        Returns: undefined;
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
