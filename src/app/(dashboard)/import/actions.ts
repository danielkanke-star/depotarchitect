"use server";

import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/database.types";
import type { NormalizedPosition } from "@/lib/csv-import";
import { calculatePosition } from "@/lib/calculations/position-calculations";
import { getOrCreatePortfolio } from "@/lib/portfolio";
import { requireUser } from "@/lib/auth";

export type SnapshotImportInput = {
  filename: string;
  positions: NormalizedPosition[];
  newCategories: string[];
  totalRows: number;
  warningRows: number;
  rejectedRows: number;
  delimiter: string;
  encoding: string;
  headerDetected: boolean;
  confirmationChecked: boolean;
  confirmationText: string;
};

export type SnapshotImportResult = {
  ok: boolean;
  message: string;
  importId?: string;
  replacedPositionCount?: number;
  insertedPositionCount?: number;
  derivedMarketValueCount?: number;
};

type RpcResult = {
  import_id?: unknown;
  replaced_position_count?: unknown;
  inserted_position_count?: unknown;
  derived_market_value_count?: unknown;
};

function safeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function sanitizeFilename(value: string) {
  const filename = value.trim();
  if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f/\\]/.test(filename)) return null;
  return filename;
}

export async function replacePortfolioSnapshot(input: SnapshotImportInput): Promise<SnapshotImportResult> {
  if (!input.confirmationChecked || input.confirmationText !== "DEPOT ERSETZEN") {
    return { ok: false, message: "Die Sicherheitsbestätigung ist unvollständig." };
  }

  const filename = sanitizeFilename(input.filename);
  const totalRows = safeInteger(input.totalRows);
  const warningRows = safeInteger(input.warningRows);
  const rejectedRows = safeInteger(input.rejectedRows);
  if (!filename || !totalRows || warningRows === null || rejectedRows === null) {
    return { ok: false, message: "Die Importmetadaten sind ungültig." };
  }
  if (!Array.isArray(input.positions) || input.positions.length < 1 || input.positions.length > 2000) {
    return { ok: false, message: "Der Import muss zwischen 1 und 2.000 gültige Positionen enthalten." };
  }
  if (totalRows !== input.positions.length + rejectedRows || warningRows > input.positions.length) {
    return { ok: false, message: "Die Zeilenzähler des Imports sind nicht konsistent." };
  }

  const { supabase } = await requireUser();
  const portfolio = await getOrCreatePortfolio();
  const normalizedPositions = input.positions.map((position, index) => {
    const instrumentCurrency = position.instrument_currency?.trim().toUpperCase() || null;
    const fxToBase = position.fx_to_base ?? (instrumentCurrency === portfolio.currency.trim().toUpperCase() ? 1 : null);
    const calculation = calculatePosition({
      id: `${index}`,
      ticker: position.ticker,
      direction: position.direction,
      quantity: position.quantity,
      multiplier: position.multiplier,
      entryPrice: position.entry_price,
      currentPrice: position.current_price,
      fxToBase,
      netLiquidity: portfolio.net_liquidity,
      effectiveStopPrice: position.stop_price,
      directMarginRequirement: position.margin_requirement,
      marginPercent: position.margin_percent,
    });
    return {
      ...position,
      instrument_currency: instrumentCurrency,
      fx_to_base: fxToBase,
      market_value: calculation.positionValueBase.value,
      risk_amount: calculation.stopRisk.value,
    };
  });
  const { data, error } = await supabase.rpc("replace_portfolio_snapshot_v2", {
    target_portfolio: portfolio.id,
    original_filename: filename,
    normalized_positions: normalizedPositions as unknown as Json,
    new_categories: [...new Set(input.newCategories.map((name) => name.trim()).filter(Boolean))],
    total_rows: totalRows,
    warning_rows: warningRows,
    rejected_rows: rejectedRows,
    import_metadata: {
      delimiter: input.delimiter.slice(0, 20),
      encoding: input.encoding.slice(0, 20),
      header_detected: input.headerDetected,
    },
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      message: "Der Snapshot-Import wurde vollständig zurückgerollt. Der bisherige Depotbestand ist unverändert.",
    };
  }

  const result = data as RpcResult;
  revalidatePath("/import");
  revalidatePath("/depot");
  revalidatePath("/cockpit");

  return {
    ok: true,
    message: "Die benutzerdefinierte CSV wurde vollständig übernommen.",
    importId: typeof result.import_id === "string" ? result.import_id : undefined,
    replacedPositionCount: Number(result.replaced_position_count ?? 0),
    insertedPositionCount: Number(result.inserted_position_count ?? 0),
    derivedMarketValueCount: Number(result.derived_market_value_count ?? 0),
  };
}
