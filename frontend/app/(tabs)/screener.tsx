import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/header";
import { useAuth } from "@/src/auth";
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  LoadingState,
  Pill,
  Txt,
} from "@/src/components/ui";
import { useScreenerMutations, useScreeners } from "@/src/queries";
import type { Filters, Screener } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

const STATUS = ["open", "upcoming", "closed", "listed"];
const TYPES = ["Mainboard", "SME"];
const SIZE = [
  { label: "Any", value: null },
  { label: "> ₹250 Cr", value: 250 },
  { label: "> ₹500 Cr", value: 500 },
  { label: "> ₹1,000 Cr", value: 1000 },
  { label: "> ₹2,000 Cr", value: 2000 },
];
const GMP = [
  { label: "Any", value: null },
  { label: "> 5%", value: 5 },
  { label: "> 10%", value: 10 },
  { label: "> 20%", value: 20 },
  { label: "> 30%", value: 30 },
];

function summarize(f: Filters): string {
  const parts: string[] = [];
  if (f.status) parts.push(f.status);
  if (f.ipo_type) parts.push(f.ipo_type);
  if (f.min_issue_size) parts.push(`>₹${f.min_issue_size}Cr`);
  if (f.min_gmp_pct != null) parts.push(`GMP>${f.min_gmp_pct}%`);
  return parts.length ? parts.join(" · ") : "All IPOs";
}

