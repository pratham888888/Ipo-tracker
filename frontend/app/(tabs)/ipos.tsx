import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilterSheet } from "@/src/components/filter-sheet";
import { AppHeader } from "@/src/components/header";
import { IpoCard } from "@/src/components/ipo-card";
import {
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  SourceFooter,
  Txt,
} from "@/src/components/ui";
import { useIpos } from "@/src/queries";
import type { Filters } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

const STATUS = ["All", "open", "upcoming", "closed", "listed"];
const TYPES = ["All", "Mainboard", "SME"];

export default function IposScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  const params = useLocalSearchParams<{ preset?: string }>();
  const sheetRef = useRef<BottomSheetModal>(null);

  const [filters, setFilters] = useState<Filters>({
    status: null,
    ipo_type: null,
    min_issue_size: null,
    min_gmp_pct: null,
    sort: "gmp_pct",
    order: "desc",
  });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (params.preset) {
      try {
        setFilters((f) => ({ ...f, ...JSON.parse(params.preset as string) }));
      } catch {
        /* noop */
      }
    }
  }, [params.preset]);

  const { data, isLoading, isError, refetch } = useIpos({
    status: filters.status ?? undefined,
    ipo_type: filters.ipo_type ?? undefined,
    min_issue_size: filters.min_issue_size ?? undefined,
    max_issue_size: filters.max_issue_size ?? undefined,
    min_gmp_pct: filters.min_gmp_pct ?? undefined,
    max_gmp_pct: filters.max_gmp_pct ?? undefined,
    min_subscription: filters.min_subscription ?? undefined,
    max_subscription: filters.max_subscription ?? undefined,
    subscription_field: filters.subscription_field ?? undefined,
    sector: filters.sector ?? undefined,
    industry: filters.industry ?? undefined,
    open_date_from: filters.open_date_from ?? undefined,
    open_date_to: filters.open_date_to ?? undefined,
    close_date_from: filters.close_date_from ?? undefined,
    close_date_to: filters.close_date_to ?? undefined,
    allotment_date_from: filters.allotment_date_from ?? undefined,
    allotment_date_to: filters.allotment_date_to ?? undefined,
    listing_date_from: filters.listing_date_from ?? undefined,
    listing_date_to: filters.listing_date_to ?? undefined,
    search: search || undefined,
    sort: filters.sort,
    order: filters.order,
  });

  const activeCount =
    (filters.min_issue_size != null ? 1 : 0) +
    (filters.max_issue_size != null ? 1 : 0) +
    (filters.min_gmp_pct != null ? 1 : 0) +
    (filters.max_gmp_pct != null ? 1 : 0) +
    (filters.min_subscription != null ? 1 : 0) +
    (filters.max_subscription != null ? 1 : 0);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title="IPOs"
        subtitle={data ? `${data.ipos.length} results` : "Screen & discover"}
        right={
          <>
            <IconButton
              name="search"
              onPress={() => setSearchOpen((v) => !v)}
              testID="toggle-search"
            />
            <View>
              <IconButton
                name="sliders"
                onPress={() => sheetRef.current?.present()}
                testID="open-filters"
              />
              {activeCount > 0 ? (
                <View style={s.badge}>
                  <Txt size={9} weight="bold" color="onBrandPrimary">
                    {activeCount}
                  </Txt>
                </View>
              ) : null}
            </View>
          </>
        }
      />

      {searchOpen ? (
        <View style={s.searchWrap}>
          <Icon name="search" size={16} color="muted" />
          <TextInput
            testID="search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search company or symbol…"
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            autoFocus
            returnKeyType="search"
          />
          {search ? (
            <IconButton name="x" onPress={() => setSearch("")} color="muted" />
          ) : null}
        </View>
      ) : null}

      <View style={s.chipSection}>
        <FlatList
          horizontal
          data={STATUS}
          keyExtractor={(i) => i}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
          renderItem={({ item }) => (
            <Chip
              label={item === "All" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
              active={(filters.status ?? "All") === item}
              onPress={() => setFilters((f) => ({ ...f, status: item === "All" ? null : item }))}
              testID={`status-chip-${item}`}
            />
          )}
        />
        <FlatList
          horizontal
          data={TYPES}
          keyExtractor={(i) => i}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.chipRow, { paddingTop: 4 }]}
          renderItem={({ item }) => (
            <Chip
              label={item}
              active={(filters.ipo_type ?? "All") === item}
              onPress={() => setFilters((f) => ({ ...f, ipo_type: item === "All" ? null : item }))}
              testID={`type-chip-${item}`}
            />
          )}
        />
      </View>

      {isLoading ? (
        <LoadingState label="Loading IPOs…" />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <FlatList
          data={data?.ipos ?? []}
          keyExtractor={(i) => i.slug}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item }) => <IpoCard ipo={item} />}
          ListEmptyComponent={
            <EmptyState title="No IPOs match your filters" message="Try widening the filters." />
          }
          ListFooterComponent={
            data && data.ipos.length > 0 ? (
              <View style={{ paddingTop: 8 }}>
                <SourceFooter provider={data.meta.provider} label={data.meta.last_updated_label} />
              </View>
            ) : null
          }
        />
      )}

      <FilterSheet ref={sheetRef} value={filters} onApply={(f) => setFilters(f)} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: "PlusJakartaSans-Regular",
    fontSize: 14,
  },
  chipSection: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 4,
  },
  chipRow: { gap: 8, paddingHorizontal: 16 },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
}));
