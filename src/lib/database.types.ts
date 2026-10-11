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
      cards: {
        Row: {
          id: string;
          number: number;
          name: string;
          description: string;
          rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'etheric' | 'sacred';
          image_url: string | null;
          landing_url: string | null;
          season: number;
          serial_label: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Written only by open_cards / reveal_card. */
      user_cards: {
        Row: {
          id: number;
          user_id: string;
          card_id: string;
          game_result_id: number;
          slot: number;
          drawn_at: string;
          revealed_at: string | null;
        };
        Insert: never;
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
      /** Draws (once) and returns the cards the caller's uploaded result earned; P0002 if not uploaded. */
      open_cards: {
        Args: { p_client_id: string };
        Returns: {
          id: number;
          user_id: string;
          card_id: string;
          game_result_id: number;
          slot: number;
          drawn_at: string;
          revealed_at: string | null;
        }[];
      };
      /** Marks one of the caller's cards revealed. */
      reveal_card: {
        Args: { p_user_card_id: number };
        Returns: undefined;
      };
      /** Public: players by distinct revealed cards, then who got there first (max 100 rows). */
      top_collectors: {
        Args: { limit_count?: number };
        Returns: { user_id: string; display_name: string; distinct_cards: number; reached_at: string }[];
      };
      /** Signed-in player's row in the collectors' ranking; empty before the first reveal. */
      my_collector_rank: {
        Args: Record<string, never>;
        Returns: { display_name: string; distinct_cards: number; reached_at: string; rank: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
