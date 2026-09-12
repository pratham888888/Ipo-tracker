import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/src/api";
import type { Filters, Ipo, Screener, SourceMeta } from "@/src/types";

type DashboardResp = {
  cards: {
    open: number;
    upcoming: number;
    closed: number;
    listed: number;
    closing_today: number;
    highest_gmp: { slug: string; company_name: string; gmp_percent: number } | null;
    largest: { slug: string; company_name: string; issue_size_crore: number } | null;
  };
  open: Ipo[];
  upcoming: Ipo[];
  closed: Ipo[];
  listed: Ipo[];
  featured_gmp: Ipo[];
  meta: SourceMeta;
};

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardResp>("/dashboard"),
    refetchInterval: 120000,
  });
}

export function useIpos(params: Record<string, string | number | undefined> = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return useQuery({
    queryKey: ["ipos", qs],
    queryFn: () => apiFetch<{ ipos: Ipo[]; meta: SourceMeta }>(`/ipos?${qs}`),
    refetchInterval: 120000,
  });
}

export function useIpo(slug: string) {
  return useQuery({
    queryKey: ["ipo", slug],
    queryFn: () => apiFetch<Ipo & { meta: SourceMeta }>(`/ipos/${slug}`),
    enabled: !!slug,
  });
}

export function useGmpHistory(slug: string, range: string) {
  return useQuery({
    queryKey: ["gmp-history", slug, range],
    queryFn: () =>
      apiFetch<{ points: { ts: string; label: string; gmp_rupees: number; gmp_percent: number }[] }>(
        `/ipos/${slug}/gmp-history?range=${range}`,
      ),
    enabled: !!slug,
  });
}

export function useAiSummary(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ai-summary", slug],
    queryFn: () =>
      apiFetch<{
        summary: {
          what_it_does: string;
          how_it_makes_money: string;
          where_money_goes: string;
          strengths: string[];
          risks: string[];
          things_to_verify: string[];
        };
        model: string;
        generated_label: string;
        disclaimer: string;
      }>(`/ipos/${slug}/ai-summary`),
    enabled: enabled && !!slug,
    staleTime: Infinity,
    retry: false,
  });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => apiFetch<SourceMeta>("/meta") });
}

export type AllotmentResult = {
  category: string;
  category_label: string;
  reliable: boolean;
  message?: string;
  disclaimer: string;
  subscription_multiple?: number;
  lots?: number;
  lot_size?: number;
  price?: number;
  application_shares?: number;
  application_amount?: number;
  probability?: number | null;
  probability_pct?: number | null;
  expected_lots?: number;
  expected_shares?: number;
  method?: string;
  note?: string;
  used_total_subscription_proxy?: boolean;
  category_subscription_used?: number | null;
  subscription_source?: string | null;
};

export function useAllotmentMutation(slug: string) {
  return useMutation({
    mutationFn: (body: {
      category: string;
      lots: number;
      subscription_multiple?: number;
      lot_size?: number;
      price?: number;
    }) => apiFetch<AllotmentResult>(`/ipos/${slug}/allotment`, { method: "POST", body }),
  });
}

export function useSubscriptionHistory(slug: string) {
  return useQuery({
    queryKey: ["subscription-history", slug],
    queryFn: () =>
      apiFetch<{
        points: {
          ts: string;
          label: string;
          total: number | null;
          qib: number | null;
          snii: number | null;
          bnii: number | null;
          retail: number | null;
          nii: number | null;
        }[];
      }>(`/ipos/${slug}/subscription-history`),
    enabled: !!slug,
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/refresh", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["ipos"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
    },
  });
}

// ---- Watchlist (auth) ---- //
export function useWatchlist(enabled: boolean) {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: () => apiFetch<{ slugs: string[]; ipos: Ipo[] }>("/watchlist", { auth: true }),
    enabled,
  });
}

export function useToggleWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, add }: { slug: string; add: boolean }) =>
      add
        ? apiFetch("/watchlist", { method: "POST", body: { slug }, auth: true })
        : apiFetch(`/watchlist/${slug}`, { method: "DELETE", auth: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

// ---- Saved screeners (auth) ---- //
export function useScreeners(enabled: boolean) {
  return useQuery({
    queryKey: ["screeners"],
    queryFn: () => apiFetch<{ screeners: Screener[] }>("/screeners", { auth: true }),
    enabled,
  });
}

export function useScreenerMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["screeners"] });
  return {
    create: useMutation({
      mutationFn: (body: { name: string; filters: Filters; is_default: boolean }) =>
        apiFetch("/screeners", { method: "POST", body, auth: true }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...body
      }: {
        id: string;
        name: string;
        filters: Filters;
        is_default: boolean;
      }) => apiFetch(`/screeners/${id}`, { method: "PUT", body, auth: true }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        apiFetch(`/screeners/${id}`, { method: "DELETE", auth: true }),
      onSuccess: invalidate,
    }),
  };
}
