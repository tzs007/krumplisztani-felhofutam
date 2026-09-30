/**
 * Database types for the Supabase client.
 *
 * Hand-written to match supabase/migrations for now. Once the project is
 * connected, regenerate from the real schema instead of editing by hand:
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; created_at: string };
        Insert: { id: string; display_name?: string; created_at?: string };
        Update: { display_name?: string };
        Relationships: [];
      };
      easter_eggs: {
        Row: {
          id: string;
          title: string;
          description: string;
          heading: string | null;
          continue_label: string | null;
          image_url: string | null;
          image_aspect_ratio: number | null;
          item_sprite_key: string | null;
          item_size: number | null;
          item_placement: 'ground' | 'hover' | null;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      app_config: {
        Row: { key: string; value: unknown; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_results: {
        Row: {
          id: number;
          user_id: string;
          score: number;
          platforms: number;
          pickups: number;
          duration_ms: number;
          played_at: string;
          client_id: string | null;
        };
        Insert: {
          user_id?: string;
          score: number;
          platforms: number;
          pickups: number;
          duration_ms: number;
          played_at?: string;
          client_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Public leaderboard: best score per player; score desc, then who reached it first (max 100 rows). */
      top_scores: {
        Args: { limit_count?: number };
        Returns: { user_id: string; display_name: string; best_score: number; played_at: string }[];
      };
      /** Public: where a (device-only) result would rank among all players' bests (1-based). */
      rank_for_score: {
        Args: { p_score: number; p_played_at?: string };
        Returns: number;
      };
      /** Signed-in player's name, best result and rank; empty if no results yet. */
      my_rank: {
        Args: Record<string, never>;
        Returns: { display_name: string; best_score: number; played_at: string; rank: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
