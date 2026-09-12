import type { PortfolioAccountType } from "@/lib/database.types";

export type CapitalMovementType = "deposit" | "withdrawal";

export function isMarginAccount(accountType: PortfolioAccountType) {
  return accountType === "margin_account" || accountType === "portfolio_margin_account";
}

export function remainingQuantity(quantity: number, soldQuantity: number | null | undefined) {
  return Math.max(0, quantity - (soldQuantity ?? 0));
}

export function normalizePositionSale({
  quantity,
  soldQuantity,
  salePrice,
  saleDate,
  requestedStatus,
}: {
  quantity: number;
  soldQuantity: number | null;
  salePrice: number | null;
  saleDate: string | null;
  requestedStatus: "open" | "closed";
}) {
  const sold = soldQuantity ?? 0;
  if (sold < 0 || sold > quantity) {
    throw new Error("Die verkaufte Menge muss zwischen 0 und der Gesamtmenge liegen.");
  }
  if (sold > 0 && (salePrice === null || salePrice < 0 || !saleDate)) {
    throw new Error("Für einen Verkauf sind Menge, Verkaufskurs und Verkaufsdatum erforderlich.");
  }
  if (sold === 0 && (salePrice !== null || saleDate)) {
    throw new Error("Verkaufsdaten benötigen eine verkaufte Menge.");
  }
  if (requestedStatus === "closed" && sold !== quantity) {
    throw new Error("Eine geschlossene Position muss vollständig verkauft sein.");
  }
  if (requestedStatus === "open" && sold === quantity) {
    throw new Error("Eine vollständig verkaufte Position muss als geschlossen gespeichert werden.");
  }

  return {
    soldQuantity: sold,
    salePrice: sold === 0 ? null : salePrice,
    saleDate: sold === 0 ? null : saleDate,
    status: sold === quantity ? "closed" as const : "active" as const,
    remainingQuantity: quantity - sold,
  };
}

export function normalizeMarginInput({
  accountType,
  inputType,
  value,
}: {
  accountType: PortfolioAccountType;
  inputType: "rate" | "amount";
  value: number | null;
}) {
  if (!isMarginAccount(accountType) || value === null) {
    return {
      marginRequirement: null,
      marginRate: null,
      marginSource: "missing" as const,
    };
  }
  if (value < 0) throw new Error("Die Marginangabe darf nicht negativ sein.");
  if (inputType === "rate") {
    if (value > 100) throw new Error("Die Marginquote muss zwischen 0 und 100 Prozent liegen.");
    return {
      marginRequirement: null,
      marginRate: value / 100,
      marginSource: "estimated" as const,
    };
  }
  return {
    marginRequirement: value,
    marginRate: null,
    marginSource: "manual_direct" as const,
  };
}

export function validateCapitalMovement({
  type,
  amount,
  currency,
  date,
  comment,
}: {
  type: string;
  amount: number | null;
  currency: string;
  date: string;
  comment: string;
}) {
  if (type !== "deposit" && type !== "withdrawal") {
    throw new Error("Der Typ der Kapitalbewegung ist ungültig.");
  }
  if (amount === null || amount <= 0) {
    throw new Error("Der Betrag muss größer als null sein.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Die Währung muss aus drei Buchstaben bestehen.");
  }
  if (!isIsoDate(date)) {
    throw new Error("Das Datum der Kapitalbewegung ist ungültig.");
  }
  if (comment.length > 500) {
    throw new Error("Der Kommentar darf höchstens 500 Zeichen enthalten.");
  }
  return { type, amount, currency, date, comment: comment || null } as const;
}

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}
