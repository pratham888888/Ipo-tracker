export type Gmp = {
  gmp_rupees: number | null;
  gmp_percent: number | null;
  implied_listing_price: number | null;
  source: string | null;
  source_updated_label: string | null;
  timestamp: string | null;
  unofficial?: boolean;
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
  category_wise_available?: boolean;
  source_updated_label?: string | null;
};

export type FieldSources = {
  metadata?: string | null;
  gmp?: string | null;
  subscription?: string | null;
  registrar?: string | null;
  lot_size?: string | null;
  documents?: string | null;
};

export type IpoDocument = {
  title: string;
  url: string;
  source?: string;
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
  registrar_allotment_url?: string | null;
  lead_managers: string | null;
  sector: string | null;
  industry?: string | null;
  documents?: IpoDocument[];
  gmp: Gmp;
  subscription: Subscription;
  field_sources?: FieldSources;
  source: string;
  fetched_at: string;
  meta?: SourceMeta;
};

export type SourceMeta = {
  provider: string;
  healthy: boolean;
  count: number;
  last_error: string | null;
  last_updated_iso: string | null;
  last_updated_label: string | null;
  gmp_disclaimer?: string;
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
  max_issue_size?: number | null;
  min_gmp_pct?: number | null;
  max_gmp_pct?: number | null;
  min_subscription?: number | null;
  max_subscription?: number | null;
  subscription_field?: "total" | "qib" | "snii" | "bnii" | "retail" | "nii" | null;
  sector?: string | null;
  industry?: string | null;
  open_date_from?: string | null;
  open_date_to?: string | null;
  close_date_from?: string | null;
  close_date_to?: string | null;
  allotment_date_from?: string | null;
  allotment_date_to?: string | null;
  listing_date_from?: string | null;
  listing_date_to?: string | null;
  search?: string | null;
  sort?: string;
  order?: "asc" | "desc";
};
