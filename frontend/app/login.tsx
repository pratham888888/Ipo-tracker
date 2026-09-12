import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Icon, Txt } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { user, signIn } = useAuth();

  useEffect(() => {
    if (user) router.back();
  }, [user]);

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: "flex-end" }} testID="login-close">
        <Icon name="x" size={24} color="muted" />
      </Pressable>

      <View style={{ flex: 1, justifyContent: "center", gap: 16 }}>
        <View style={s.logo}>
          <Icon name="bar-chart-2" size={30} color="onBrandPrimary" />
        </View>
        <Txt size={24} weight="display">
          IPO Terminal
        </Txt>
        <Txt size={14} color="muted" style={{ lineHeight: 21 }}>
          Sign in with Google to save screeners, build a watchlist, and sync across your devices.
        </Txt>
        <View style={{ gap: 12, marginTop: 8 }}>
          {[
            "Track GMP & subscription for chosen IPOs",
            "Save & re-run custom screeners",
            "Category-aware allotment estimates",
          ].map((b) => (
            <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Icon name="check-circle" size={16} color="gain" />
              <Txt size={13} color="onSurfaceSecondary">
                {b}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      <Pressable style={s.btn} onPress={signIn} testID="login-google">
        <Icon name="log-in" size={18} color="onBrandPrimary" />
        <Txt size={15} weight="bold" color="onBrandPrimary">
          Continue with Google
        </Txt>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24 },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.brandPrimary,
    height: 54,
    borderRadius: 12,
  },
}));
