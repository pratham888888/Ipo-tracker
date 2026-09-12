import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, DisclaimerBanner } from "@/src/components/header";
import { IpoCard } from "@/src/components/ipo-card";
import {
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  SectionHeader,
  SourceFooter,
  Txt,
} from "@/src/components/ui";
import { fmtCrore, fmtPct } from "@/src/format";
import { useDashboard } from "@/src/queries";
import { fonts, useTheme, type ThemeColors } from "@/src/theme";

export default function MarketsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();
  const [tab, setTab] = useState<"open" | "upcoming" | "closed">("open");

  const cards = data?.cards;
  const list = data ? data[tab] : [];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title="IPO Terminal"
        subtitle={data?.meta?.last_updated_label ? `Updated ${data.meta.last_updated_label}` : "Indian IPOs"}
        right={
          <>
            <IconButton name="calendar" onPress={() => router.push("/calendar")} testID="open-calendar" />
            <IconButton name="settings" onPress={() => router.push("/settings")} testID="open-settings" />
          </>
        }
        testID="markets-header"
      />
      {isLoading ? (
        <LoadingState label="Loading market data…" />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          testID="markets-scroll"
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatCard label="Open" value={String(cards?.open ?? 0)} accent="statusOpen" icon="activity" />
            <StatCard label="Upcoming" value={String(cards?.upcoming ?? 0)} accent="statusUpcoming" icon="clock" />
            <StatCard label="Closing Today" value={String(cards?.closing_today ?? 0)} accent="error" icon="alert-circle" />
            <StatCard label="Recently Closed" value={String(cards?.closed ?? 0)} accent="statusClosed" icon="check-circle" />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <HighlightCard
              testID="highest-gmp-card"
              title="Highest GMP"
              main={cards?.highest_gmp ? cards.highest_gmp.company_name : "—"}
              value={cards?.highest_gmp ? fmtPct(cards.highest_gmp.gmp_percent) : "—"}
              gain
              onPress={cards?.highest_gmp ? () => router.push(`/ipo/${cards.highest_gmp!.slug}`) : undefined}
            />
            <HighlightCard
              testID="largest-ipo-card"
              title="Largest IPO"
              main={cards?.largest ? cards.largest.company_name : "—"}
              value={cards?.largest ? fmtCrore(cards.largest.issue_size_crore) : "—"}
              onPress={cards?.largest ? () => router.push(`/ipo/${cards.largest!.slug}`) : undefined}
            />
          </View>

          {data && data.featured_gmp.length > 0 ? (
            <View>
              <SectionHeader title="Top GMP Movers" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {data.featured_gmp.map((i) => (
                  <MoverCard
                    key={i.slug}
                    name={i.company_name ?? ""}
                    pct={i.gmp.gmp_percent}
                    band={i.price_band_text}
                    onPress={() => router.push(`/ipo/${i.slug}`)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["open", "upcoming", "closed"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  testID={`dash-tab-${t}`}
                  style={{ paddingVertical: 4 }}
                >
                  <Txt
                    size={16}
                    weight={tab === t ? "bold" : "medium"}
                    color={tab === t ? "onSurface" : "muted"}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Txt>
                </Pressable>
              ))}
            </View>
            {list.length === 0 ? (
              <EmptyState title="No IPOs here" message={`No ${tab} IPOs from the provider right now.`} />
            ) : (
              <View style={{ gap: 12 }}>
                {list.map((i) => (
                  <IpoCard key={i.slug} ipo={i} />
                ))}
              </View>
            )}
          </View>

          <SourceFooter provider={data?.meta.provider} label={data?.meta.last_updated_label} />
          <DisclaimerBanner compact />
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: keyof ThemeColors;
  icon: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ flexBasis: "47%", flexGrow: 1, padding: 14 }} testID={`stat-${label}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt size={12} color="muted">
          {label}
        </Txt>
        <Icon name={icon} size={14} color={accent} />
      </View>
      <Txt size={28} weight="display" style={{ marginTop: 6, color: colors[accent] as string }}>
        {value}
      </Txt>
    </Card>
  );
}

function HighlightCard({
  title,
  main,
  value,
  gain,
  onPress,
  testID,
}: {
  title: string;
  main: string;
  value: string;
  gain?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, padding: 14 }} onPress={onPress} testID={testID}>
      <Txt size={12} color="muted">
        {title}
      </Txt>
      <Txt
        size={20}
        weight="display"
        style={{ marginTop: 8, color: gain ? colors.gain : colors.onSurface }}
      >
        {value}
      </Txt>
      <Txt size={12} color="onSurfaceSecondary" numberOfLines={1} style={{ marginTop: 4 }}>
        {main}
      </Txt>
    </Card>
  );
}

function MoverCard({
  name,
  pct,
  band,
  onPress,
}: {
  name: string;
  pct: number | null;
  band: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const positive = (pct ?? 0) >= 0;
  return (
    <Card style={{ width: 150, padding: 12 }} onPress={onPress}>
      <Txt size={13} weight="semibold" numberOfLines={2} style={{ minHeight: 34 }}>
        {name}
      </Txt>
      <Txt
        size={18}
        style={{ marginTop: 6, fontFamily: fonts.display, color: positive ? colors.gain : colors.loss }}
      >
        {fmtPct(pct)}
      </Txt>
      <Txt size={11} color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
        {band ?? "—"}
      </Txt>
    </Card>
  );
}
