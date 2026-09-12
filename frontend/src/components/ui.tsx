import Feather from "@react-native-vector-icons/feather";
import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { fonts, makeStyles, useTheme, type ThemeColors } from "@/src/theme";

type Weight = "regular" | "medium" | "semibold" | "bold" | "display" | "displayMedium";

const FONT: Record<Weight, string> = {
  regular: fonts.regular,
  medium: fonts.medium,
  semibold: fonts.semibold,
  bold: fonts.bold,
  display: fonts.display,
  displayMedium: fonts.displayMedium,
};

export function Txt({
  children,
  size = 14,
  weight = "regular",
  color,
  style,
  numberOfLines,
  testID,
}: {
  children: ReactNode;
  size?: number;
  weight?: Weight;
  color?: keyof ThemeColors;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: FONT[weight], fontSize: size, color: colors[color ?? "onSurface"] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  onPress,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
}) {
  const s = useStyles();
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [s.card, pressed && s.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { colors } = useTheme();
  const key =
    status === "open"
      ? "statusOpen"
      : status === "upcoming"
        ? "statusUpcoming"
        : status === "listed"
          ? "statusListed"
          : "statusClosed";
  const c = colors[key as keyof ThemeColors] as string;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: c }}>{label}</Text>
    </View>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const s = useStyles();
  return (
    <View style={s.typeBadge}>
      <Txt size={10} weight="semibold" color="onSurfaceTertiary">
        {type.toUpperCase()}
      </Txt>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[s.chip, active && s.chipActive]}
    >
      <Text
        style={[s.chipText, active && s.chipTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function GmpValue({
  rupees,
  percent,
  size = 15,
}: {
  rupees: number | null;
  percent: number | null;
  size?: number;
}) {
  const { colors } = useTheme();
  if (rupees == null && percent == null) {
    return (
      <Txt size={size} weight="displayMedium" color="muted">
        —
      </Txt>
    );
  }
  const positive = (percent ?? rupees ?? 0) >= 0;
  const c = positive ? colors.gain : colors.loss;
  return (
    <Text style={{ fontFamily: fonts.display, fontSize: size, color: c }}>
      {rupees != null ? `₹${rupees}` : ""}
      {percent != null ? ` (${percent > 0 ? "+" : ""}${percent.toFixed(1)}%)` : ""}
    </Text>
  );
}

export function KeyValue({
  label,
  value,
  valueColor,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  valueColor?: keyof ThemeColors;
  mono?: boolean;
}) {
  const s = useStyles();
  return (
    <View style={s.kv}>
      <Txt size={12} color="muted" style={{ marginBottom: 3 }}>
        {label}
      </Txt>
      {typeof value === "string" || typeof value === "number" ? (
        <Txt
          size={14}
          weight={mono ? "displayMedium" : "semibold"}
          color={valueColor ?? "onSurface"}
        >
          {value}
        </Txt>
      ) : (
        value
      )}
    </View>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <Txt size={16} weight="bold">
        {title}
      </Txt>
      {right}
    </View>
  );
}

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: string;
  size?: number;
  color?: keyof ThemeColors;
}) {
  const { colors } = useTheme();
  return <Feather name={name as any} size={size} color={colors[color ?? "onSurface"] as string} />;
}

export function IconButton({
  name,
  onPress,
  testID,
  color,
}: {
  name: string;
  onPress: () => void;
  testID?: string;
  color?: keyof ThemeColors;
}) {
  const s = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={10} style={s.iconBtn}>
      <Icon name={name} color={color} />
    </Pressable>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 12 }} testID="loading-state">
      <ActivityIndicator color={colors.onSurface} />
      {label ? (
        <Txt size={13} color="muted">
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon = "inbox",
}: {
  title: string;
  message?: string;
  icon?: string;
}) {
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 8 }} testID="empty-state">
      <Icon name={icon} size={32} color="muted" />
      <Txt size={15} weight="semibold" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {message ? (
        <Txt size={13} color="muted" style={{ textAlign: "center" }}>
          {message}
        </Txt>
      ) : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const s = useStyles();
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 12 }} testID="error-state">
      <Icon name="alert-triangle" size={30} color="warning" />
      <Txt size={14} weight="semibold" style={{ textAlign: "center" }}>
        Data temporarily unavailable
      </Txt>
      <Txt size={12} color="muted" style={{ textAlign: "center" }}>
        We could not reach the data provider. Cached data is shown when available.
      </Txt>
      {onRetry ? (
        <Pressable onPress={onRetry} style={s.retryBtn} testID="retry-button">
          <Txt size={13} weight="semibold" color="onBrandPrimary">
            Retry
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SourceFooter({
  provider,
  label,
  note,
}: {
  provider?: string | null;
  label?: string | null;
  note?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <Icon name="database" size={11} color="muted" />
      <Txt size={11} color="muted">
        {note ?? `Source: ${provider ?? "provider"}`}
        {label ? ` · Updated: ${label}` : ""}
      </Txt>
    </View>
  );
}

export function Pill({ text, tone = "muted" }: { text: string; tone?: keyof ThemeColors }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceTertiary,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors[tone] as string }}>
        {text}
      </Text>
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ maxHeight: 56 }}
    >
      {children}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  pressed: { opacity: 0.7 },
  typeBadge: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onBrandPrimary, fontFamily: fonts.semibold },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  retryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
}));
