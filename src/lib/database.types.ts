export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          currency: string;
          net_liquidity: number;
          margin_used_pct: number;
          risk_budget_used_pct: number;
          risk_profile: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          currency?: string;
          net_liquidity?: number;
          margin_used_pct?: number;
          risk_budget_used_pct?: number;
          risk_profile?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolios"]["Insert"]>;
        Relationships: [];
      };
      portfolio_categories: {
        Row: {
          id: string;
          portfolio_id: string;
          user_id: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          user_id: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolio_categories"]["Insert"]>;
        Relationships: [];
      };
      portfolio_settings: {
        Row: {
          portfolio_id: string;
          user_id: string;
          risk_model: string;
          risk_per_trade_pct: number;
          max_margin_pct: number;
          max_position_pct: number;
          max_sector_pct: number;
          max_drawdown_pct: number;
          updated_at: string;
        };
        Insert: {
          portfolio_id: string;
          user_id: string;
          risk_model?: string;
          risk_per_trade_pct?: number;
          max_margin_pct?: number;
          max_position_pct?: number;
          max_sector_pct?: number;
          max_drawdown_pct?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolio_settings"]["Insert"]>;
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          portfolio_id: string;
          user_id: string;
          category_id: string | null;
          ticker: string;
          instrument_name: string | null;
          instrument_type: string;
          direction: string;
          quantity: number;
          multiplier: number;
          entry_price: number;
          current_price: number | null;
          stop_price: number | null;
          market_value: number;
          risk_amount: number;
          margin_requirement: number;
          sector: string | null;
          entry_date: string | null;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          user_id: string;
          category_id?: string | null;
          ticker: string;
          instrument_name?: string | null;
          instrument_type?: string;
          direction?: string;
          quantity?: number;
          multiplier?: number;
          entry_price?: number;
          current_price?: number | null;
          stop_price?: number | null;
          market_value?: number;
          risk_amount?: number;
          margin_requirement?: number;
          sector?: string | null;
          entry_date?: string | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["positions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      initialize_default_portfolio: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Portfolio = Database["public"]["Tables"]["portfolios"]["Row"];
export type PortfolioSettings = Database["public"]["Tables"]["portfolio_settings"]["Row"];
export type Position = Database["public"]["Tables"]["positions"]["Row"];
export type PortfolioCategory = Database["public"]["Tables"]["portfolio_categories"]["Row"];
