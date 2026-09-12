import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/header";
import { IpoCard } from "@/src/components/ipo-card";
import { Card, Chip, EmptyState, Icon, LoadingState, Txt } from "@/src/components/ui";
import { useIpos } from "@/src/queries";
import type { Ipo } from "@/src/types";
import { useTheme } from "@/src/theme";

const TYPE_FILTERS = ["All", "Mainboard", "SME"];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"list" | "timeline">("timeline");
  const [type, setType] = useState("All");
  const { data, isLoading } = useIpos({ sort: "open_date", order: "asc" });

  const ipos = useMemo(() => {
    let list = (data?.ipos ?? []).filter(
      (i) => i.status === "open" || i.status === "upcoming",
    );
    if (type !== "All") list = list.filter((i) => i.ipo_type === type);
    return list;
  }, [data, type]);

  const groups = useMemo(() => {
    const map: Record<string, Ipo[]> = {};
    ipos.forEach((i) => {
      const key = i.open_date_raw ?? "Date not published";
      (map[key] ??= []).push(i);
    });
    return Object.entries(map);
  }, [ipos]);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title="IPO Calendar" subtitle="Open & upcoming issues" showBack />

      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Timeline" active={mode === "timeline"} onPress={() => setMode("timeline")} testID="cal-timeline" />
          <Chip label="List" active={mode === "list"} onPress={() => setMode("list")} testID="cal-list" />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {TYPE_FILTERS.map((t) => (
            <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} testID={`cal-type-${t}`} />
          ))}
        </View>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : ipos.length === 0 ? (
        <View style={{ paddingTop: 30 }}>
          <EmptyState title="No scheduled IPOs" message="Nothing open or upcoming right now." icon="calendar" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: mode === "list" ? 12 : 20, paddingBottom: insets.bottom + 24 }}
        >
          {mode === "list"
            ? ipos.map((i) => <IpoCard key={i.slug} ipo={i} />)
            : groups.map(([date, items]) => (
                <View key={date} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ alignItems: "center", width: 20 }}>
                    <Icon name="calendar" size={16} color="onSurfaceSecondary" />
                    <View style={{ width: 2, flex: 1, backgroundColor: colors.divider, marginTop: 6 }} />
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Txt size={13} weight="bold">
                      Opens {date}
                    </Txt>
                    {items.map((i) => (
                      <Card key={i.slug} onPress={() => router.push(`/ipo/${i.slug}`)} style={{ padding: 12 }}>
                        <IpoCalRow ipo={i} />
                      </Card>
                    ))}
                  </View>
                </View>
              ))}
        </ScrollView>
      )}
    </View>
  );
}

function IpoCalRow({ ipo }: { ipo: Ipo }) {
  return (
    <View>
      <Txt size={14} weight="bold" numberOfLines={1}>
        {ipo.company_name}
      </Txt>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Txt size={12} color="muted">
          {ipo.ipo_type}
        </Txt>
        <Txt size={12} color="onSurfaceSecondary">
          Closes {ipo.close_date_raw ?? "—"}
        </Txt>
      </View>
    </View>
  );
}
