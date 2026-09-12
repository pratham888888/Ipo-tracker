import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip, Txt } from "@/src/components/ui";
import type { Filters } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

const ISSUE_SIZE_OPTIONS = [
  { label: "Any size", value: null },
  { label: "> ₹100 Cr", value: 100 },
  { label: "> ₹250 Cr", value: 250 },
  { label: "> ₹500 Cr", value: 500 },
  { label: "> ₹1,000 Cr", value: 1000 },
  { label: "> ₹2,000 Cr", value: 2000 },
  { label: "> ₹5,000 Cr", value: 5000 },
];

const GMP_OPTIONS = [
  { label: "Any GMP", value: null },
  { label: "> 0%", value: 0 },
  { label: "> 5%", value: 5 },
  { label: "> 10%", value: 10 },
  { label: "> 20%", value: 20 },
  { label: "> 30%", value: 30 },
  { label: "> 50%", value: 50 },
];

const SORT_OPTIONS = [
  { label: "GMP %", value: "gmp_pct" },
  { label: "GMP ₹", value: "gmp_rupees" },
  { label: "Issue Size", value: "issue_size" },
  { label: "Subscription", value: "subscription" },
  { label: "Open Date", value: "open_date" },
  { label: "Close Date", value: "close_date" },
  { label: "Company", value: "company" },
];

export const FilterSheet = forwardRef<
  BottomSheetModal,
  { value: Filters; onApply: (f: Filters) => void }
>(({ value, onApply }, ref) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const [draft, setDraft] = useState<Filters>(value);

  const snapPoints = useMemo(() => ["75%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
    ),
    [],
  );

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      onChange={(i) => i === 0 && setDraft(value)}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90, gap: 20 }}
      >
        <Txt size={18} weight="bold">
          Filters
        </Txt>

        <Group title="Issue Size">
          {ISSUE_SIZE_OPTIONS.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              active={(draft.min_issue_size ?? null) === o.value}
              onPress={() => set({ min_issue_size: o.value })}
              testID={`filter-size-${o.value ?? "any"}`}
            />
          ))}
        </Group>

        <Group title="GMP">
          {GMP_OPTIONS.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              active={(draft.min_gmp_pct ?? null) === o.value}
              onPress={() => set({ min_gmp_pct: o.value })}
              testID={`filter-gmp-${o.value ?? "any"}`}
            />
          ))}
        </Group>

        <Group title="Sort By">
          {SORT_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={draft.sort === o.value}
              onPress={() => set({ sort: o.value })}
              testID={`filter-sort-${o.value}`}
            />
          ))}
        </Group>

        <Group title="Order">
          <Chip label="Descending" active={draft.order !== "asc"} onPress={() => set({ order: "desc" })} testID="filter-order-desc" />
          <Chip label="Ascending" active={draft.order === "asc"} onPress={() => set({ order: "asc" })} testID="filter-order-asc" />
        </Group>
      </BottomSheetScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={s.resetBtn}
          testID="filter-reset"
          onPress={() =>
            setDraft({
              status: draft.status,
              ipo_type: draft.ipo_type,
              min_issue_size: null,
              min_gmp_pct: null,
              sort: "gmp_pct",
              order: "desc",
            })
          }
        >
          <Txt size={14} weight="semibold" color="onSurfaceSecondary">
            Reset
          </Txt>
        </Pressable>
        <Pressable
          style={s.applyBtn}
          testID="filter-apply"
          onPress={() => {
            onApply(draft);
            (ref as any)?.current?.dismiss();
          }}
        >
          <Txt size={14} weight="bold" color="onBrandPrimary">
            Apply Filters
          </Txt>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
});

FilterSheet.displayName = "FilterSheet";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
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
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtn: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
}));
