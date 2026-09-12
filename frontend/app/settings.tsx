import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, DisclaimerBanner } from "@/src/components/header";
import { useAuth } from "@/src/auth";
import { Card, Icon, Pill, Txt } from "@/src/components/ui";
import { useMeta } from "@/src/queries";
import {
  makeStyles,
  setThemeMode,
  useTheme,
  useThemeMode,
  type ThemeMode,
} from "@/src/theme";

const MODES: { key: ThemeMode; label: string; icon: string }[] = [
  { key: "system", label: "System", icon: "smartphone" },
  { key: "light", label: "Light", icon: "sun" },
  { key: "dark", label: "Dark", icon: "moon" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  const { user, signIn, signOut } = useAuth();
  const mode = useThemeMode();
  const { data: meta } = useMeta();

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title="Settings" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 24 }}>
        <Section title="Account">
          <Card>
            {user ? (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={s.avatar}>
                    <Txt size={18} weight="display" color="onBrandPrimary">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt size={15} weight="bold" numberOfLines={1}>
                      {user.name ?? "Signed in"}
                    </Txt>
                    <Txt size={12} color="muted" numberOfLines={1}>
                      {user.email}
                    </Txt>
                  </View>
                </View>
                <Pressable style={s.outlineBtn} onPress={signOut} testID="sign-out">
                  <Icon name="log-out" size={16} color="loss" />
                  <Txt size={14} weight="semibold" color="loss">
                    Sign out
                  </Txt>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Txt size={13} color="muted">
                  Sign in with Google to sync your watchlist and saved screeners across devices.
                </Txt>
                <Pressable style={s.primaryBtn} onPress={signIn} testID="settings-signin">
                  <Icon name="log-in" size={16} color="onBrandPrimary" />
                  <Txt size={14} weight="bold" color="onBrandPrimary">
                    Sign in with Google
                  </Txt>
                </Pressable>
              </View>
            )}
          </Card>
        </Section>

        <Section title="Appearance">
          <Card>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {MODES.map((m) => {
                const active = mode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => setThemeMode(m.key)}
                    testID={`theme-${m.key}`}
                    style={[s.modeBtn, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                  >
                    <Icon name={m.icon} size={18} color={active ? "onBrandPrimary" : "onSurfaceSecondary"} />
                    <Txt size={12} weight="semibold" color={active ? "onBrandPrimary" : "onSurfaceSecondary"}>
                      {m.label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </Section>

        <Section title="Data Source">
          <Card>
            <Row label="Provider" value={meta?.provider ?? "—"} />
            <Row
              label="Status"
              value={meta?.healthy ? "Healthy" : "Degraded"}
              pill={meta?.healthy ? "OK" : "!"}
            />
            <Row label="IPOs cached" value={String(meta?.count ?? 0)} />
            <Row label="Last updated" value={meta?.last_updated_label ?? "—"} />
            <Txt size={11} color="muted" style={{ marginTop: 8, lineHeight: 16 }}>
              Live GMP & subscription data is delayed and unofficial. Fields not published by the
              provider are shown as unavailable rather than estimated.
            </Txt>
          </Card>
        </Section>

        <Section title="Legal">
          <DisclaimerBanner />
        </Section>

        <Pressable onPress={() => router.push("/calendar")} style={s.linkRow} testID="settings-calendar">
          <Icon name="calendar" size={16} color="onSurfaceSecondary" />
          <Txt size={14} weight="semibold" style={{ flex: 1 }}>
            IPO Calendar
          </Txt>
          <Icon name="chevron-right" size={16} color="muted" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Txt size={13} weight="semibold" color="muted">
        {title.toUpperCase()}
      </Txt>
      {children}
    </View>
  );
}

function Row({ label, value, pill }: { label: string; value: string; pill?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <Txt size={13} color="onSurfaceSecondary">
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {pill ? <Pill text={pill} /> : null}
        <Txt size={13} weight="displayMedium">
          {value}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    height: 48,
    borderRadius: 10,
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    height: 44,
    borderRadius: 10,
  },
  modeBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
}));