export default function ScreenerScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  const { user, signIn } = useAuth();
  const { data, isLoading } = useScreeners(!!user);
  const { create, update, remove } = useScreenerMutations();
  const sheetRef = useRef<BottomSheetModal>(null);

  const [editing, setEditing] = useState<Screener | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Filters>({ sort: "gmp_pct", order: "desc" });

  const snapPoints = useMemo(() => ["80%"], []);
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
    ),
    [],
  );

  const openNew = () => {
    setEditing(null);
    setName("");
    setDraft({ sort: "gmp_pct", order: "desc" });
    sheetRef.current?.present();
  };
  const openEdit = (sc: Screener) => {
    setEditing(sc);
    setName(sc.name);
    setDraft(sc.filters);
    sheetRef.current?.present();
  };

  const save = () => {
    const payload = { name: name.trim() || "My Screener", filters: draft, is_default: editing?.is_default ?? false };
    if (editing) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    sheetRef.current?.dismiss();
  };

  const runScreener = (f: Filters) =>
    router.push({ pathname: "/ipos", params: { preset: JSON.stringify(f) } });

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title="Screeners"
        subtitle="Saved filter combinations"
        right={
          user ? (
            <Pressable onPress={openNew} testID="new-screener" hitSlop={10} style={{ padding: 8 }}>
              <Icon name="plus" />
            </Pressable>
          ) : undefined
        }
      />

      {!user ? (
        <View style={{ padding: 24, gap: 16, alignItems: "center", marginTop: 40 }}>
          <Icon name="filter" size={36} color="muted" />
          <Txt size={16} weight="bold" style={{ textAlign: "center" }}>
            Save your IPO screeners
          </Txt>
          <Txt size={13} color="muted" style={{ textAlign: "center", lineHeight: 19 }}>
            Sign in to save filter combinations like &quot;Mainboard, {">"} ₹1,000 Cr, GMP {">"} 10%&quot;
            and run them anytime.
          </Txt>
          <Pressable style={s.signInBtn} onPress={signIn} testID="screener-signin">
            <Icon name="log-in" size={16} color="onBrandPrimary" />
            <Txt size={14} weight="bold" color="onBrandPrimary">
              Sign in with Google
            </Txt>
          </Pressable>
        </View>
      ) : isLoading ? (
        <LoadingState />
      ) : !data || data.screeners.length === 0 ? (
        <View style={{ paddingTop: 30 }}>
          <EmptyState
            title="No saved screeners yet"
            message="Tap + to create your first screener."
            icon="filter"
          />
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <Pressable style={s.signInBtn} onPress={openNew} testID="empty-new-screener">
              <Icon name="plus" size={16} color="onBrandPrimary" />
              <Txt size={14} weight="bold" color="onBrandPrimary">
                New Screener
              </Txt>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
          {data.screeners.map((sc) => (
            <Card key={sc.id} testID={`screener-${sc.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Txt size={15} weight="bold" numberOfLines={1}>
                      {sc.name}
                    </Txt>
                    {sc.is_default ? <Pill text="Default" /> : null}
                  </View>
                  <Txt size={12} color="muted" style={{ marginTop: 4 }}>
                    {summarize(sc.filters)}
                  </Txt>
                </View>
                <Pressable style={s.runBtn} onPress={() => runScreener(sc.filters)} testID={`run-${sc.id}`}>
                  <Icon name="play" size={13} color="onBrandPrimary" />
                  <Txt size={12} weight="bold" color="onBrandPrimary">
                    Run
                  </Txt>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 18, marginTop: 12 }}>
                <Action icon="edit-2" label="Edit" onPress={() => openEdit(sc)} testID={`edit-${sc.id}`} />
                <Action
                  icon="copy"
                  label="Duplicate"
                  onPress={() =>
                    create.mutate({ name: `${sc.name} copy`, filters: sc.filters, is_default: false })
                  }
                  testID={`dup-${sc.id}`}
                />
                <Action
                  icon="star"
                  label="Default"
                  onPress={() =>
                    update.mutate({ id: sc.id, name: sc.name, filters: sc.filters, is_default: true })
                  }
                  testID={`default-${sc.id}`}
                />
                <Action
                  icon="trash-2"
                  label="Delete"
                  onPress={() => remove.mutate(sc.id)}
                  testID={`delete-${sc.id}`}
                  danger
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 18 }}>
          <Txt size={18} weight="bold">
            {editing ? "Edit Screener" : "New Screener"}
          </Txt>
          <View>
            <Txt size={12} color="muted" style={{ marginBottom: 6 }}>
              Name
            </Txt>
            <BottomSheetTextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. My Large IPO Screener"
              placeholderTextColor={colors.muted}
              style={s.nameInput}
              testID="screener-name-input"
            />
          </View>
          <Grp title="Status">
            {STATUS.map((st) => (
              <Chip
                key={st}
                label={st.charAt(0).toUpperCase() + st.slice(1)}
                active={draft.status === st}
                onPress={() => set({ status: draft.status === st ? null : st })}
                testID={`sb-status-${st}`}
              />
            ))}
          </Grp>
          <Grp title="Type">
            {TYPES.map((t) => (
              <Chip
                key={t}
                label={t}
                active={draft.ipo_type === t}
                onPress={() => set({ ipo_type: draft.ipo_type === t ? null : t })}
                testID={`sb-type-${t}`}
              />
            ))}
          </Grp>
          <Grp title="Min Issue Size">
            {SIZE.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                active={(draft.min_issue_size ?? null) === o.value}
                onPress={() => set({ min_issue_size: o.value })}
                testID={`sb-size-${o.value ?? "any"}`}
              />
            ))}
          </Grp>
          <Grp title="Min GMP">
            {GMP.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                active={(draft.min_gmp_pct ?? null) === o.value}
                onPress={() => set({ min_gmp_pct: o.value })}
                testID={`sb-gmp-${o.value ?? "any"}`}
              />
            ))}
          </Grp>
          <Pressable style={s.saveBtn} onPress={save} testID="screener-save">
            <Txt size={15} weight="bold" color="onBrandPrimary">
              {editing ? "Update Screener" : "Save Screener"}
            </Txt>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  testID,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  testID?: string;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Icon name={icon} size={14} color={danger ? "loss" : "onSurfaceSecondary"} />
      <Txt size={12} weight="medium" color={danger ? "loss" : "onSurfaceSecondary"}>
        {label}
      </Txt>
    </Pressable>
  );
}

function Grp({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Txt size={13} weight="semibold" color="muted">
        {title}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
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
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 8,
  },
  nameInput: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 12,
    color: colors.onSurface,
    fontFamily: "PlusJakartaSans-Medium",
    fontSize: 15,
  },
  saveBtn: {
    height: 50,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
}));
