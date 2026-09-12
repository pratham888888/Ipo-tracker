export const DASH = "—";

export function naOr(v: number | string | null | undefined, suffix = ""): string {
  if (v === null || v === undefined || v === "") return DASH;
  return `${v}${suffix}`;
}

export function fmtCrore(v: number | null | undefined): string {
  if (v == null) return DASH;
  if (v >= 1000) return `₹${(v / 1000).toFixed(2)}K Cr`;
  return `₹${formatNumber(v)} Cr`;
}

export function fmtRupee(v: number | null | undefined, decimals = 0): string {
  if (v == null) return DASH;
  return `₹${formatNumber(v, decimals)}`;
}

export function fmtPct(v: number | null | undefined, withSign = true): string {
  if (v == null) return DASH;
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function fmtX(v: number | null | undefined): string {
  if (v == null) return DASH;
  return `${v.toFixed(2)}x`;
}

export function formatNumber(v: number, decimals = 2): string {
  const opts: Intl.NumberFormatOptions = {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  };
  try {
    return new Intl.NumberFormat("en-IN", opts).format(v);
  } catch {
    return String(v);
  }
}

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  upcoming: "Upcoming",
  closed: "Closed",
  listed: "Listed",
};

export function statusColorKey(
  status: string,
): "statusOpen" | "statusUpcoming" | "statusClosed" | "statusListed" {
  switch (status) {
    case "open":
      return "statusOpen";
    case "upcoming":
      return "statusUpcoming";
    case "listed":
      return "statusListed";
    default:
      return "statusClosed";
  }
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00+05:30");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
