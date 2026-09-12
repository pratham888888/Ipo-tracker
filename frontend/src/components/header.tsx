import { router } from "expo-router";
import { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Txt } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export function AppHeader({
  title,
  subtitle,
  right,
  showBack,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  showBack?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + 8 }]} testID={testID}>
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 8 }}>
          {showBack ? (
            <Pressable onPress={() => router.back()} hitSlop={10} testID="header-back">
              <Icon name="chevron-left" size={26} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Txt size={22} weight="display" numberOfLines={1}>
              {title}
            </Txt>
            {subtitle ? (
              <Txt size={11} color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                {subtitle}
              </Txt>
            ) : null}
          </View>
        </View>
        {right ? <View style={s.right}>{right}</View> : null}
      </View>
    </View>
  );
}

export function DisclaimerBanner({ compact }: { compact?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.disclaimer} testID="disclaimer-banner">
      <Icon name="info" size={13} color="muted" />
      <Txt size={11} color="muted" style={{ flex: 1, lineHeight: 16 }}>
        {compact
          ? "Informational & educational only. Not investment advice. GMP is unofficial."
          : "This platform is for informational and educational purposes only and does not constitute investment advice, a recommendation, or a guarantee of IPO allotment or listing performance. GMP is an unofficial market indicator and may differ materially from the actual listing price."}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  disclaimer: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    alignItems: "flex-start",
  },
}));
