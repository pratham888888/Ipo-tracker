export type Gmp = {
  gmp_rupees: number | null;
  gmp_percent: number | null;
  implied_listing_price: number | null;
  source: string | null;
  source_updated_label: string | null;
  timestamp: string | null;
};

export type Subscription = {
  total: number | null;
  qib: number | null;
  snii: number | null;
  bnii: number | null;
  nii: number | null;
  retail: number | null;
  employee: number | null;
  shareholder: number | null;
  source: string | null;
  timestamp: string | null;
};

export type Ipo = {
  slug: string;
  company_name: string | null;
  symbol: string | null;
  ipo_type: "Mainboard" | "SME";
  segment: string | null;
  exchange: string | null;
  status: "open" | "upcoming" | "closed" | "listed";
  open_date: string | null;
  close_date: string | null;
  open_date_raw: string | null;
  close_date_raw: string | null;
  allotment_date: string | null;
  refund_date: string | null;
  demat_credit_date: string | null;
  listing_date: string | null;
  price_band_low: number | null;
  price_band_high: number | null;
  price_band_text: string | null;
  issue_price: number | null;
  face_value: number | null;
  lot_size: number | null;
  minimum_investment: number | null;
  issue_size_crore: number | null;
  issue_size_estimated: boolean;
  issue_size_shares: number | null;
  registrar: string | null;
  lead_managers: string | null;
  sector: string | null;
  gmp: Gmp;
  subscription: Subscription;
  source: string;
  fetched_at: string;
};

export type SourceMeta = {
  provider: string;
  healthy: boolean;
  count: number;
  last_error: string | null;
  last_updated_iso: string | null;
  last_updated_label: string | null;
};

export type Screener = {
  id: string;
  name: string;
  filters: Filters;
  is_default: boolean;
  created_at?: string;
};

export type Filters = {
  status?: string | null;
  ipo_type?: string | null;
  min_issue_size?: number | null;
  min_gmp_pct?: number | null;
  search?: string | null;
  sort?: string;
  order?: "asc" | "desc";
};
