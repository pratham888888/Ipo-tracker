import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/header";
import { IpoCard } from "@/src/components/ipo-card";
import { useAuth } from "@/src/auth";
import { EmptyState, Icon, LoadingState, Txt } from "@/src/components/ui";
import { useWatchlist } from "@/src/queries";
import { makeStyles } from "@/src/theme";

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { user, signIn } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useWatchlist(!!user);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title="Watchlist"
        subtitle={user ? `${data?.ipos.length ?? 0} tracked` : "Track your IPOs"}
      />
      {!user ? (
        <View style={{ padding: 24, gap: 16, alignItems: "center", marginTop: 40 }}>
          <Icon name="star" size={36} color="muted" />
          <Txt size={16} weight="bold" style={{ textAlign: "center" }}>
            Track IPOs you care about
          </Txt>
          <Txt size={13} color="muted" style={{ textAlign: "center", lineHeight: 19 }}>
            Sign in to build a watchlist and follow GMP, subscription and key dates for your chosen
            IPOs.
          </Txt>
          <Pressable style={s.signInBtn} onPress={signIn} testID="watchlist-signin">
            <Icon name="log-in" size={16} color="onBrandPrimary" />
            <Txt size={14} weight="bold" color="onBrandPrimary">
              Sign in with Google
            </Txt>
          </Pressable>
        </View>
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={data?.ipos ?? []}
          keyExtractor={(i) => i.slug}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => <IpoCard ipo={item} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 30 }}>
              <EmptyState
                title="Your watchlist is empty"
                message="Open any IPO and tap the star to add it here."
                icon="star"
              />
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    height: 48,
    borderRadius: 10,
    justifyContent: "center",
  },
}));
