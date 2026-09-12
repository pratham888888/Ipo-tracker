import { router } from "expo-router";
import { View } from "react-native";

import { Card, GmpValue, Icon, Txt, StatusBadge, TypeBadge } from "@/src/components/ui";
import { daysUntil, fmtCrore, fmtX, naOr } from "@/src/format";
import type { Ipo } from "@/src/types";

export function IpoCard({ ipo, testID }: { ipo: Ipo; testID?: string }) {
  const days =
    ipo.status === "open"
      ? daysUntil(ipo.close_date)
      : ipo.status === "upcoming"
        ? daysUntil(ipo.open_date)
        : null;
  const daysLabel =
    days == null
      ? null
      : ipo.status === "open"
        ? days <= 0
          ? "Closes today"
          : `${days}d to close`
        : days <= 0
          ? "Opens today"
          : `Opens in ${days}d`;

  return (
    <Card
      testID={testID ?? `ipo-card-${ipo.slug}`}
      onPress={() => router.push(`/ipo/${ipo.slug}`)}
      style={{ padding: 14 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Txt size={15} weight="bold" numberOfLines={1}>
            {ipo.company_name}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <TypeBadge type={ipo.ipo_type} />
            <Txt size={12} color="muted">
              {naOr(ipo.symbol)}
            </Txt>
          </View>
        </View>
        <StatusBadge status={ipo.status} />
      </View>

      <View style={{ height: 1, backgroundColor: "transparent", marginVertical: 10 }} />

      <View style={{ flexDirection: "row" }}>
        <Metric label="Price Band" value={naOr(ipo.price_band_text)} />
        <Metric label="GMP">
          <GmpValue rupees={ipo.gmp.gmp_rupees} percent={ipo.gmp.gmp_percent} size={14} />
        </Metric>
        <Metric
          label={ipo.issue_size_estimated ? "Issue Size ≈" : "Issue Size"}
          value={fmtCrore(ipo.issue_size_crore)}
          alignEnd
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="users" size={12} color="muted" />
          <Txt size={12} color="muted">
            Subs: {fmtX(ipo.subscription.total)}
          </Txt>
        </View>
        {daysLabel ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Icon name="clock" size={12} color="muted" />
            <Txt size={12} color="onSurfaceSecondary">
              {daysLabel}
            </Txt>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function Metric({
  label,
  value,
  children,
  alignEnd,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  alignEnd?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: alignEnd ? "flex-end" : "flex-start" }}>
      <Txt size={11} color="muted" style={{ marginBottom: 3 }}>
        {label}
      </Txt>
      {children ?? (
        <Txt size={14} weight="displayMedium">
          {value}
        </Txt>
      )}
    </View>
  );
}
