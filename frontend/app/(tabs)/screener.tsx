import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
  { label: "Any", value: null as number | null },
  { label: "> ₹250 Cr", value: 250 },
  { label: "> ₹500 Cr", value: 500 },
  { label: "> ₹1,000 Cr", value: 1000 },
  { label: "> ₹2,000 Cr", value: 2000 },
  { label: "> ₹5,000 Cr", value: 5000 },
  { label: "> ₹10,000 Cr", value: 10000 },
];
const GMP = [
  { label: "Any", value: null as number | null },
  { label: "> 0%", value: 0 },
  { label: "> 5%", value: 5 },
  { label: "> 10%", value: 10 },
  { label: "> 20%", value: 20 },
  { label: "> 30%", value: 30 },
  { label: "> 50%", value: 50 },
];
const SUB_FIELDS = [
  { label: "Total", value: "total" as const },
  { label: "QIB", value: "qib" as const },
  { label: "sNII", value: "snii" as const },
  { label: "bNII", value: "bnii" as const },
  { label: "Retail", value: "retail" as const },
];

const EMPTY_FILTERS: Filters = { sort: "gmp_pct", order: "desc" };

export function summarize(f: Filters): string {
  const parts: string[] = [];
  if (f.status) parts.push(f.status);
  if (f.ipo_type) parts.push(f.ipo_type);
  if (f.min_issue_size != null) parts.push(`size≥₹${f.min_issue_size}Cr`);
  if (f.max_issue_size != null) parts.push(`size≤₹${f.max_issue_size}Cr`);
  if (f.min_gmp_pct != null) parts.push(`GMP≥${f.min_gmp_pct}%`);
  if (f.max_gmp_pct != null) parts.push(`GMP≤${f.max_gmp_pct}%`);
  if (f.min_subscription != null) {
    parts.push(`${f.subscription_field ?? "total"}≥${f.min_subscription}x`);
  }
  if (f.max_subscription != null) {
    parts.push(`${f.subscription_field ?? "total"}≤${f.max_subscription}x`);
  }
  if (f.sector) parts.push(`sector:${f.sector}`);
  if (f.industry) parts.push(`industry:${f.industry}`);
  if (f.open_date_from || f.open_date_to) parts.push("open-date filter");
  if (f.close_date_from || f.close_date_to) parts.push("close-date filter");
  if (f.allotment_date_from || f.allotment_date_to) parts.push("allotment-date filter");
  if (f.listing_date_from || f.listing_date_to) parts.push("listing-date filter");
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
  const browseRef = useRef<BottomSheetModal>(null);

  const [editing, setEditing] = useState<Screener | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Filters>({ ...EMPTY_FILTERS });
  const [browseDraft, setBrowseDraft] = useState<Filters>({ ...EMPTY_FILTERS });

  const snapPoints = useMemo(() => ["90%"], []);
  const renderBackdrop = useCallback(
    (props: Record<string, unknown>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
    ),
    [],
  );

  const openNew = () => {
    if (!user) {
      signIn();
      return;
    }
    setEditing(null);
    setName("");
    setDraft({ ...EMPTY_FILTERS });
    sheetRef.current?.present();
  };
  const openEdit = (sc: Screener) => {
    setEditing(sc);
    setName(sc.name);
    setDraft({ ...EMPTY_FILTERS, ...sc.filters });
    sheetRef.current?.present();
  };
  const openBrowse = () => {
    setBrowseDraft({ ...EMPTY_FILTERS });
    browseRef.current?.present();
  };

  const save = () => {
    if (!user) {
      signIn();
      return;
    }
    const payload = {
      name: name.trim() || "My Screener",
      filters: draft,
      is_default: editing?.is_default ?? false,
    };
    if (editing) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    sheetRef.current?.dismiss();
  };

  const runScreener = (f: Filters) =>
    router.push({ pathname: "/ipos", params: { preset: JSON.stringify(f) } });

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const setBrowse = (patch: Partial<Filters>) => setBrowseDraft((d) => ({ ...d, ...patch }));

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title="Screeners"
        subtitle="Filter & saved combinations"
        right={
          <View style={{ flexDirection: "row" }}>
            <Pressable onPress={openBrowse} testID="browse-screener" hitSlop={10} style={{ padding: 8 }}>
              <Icon name="search" />
            </Pressable>
            <Pressable onPress={openNew} testID="new-screener" hitSlop={10} style={{ padding: 8 }}>
              <Icon name="plus" />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <Card style={{ gap: 10 }} testID="screener-browse-card">
          <Txt size={14} weight="bold">
            Run filters without saving
          </Txt>
          <Txt size={12} color="muted">
            Browsing the screener works while logged out. Saving a screener requires sign-in.
          </Txt>
          <Pressable style={s.signInBtn} onPress={openBrowse} testID="open-browse-filters">
            <Icon name="filter" size={16} color="onBrandPrimary" />
            <Txt size={14} weight="bold" color="onBrandPrimary">
              Open Screener Filters
            </Txt>
          </Pressable>
        </Card>

        {!user ? (
          <Card style={{ gap: 12 }} testID="screener-login-prompt">
            <Txt size={14} weight="bold">
              Save your IPO screeners
            </Txt>
            <Txt size={12} color="muted" style={{ lineHeight: 18 }}>
              Sign in to save filter combinations like &quot;Mainboard, {">"} ₹1,000 Cr, GMP {">"} 10%&quot;
              and run them anytime.
            </Txt>
            <Pressable style={s.outlineBtn} onPress={signIn} testID="screener-signin">
              <Icon name="log-in" size={16} color="onSurface" />
              <Txt size={14} weight="semibold">
                Sign in with Google
              </Txt>
            </Pressable>
          </Card>
        ) : isLoading ? (
          <LoadingState />
        ) : !data || data.screeners.length === 0 ? (
          <EmptyState
            title="No saved screeners yet"
            message="Tap + to create your first screener."
            icon="filter"
          />
        ) : (
          data.screeners.map((sc) => (
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
              <View style={{ flexDirection: "row", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
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
          ))
        )}
      </ScrollView>

      <FilterEditorSheet
        sheetRef={sheetRef}
        snapPoints={snapPoints}
        renderBackdrop={renderBackdrop}
        colors={colors}
        insetsBottom={insets.bottom}
        title={editing ? "Edit Screener" : "New Screener"}
        name={name}
        setName={setName}
        draft={draft}
        set={set}
        onReset={() => setDraft({ ...EMPTY_FILTERS })}
        primaryLabel={editing ? "Update Screener" : "Save Screener"}
        onPrimary={save}
        showName
        styles={s}
      />

      <FilterEditorSheet
        sheetRef={browseRef}
        snapPoints={snapPoints}
        renderBackdrop={renderBackdrop}
        colors={colors}
        insetsBottom={insets.bottom}
        title="Screener Filters"
        name=""
        setName={() => undefined}
        draft={browseDraft}
        set={setBrowse}
        onReset={() => setBrowseDraft({ ...EMPTY_FILTERS })}
        primaryLabel="Run Screener"
        onPrimary={() => {
          browseRef.current?.dismiss();
          runScreener(browseDraft);
        }}
        showName={false}
        styles={s}
      />
    </View>
  );
}

function FilterEditorSheet({
  sheetRef,
  snapPoints,
  renderBackdrop,
  colors,
  insetsBottom,
  title,
  name,
  setName,
  draft,
  set,
  onReset,
  primaryLabel,
  onPrimary,
  showName,
  styles: s,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  snapPoints: string[];
  renderBackdrop: (props: Record<string, unknown>) => React.ReactElement;
  colors: { surface: string; borderStrong: string; muted: string };
  insetsBottom: number;
  title: string;
  name: string;
  setName: (v: string) => void;
  draft: Filters;
  set: (patch: Partial<Filters>) => void;
  onReset: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  showName: boolean;
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insetsBottom + 40, gap: 18 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt size={18} weight="bold">
            {title}
          </Txt>
          <Pressable onPress={onReset} testID="screener-reset-filters">
            <Txt size={13} weight="semibold" color="onSurfaceSecondary">
              Reset filters
            </Txt>
          </Pressable>
        </View>

        <Card style={{ padding: 12 }}>
          <Txt size={11} color="muted">
            Active filters
          </Txt>
          <Txt size={13} weight="semibold" style={{ marginTop: 4 }}>
            {summarize(draft)}
          </Txt>
        </Card>

        {showName ? (
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
        ) : null}

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
        <Grp title="Issue Size (min)">
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
        <CustomNum
          label="Custom min issue size (₹ Cr)"
          value={draft.min_issue_size}
          onChange={(v) => set({ min_issue_size: v })}
          testID="sb-size-custom-min"
          colors={colors}
          style={s.nameInput}
        />
        <CustomNum
          label="Custom max issue size (₹ Cr)"
          value={draft.max_issue_size}
          onChange={(v) => set({ max_issue_size: v })}
          testID="sb-size-custom-max"
          colors={colors}
          style={s.nameInput}
        />
        <Grp title="GMP % (min)">
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
        <CustomNum
          label="Custom min GMP %"
          value={draft.min_gmp_pct}
          onChange={(v) => set({ min_gmp_pct: v })}
          testID="sb-gmp-custom-min"
          colors={colors}
          style={s.nameInput}
        />
        <CustomNum
          label="Custom max GMP %"
          value={draft.max_gmp_pct}
          onChange={(v) => set({ max_gmp_pct: v })}
          testID="sb-gmp-custom-max"
          colors={colors}
          style={s.nameInput}
        />
        <Grp title="Subscription field">
          {SUB_FIELDS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={(draft.subscription_field ?? "total") === o.value}
              onPress={() => set({ subscription_field: o.value })}
              testID={`sb-subfield-${o.value}`}
            />
          ))}
        </Grp>
        <CustomNum
          label="Min subscription (x)"
          value={draft.min_subscription}
          onChange={(v) => set({ min_subscription: v })}
          testID="sb-sub-min"
          colors={colors}
          style={s.nameInput}
        />
        <CustomNum
          label="Max subscription (x)"
          value={draft.max_subscription}
          onChange={(v) => set({ max_subscription: v })}
          testID="sb-sub-max"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Sector"
          value={draft.sector ?? ""}
          onChange={(v) => set({ sector: v || null })}
          testID="sb-sector"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Industry"
          value={draft.industry ?? ""}
          onChange={(v) => set({ industry: v || null })}
          testID="sb-industry"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Open date from (YYYY-MM-DD)"
          value={draft.open_date_from ?? ""}
          onChange={(v) => set({ open_date_from: v || null })}
          testID="sb-open-from"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Open date to (YYYY-MM-DD)"
          value={draft.open_date_to ?? ""}
          onChange={(v) => set({ open_date_to: v || null })}
          testID="sb-open-to"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Close date from (YYYY-MM-DD)"
          value={draft.close_date_from ?? ""}
          onChange={(v) => set({ close_date_from: v || null })}
          testID="sb-close-from"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Close date to (YYYY-MM-DD)"
          value={draft.close_date_to ?? ""}
          onChange={(v) => set({ close_date_to: v || null })}
          testID="sb-close-to"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Allotment date from (YYYY-MM-DD)"
          value={draft.allotment_date_from ?? ""}
          onChange={(v) => set({ allotment_date_from: v || null })}
          testID="sb-allot-from"
          colors={colors}
          style={s.nameInput}
        />
        <TextField
          label="Listing date from (YYYY-MM-DD)"
          value={draft.listing_date_from ?? ""}
          onChange={(v) => set({ listing_date_from: v || null })}
          testID="sb-list-from"
          colors={colors}
          style={s.nameInput}
        />

        <Txt size={11} color="muted">
          Estimated allotment chance and GMP trend filters only apply when those
          metrics are reliably available on matching IPOs. Missing data is excluded,
          not treated as zero.
        </Txt>

        <Pressable style={s.saveBtn} onPress={onPrimary} testID="screener-save">
          <Txt size={15} weight="bold" color="onBrandPrimary">
            {primaryLabel}
          </Txt>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function CustomNum({
  label,
  value,
  onChange,
  testID,
  colors,
  style,
}: {
  label: string;
  value?: number | null;
  onChange: (v: number | null) => void;
  testID?: string;
  colors: { muted: string };
  style: object;
}) {
  return (
    <View>
      <Txt size={12} color="muted" style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <BottomSheetTextInput
        value={value == null ? "" : String(value)}
        onChangeText={(t) => {
          const cleaned = t.trim();
          if (!cleaned) onChange(null);
          else {
            const n = Number(cleaned);
            onChange(Number.isFinite(n) ? n : null);
          }
        }}
        keyboardType="numeric"
        placeholder="Custom"
        placeholderTextColor={colors.muted}
        style={style}
        testID={testID}
      />
    </View>
  );
}

function TextField({
  label,
  value,
  onChange,
  testID,
  colors,
  style,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
  colors: { muted: string };
  style: object;
}) {
  return (
    <View>
      <Txt size={12} color="muted" style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <BottomSheetTextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.muted}
        style={style}
        testID={testID}
      />
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
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    height: 44,
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
