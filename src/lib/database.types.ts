export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "user" | "admin";
export type AccountStatus = "active" | "invited" | "suspended" | "deletion_requested" | "deleted";
export type LegalDocumentType = "privacy_notice" | "terms_of_use" | "risk_notice";
export type DeletionRequestStatus = "pending" | "confirmed" | "processing" | "completed" | "rejected";

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      portfolios: Table<{
        id: string; user_id: string; name: string; currency: string; net_liquidity: number | null;
        margin_used_pct: number | null; risk_budget_used_pct: number | null; risk_profile: string;
        created_at: string; updated_at: string;
      }, {
        id?: string; user_id: string; name?: string; currency?: string; net_liquidity?: number | null;
        margin_used_pct?: number | null; risk_budget_used_pct?: number | null; risk_profile?: string;
        created_at?: string; updated_at?: string;
      }>;
      portfolio_categories: Table<{
        id: string; portfolio_id: string; user_id: string; name: string; sort_order: number;
        is_active: boolean; created_at: string;
      }, {
        id?: string; portfolio_id: string; user_id: string; name: string; sort_order?: number;
        is_active?: boolean; created_at?: string;
      }>;
      portfolio_settings: Table<{
        portfolio_id: string; user_id: string; risk_model: string; risk_per_trade_pct: number;
        max_margin_pct: number; max_position_pct: number; max_sector_pct: number;
        max_drawdown_pct: number; updated_at: string;
      }, {
        portfolio_id: string; user_id: string; risk_model?: string; risk_per_trade_pct?: number;
        max_margin_pct?: number; max_position_pct?: number; max_sector_pct?: number;
        max_drawdown_pct?: number; updated_at?: string;
      }>;
      positions: Table<{
        id: string; portfolio_id: string; user_id: string; category_id: string | null;
        ticker: string; instrument_name: string | null; instrument_type: string; direction: string;
        quantity: number; multiplier: number; entry_price: number; current_price: number | null;
        stop_price: number | null; market_value: number; risk_amount: number | null;
        margin_requirement: number | null; margin_percent: number | null; sector: string | null;
        entry_date: string | null; status: string; notes: string | null;
        external_position_id: string | null; option_type: string | null; strike_price: number | null;
        expiration_date: string | null; source_type: "demo" | "manual" | "csv";
        source_import_id: string | null; imported_at: string | null;
        created_at: string; updated_at: string;
      }, {
        id?: string; portfolio_id: string; user_id: string; category_id?: string | null;
        ticker: string; instrument_name?: string | null; instrument_type?: string; direction?: string;
        quantity?: number; multiplier?: number; entry_price?: number; current_price?: number | null;
        stop_price?: number | null; market_value?: number; risk_amount?: number | null;
        margin_requirement?: number | null; margin_percent?: number | null; sector?: string | null;
        entry_date?: string | null; status?: string; notes?: string | null;
        external_position_id?: string | null; option_type?: string | null; strike_price?: number | null;
        expiration_date?: string | null; source_type?: "demo" | "manual" | "csv";
        source_import_id?: string | null; imported_at?: string | null;
        created_at?: string; updated_at?: string;
      }>;
      portfolio_imports: Table<{
        id: string; user_id: string; portfolio_id: string; source_type: "csv";
        original_filename: string; imported_at: string; total_rows: number; valid_rows: number;
        warning_rows: number; rejected_rows: number; import_status: "processing" | "completed" | "failed";
        replaced_position_count: number; inserted_position_count: number; metadata: Json; created_at: string;
      }, {
        id?: string; user_id: string; portfolio_id: string; source_type?: "csv";
        original_filename: string; imported_at?: string; total_rows: number; valid_rows: number;
        warning_rows: number; rejected_rows: number; import_status: "processing" | "completed" | "failed";
        replaced_position_count?: number; inserted_position_count?: number; metadata?: Json; created_at?: string;
      }>;
      app_runtime_settings: Table<{
        singleton: boolean; registration_mode: string; updated_at: string;
      }, { singleton?: boolean; registration_mode?: string; updated_at?: string }>;
      user_profiles: Table<{
        user_id: string; account_status: AccountStatus; plan: string; created_at: string;
        updated_at: string; last_seen_at: string | null; onboarding_completed_at: string | null;
        scheduled_deletion_at: string | null;
      }, {
        user_id: string; account_status?: AccountStatus; plan?: string; created_at?: string;
        updated_at?: string; last_seen_at?: string | null; onboarding_completed_at?: string | null;
        scheduled_deletion_at?: string | null;
      }>;
      user_roles: Table<{
        id: string; user_id: string; role: AppRole; created_at: string;
      }, { id?: string; user_id: string; role: AppRole; created_at?: string }>;
      role_permissions: Table<{
        id: string; role: AppRole; permission: Database["public"]["Enums"]["app_permission"];
        created_at: string;
      }, {
        id?: string; role: AppRole; permission: Database["public"]["Enums"]["app_permission"];
        created_at?: string;
      }>;
      user_invitations: Table<{
        id: string; email: string; token_hash: string; invited_by: string; expires_at: string;
        accepted_at: string | null; created_at: string;
      }, {
        id?: string; email: string; token_hash: string; invited_by: string; expires_at: string;
        accepted_at?: string | null; created_at?: string;
      }>;
      legal_acceptances: Table<{
        id: string; user_id: string; document_type: LegalDocumentType; document_version: string;
        accepted_at: string; withdrawn_at: string | null; created_at: string;
      }, {
        id?: string; user_id: string; document_type: LegalDocumentType; document_version: string;
        accepted_at?: string; withdrawn_at?: string | null; created_at?: string;
      }>;
      admin_audit_log: Table<{
        id: string; admin_user_id: string; action: string; target_user_id: string | null;
        target_type: string; request_id: string; metadata: Json; created_at: string;
      }, {
        id?: string; admin_user_id: string; action: string; target_user_id?: string | null;
        target_type: string; request_id: string; metadata?: Json; created_at?: string;
      }>;
      account_deletion_requests: Table<{
        id: string; user_id: string; requested_at: string; status: DeletionRequestStatus;
        processed_at: string | null; processed_by: string | null; notes: string | null;
        created_at: string;
      }, {
        id?: string; user_id: string; requested_at?: string; status?: DeletionRequestStatus;
        processed_at?: string | null; processed_by?: string | null; notes?: string | null;
        created_at?: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      initialize_default_portfolio: { Args: Record<PropertyKey, never>; Returns: string };
      get_my_role: { Args: Record<PropertyKey, never>; Returns: AppRole };
      get_my_account_status: { Args: Record<PropertyKey, never>; Returns: AccountStatus };
      touch_user_profile: { Args: Record<PropertyKey, never>; Returns: undefined };
      validate_invitation: {
        Args: { invited_email: string; candidate_token_hash: string };
        Returns: boolean;
      };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      replace_portfolio_snapshot: {
        Args: {
          target_portfolio: string;
          original_filename: string;
          normalized_positions: Json;
          new_categories: string[];
          total_rows: number;
          warning_rows: number;
          rejected_rows: number;
          import_metadata?: Json;
        };
        Returns: Json;
      };
      get_admin_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      get_admin_user_directory: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          user_id: string; email: string; registered_at: string; email_confirmed: boolean;
          last_login_at: string | null; last_seen_at: string | null; account_status: AccountStatus;
          plan: string; portfolio_count: number; position_count: number; last_import_at: string | null;
        }>;
      };
      get_admin_user_detail: {
        Args: { target_user: string; audit_request_id: string };
        Returns: Json;
      };
      admin_set_account_status: {
        Args: { target_user: string; new_status: AccountStatus; audit_request_id: string };
        Returns: undefined;
      };
      admin_set_role: {
        Args: { target_user: string; target_role: AppRole; assign_role: boolean; audit_request_id: string };
        Returns: undefined;
      };
      bootstrap_grant_admin: {
        Args: { target_user: string; audit_request_id: string };
        Returns: boolean;
      };
      admin_process_deletion_request: {
        Args: { deletion_request: string; audit_request_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: AppRole;
      app_permission: "admin.read_user_directory" | "admin.update_account_status" | "admin.manage_roles" | "admin.process_deletion_requests";
      account_status: AccountStatus;
      legal_document_type: LegalDocumentType;
      deletion_request_status: DeletionRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Portfolio = Database["public"]["Tables"]["portfolios"]["Row"];
export type PortfolioSettings = Database["public"]["Tables"]["portfolio_settings"]["Row"];
export type Position = Database["public"]["Tables"]["positions"]["Row"];
export type PortfolioCategory = Database["public"]["Tables"]["portfolio_categories"]["Row"];
export type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
export type LegalAcceptance = Database["public"]["Tables"]["legal_acceptances"]["Row"];
export type AccountDeletionRequest = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
export type PortfolioImport = Database["public"]["Tables"]["portfolio_imports"]["Row"];
