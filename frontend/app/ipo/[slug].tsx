import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, DisclaimerBanner } from "@/src/components/header";
import {
  Card,
  Chip,
  GmpValue,
  Icon,
  KeyValue,
  LoadingState,
  ErrorState,
  Pill,
  SectionHeader,
  SourceFooter,
  Txt,
} from "@/src/components/ui";
import { fmtCrore, fmtPct, fmtRupee, fmtX, naOr } from "@/src/format";
import {
  useAiSummary,
  useAllotmentMutation,
  useGmpHistory,
  useIpo,
  useToggleWatchlist,
  useWatchlist,
} from "@/src/queries";
import { useAuth } from "@/src/auth";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function IpoDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: ipo, isLoading, isError, refetch } = useIpo(slug);
  const wl = useWatchlist(!!user);
  const toggleWl = useToggleWatchlist();

  const watched = wl.data?.slugs.includes(slug) ?? false;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title={ipo?.company_name ?? "IPO"}
        subtitle={ipo ? `${ipo.ipo_type} · ${naOr(ipo.symbol)}` : "Loading…"}
        showBack
        right={
          ipo ? (
            <Pressable
              testID="watch-toggle"
              hitSlop={10}
              style={{ padding: 8 }}
              onPress={() => {
                if (!user) {
                  router.push("/login");
                  return;
                }
                toggleWl.mutate({ slug, add: !watched });
              }}
            >
              <Icon name="star" color={watched ? "warning" : "muted"} />
            </Pressable>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState label="Loading IPO…" />
      ) : isError || !ipo ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          testID="ipo-detail-scroll"
        >
          {!user ? (
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="star" size={16} color="warning" />
              <Txt size={12} color="onSurfaceSecondary" style={{ flex: 1 }}>
                Sign in to add this IPO to your watchlist and save screeners.
              </Txt>
            </Card>
          ) : null}

          <LiveStatus ipo={ipo} />
          <Overview ipo={ipo} />
          <GmpTrend slug={slug} />
          <SubscriptionBlock ipo={ipo} />
          <Timeline ipo={ipo} />
          <AllotmentCalculator ipo={ipo} />
          <AnalysisSnapshot ipo={ipo} />
          <AiBusiness slug={slug} enabled={!!ipo} />
          <CheckAllotment ipo={ipo} />

          <SourceFooter provider={ipo.meta?.provider} label={ipo.meta?.last_updated_label} />
          <DisclaimerBanner />
        </ScrollView>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------- //
function LiveStatus({ ipo }: { ipo: any }) {
  const g = ipo.gmp ?? {};
  return (
    <Card testID="live-status">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pill text="GMP" />
          <Pill text="Unofficial / indicative" />
        </View>
        <Txt size={11} color="muted">
          {g.source_updated_label ? `Updated ${g.source_updated_label}` : "—"}
        </Txt>
      </View>
      <View style={{ marginTop: 12 }}>
        <GmpValue rupees={g.gmp_rupees} percent={g.gmp_percent} size={30} />
      </View>
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <KeyValue label="Est. Listing Price" value={fmtRupee(g.implied_listing_price)} />
        <KeyValue
          label="Est. Listing Gain"
          value={fmtPct(g.gmp_percent)}
          valueColor={(g.gmp_percent ?? 0) >= 0 ? "gain" : "loss"}
        />
        <KeyValue label="Total Subscription" value={fmtX(ipo.subscription?.total)} />
      </View>
      <Txt size={11} color="muted" style={{ marginTop: 10 }}>
        Estimated from GMP. GMP is an unofficial market indicator and is not a guarantee of the
        listing price or gain.
      </Txt>
    </Card>
  );
}

function Overview({ ipo }: { ipo: any }) {
  return (
    <View>
      <SectionHeader title="Overview" />
      <Card>
        <View style={s2row}>
          <KeyValue label="IPO Type" value={ipo.ipo_type} mono={false} />
          <KeyValue label="Status" value={ipo.status} mono={false} />
        </View>
        <Div />
        <View style={s2row}>
          <KeyValue label="Price Band" value={naOr(ipo.price_band_text)} />
          <KeyValue label="Lot Size" value={naOr(ipo.lot_size)} />
        </View>
        <Div />
        <View style={s2row}>
          <KeyValue
            label={ipo.issue_size_estimated ? "Issue Size (est.)" : "Issue Size"}
            value={fmtCrore(ipo.issue_size_crore)}
          />
          <KeyValue label="Min. Investment" value={fmtRupee(ipo.minimum_investment)} />
        </View>
        <Div />
        <View style={s2row}>
          <KeyValue label="Open Date" value={naOr(ipo.open_date_raw)} mono={false} />
          <KeyValue label="Close Date" value={naOr(ipo.close_date_raw)} mono={false} />
        </View>
        <Div />
        <View style={s2row}>
          <KeyValue label="Registrar" value={naOr(ipo.registrar)} mono={false} />
          <KeyValue label="Lead Managers" value={naOr(ipo.lead_managers)} mono={false} />
        </View>
      </Card>
    </View>
  );
}

function GmpTrend({ slug }: { slug: string }) {
  const { colors } = useTheme();
  const [range, setRange] = useState("all");
  const { data, isLoading } = useGmpHistory(slug, range);
  const points = data?.points ?? [];

  const chartData = useMemo(
    () =>
      points
        .filter((p) => p.gmp_rupees != null)
        .map((p) => ({ value: p.gmp_rupees })),
    [points],
  );

  return (
    <View>
      <SectionHeader
        title="GMP Trend"
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            {["1D", "3D", "7D", "all"].map((r) => (
              <Chip
                key={r}
                label={r === "all" ? "All" : r}
                active={range === r}
                onPress={() => setRange(r)}
                testID={`gmp-range-${r}`}
              />
            ))}
          </View>
        }
      />
      <Card>
        {isLoading ? (
          <LoadingState />
        ) : chartData.length < 2 ? (
          <View style={{ paddingVertical: 20, alignItems: "center", gap: 6 }}>
            <Icon name="trending-up" size={22} color="muted" />
            <Txt size={13} color="muted" style={{ textAlign: "center" }}>
              {chartData.length === 1
                ? "Collecting GMP history. Trend chart appears as more observations are recorded."
                : "Historical GMP data is not available for this IPO."}
            </Txt>
            {chartData.length === 1 ? (
              <Txt size={20} weight="display" color="onSurface">
                {fmtRupee(chartData[0].value)}
              </Txt>
            ) : null}
          </View>
        ) : (
          <>
            <LineChart
              data={chartData}
              color={colors.gain}
              thickness={2}
              hideDataPoints={chartData.length > 20}
              dataPointsColor={colors.gain}
              yAxisColor={colors.border}
              xAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              rulesColor={colors.divider}
              backgroundColor="transparent"
              height={160}
              adjustToWidth
              initialSpacing={8}
            />
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <KeyValue label="Current" value={fmtRupee(chartData[chartData.length - 1].value)} />
              <KeyValue
                label="High"
                value={fmtRupee(Math.max(...chartData.map((d) => d.value ?? 0)))}
              />
              <KeyValue
                label="Low"
                value={fmtRupee(Math.min(...chartData.map((d) => d.value ?? 0)))}
              />
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

function SubscriptionBlock({ ipo }: { ipo: any }) {
  const sub = ipo.subscription ?? {};
  const cats = [
    { key: "qib", label: "QIB" },
    { key: "snii", label: "sNII" },
    { key: "bnii", label: "bNII" },
    { key: "retail", label: "Retail" },
  ];
  const allNull = cats.every((c) => sub[c.key] == null);
  return (
    <View>
      <SectionHeader title="Subscription" />
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt size={13} color="muted">
            Total Subscription
          </Txt>
          <Txt size={16} weight="display">
            {fmtX(sub.total)}
          </Txt>
        </View>
        <Div />
        {allNull ? (
          <Txt size={12} color="muted">
            Category-wise subscription (QIB / sNII / bNII / Retail) is not published by the current
            data provider. Only the overall subscription multiple is available.
          </Txt>
        ) : (
          <View style={{ gap: 8 }}>
            {cats.map((c) => (
              <View key={c.key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt size={13} color="onSurfaceSecondary">
                  {c.label}
                </Txt>
                <Txt size={13} weight="displayMedium">
                  {fmtX(sub[c.key])}
                </Txt>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

function Timeline({ ipo }: { ipo: any }) {
  const steps = [
    { label: "Open", value: ipo.open_date_raw },
    { label: "Close", value: ipo.close_date_raw },
    { label: "Allotment", value: ipo.allotment_date },
    { label: "Refund", value: ipo.refund_date },
    { label: "Demat Credit", value: ipo.demat_credit_date },
    { label: "Listing", value: ipo.listing_date },
  ];
  const { colors } = useTheme();
  return (
    <View>
      <SectionHeader title="Timeline" />
      <Card>
        {steps.map((st, idx) => (
          <View key={st.label} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 14 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: st.value ? colors.brandPrimary : colors.border,
                }}
              />
              {idx < steps.length - 1 ? (
                <View style={{ width: 2, flex: 1, backgroundColor: colors.divider, minHeight: 20 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: idx < steps.length - 1 ? 14 : 0 }}>
              <Txt size={13} weight="semibold">
                {st.label}
              </Txt>
              <Txt size={12} color="muted">
                {st.value ?? "Not yet published"}
              </Txt>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

const CATEGORIES = [
  { key: "retail", label: "Retail" },
  { key: "snii", label: "sNII" },
  { key: "bnii", label: "bNII" },
];

function AllotmentCalculator({ ipo }: { ipo: any }) {
  const { colors } = useTheme();
  const s = useStyles();
  const mut = useAllotmentMutation(ipo.slug);
  const [category, setCategory] = useState("retail");
  const [lots, setLots] = useState("1");
  const [lotSize, setLotSize] = useState(ipo.lot_size ? String(ipo.lot_size) : "");
  const [subMult, setSubMult] = useState(
    ipo.subscription?.total != null ? String(ipo.subscription.total.toFixed(2)) : "",
  );
  const res = mut.data;

  const calc = () =>
    mut.mutate({
      category,
      lots: parseInt(lots || "1", 10),
      lot_size: lotSize ? parseFloat(lotSize) : undefined,
      subscription_multiple: subMult ? parseFloat(subMult) : undefined,
    });

  return (
    <View>
      <SectionHeader title="Allotment Probability" />
      <Card>
        <Txt size={12} color="muted" style={{ marginBottom: 12 }}>
          Estimated probability using the applicable category methodology. Enter details from the
          RHP where the provider does not supply them.
        </Txt>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              active={category === c.key}
              onPress={() => setCategory(c.key)}
              testID={`calc-cat-${c.key}`}
            />
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Lots" value={lots} onChange={setLots} testID="calc-lots" />
          <Field label="Lot Size" value={lotSize} onChange={setLotSize} testID="calc-lotsize" />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Field
            label="Subscription (x) for category"
            value={subMult}
            onChange={setSubMult}
            testID="calc-submult"
            wide
          />
        </View>

        <Pressable style={s.calcBtn} onPress={calc} testID="calc-run">
          <Txt size={14} weight="bold" color="onBrandPrimary">
            Estimate Allotment
          </Txt>
        </Pressable>

        {res ? (
          <View style={{ marginTop: 14, gap: 8 }} testID="calc-result">
            {res.reliable ? (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Txt size={13} color="muted">
                    Estimated allotment probability
                  </Txt>
                  <Txt size={18} weight="display" color="onSurface">
                    {res.probability_pct}%
                  </Txt>
                </View>
                <View style={s2row}>
                  <KeyValue label="Application" value={fmtRupee(res.application_amount)} />
                  <KeyValue label="Shares Applied" value={naOr(res.application_shares)} />
                  <KeyValue label="Expected Shares" value={naOr(res.expected_shares)} />
                </View>
                <Txt size={11} color="onSurfaceSecondary" style={{ marginTop: 4, lineHeight: 16 }}>
                  {res.note}
                </Txt>
              </>
            ) : (
              <Txt size={13} color="warning">
                {res.message}
              </Txt>
            )}
            <Txt size={10} color="muted" style={{ marginTop: 6 }}>
              {res.disclaimer}
            </Txt>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  testID,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
  wide?: boolean;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={{ flex: wide ? 1 : 1 }}>
      <Txt size={11} color="muted" style={{ marginBottom: 4 }}>
        {label}
      </Txt>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor={colors.muted}
        style={s.input}
      />
    </View>
  );
}

function AnalysisSnapshot({ ipo }: { ipo: any }) {
  const gmpPct = ipo.gmp?.gmp_percent;
  const subX = ipo.subscription?.total;
  const gmpSentiment =
    gmpPct == null ? "N/A" : gmpPct > 15 ? "Strong" : gmpPct > 0 ? "Positive" : "Negative";
  const subStrength =
    subX == null ? "N/A" : subX >= 10 ? "Strong" : subX >= 1 ? "Moderate" : "Weak";
  const rows = [
    { k: "GMP Sentiment", v: gmpSentiment },
    { k: "Subscription", v: subStrength },
    { k: "Valuation", v: "Not available" },
    { k: "Profitability", v: "Not available" },
    { k: "Business Quality", v: "Verify in RHP" },
  ];
  const tone = (v: string): any =>
    v === "Strong" || v === "Positive"
      ? "gain"
      : v === "Negative" || v === "Weak"
        ? "loss"
        : "muted";
  return (
    <View>
      <SectionHeader title="IPO Snapshot" />
      <Card>
        {rows.map((r, i) => (
          <View
            key={r.k}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 8,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: "transparent",
            }}
          >
            <Txt size={13} color="onSurfaceSecondary">
              {r.k}
            </Txt>
            <Txt size={13} weight="semibold" color={tone(r.v)}>
              {r.v}
            </Txt>
          </View>
        ))}
        <Txt size={11} color="muted" style={{ marginTop: 8 }}>
          Informational analysis, not personalized investment advice. Fundamental metrics require
          verified financials from the RHP/DRHP.
        </Txt>
      </Card>
    </View>
  );
}

function AiBusiness({ slug, enabled }: { slug: string; enabled: boolean }) {
  const [on, setOn] = useState(false);
  const { data, isLoading, isError } = useAiSummary(slug, on && enabled);
  const s = useStyles();
  return (
    <View>
      <SectionHeader title="AI Business Analysis" />
      <Card>
        {!on ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
            <Icon name="cpu" size={22} color="muted" />
            <Txt size={13} color="muted" style={{ textAlign: "center" }}>
              Generate a plain-English explanation of what this company does, how it makes money,
              and key risks — grounded in the facts we hold.
            </Txt>
            <Pressable style={s.calcBtn} onPress={() => setOn(true)} testID="ai-generate">
              <Txt size={14} weight="bold" color="onBrandPrimary">
                Generate AI Analysis
              </Txt>
            </Pressable>
          </View>
        ) : isLoading ? (
          <LoadingState label="Analysing…" />
        ) : isError || !data ? (
          <Txt size={13} color="warning">
            AI analysis is temporarily unavailable. Please try again later.
          </Txt>
        ) : (
          <View style={{ gap: 14 }} testID="ai-result">
            <AiSection title="What does the company do?" body={data.summary.what_it_does} />
            <AiSection title="How does it make money?" body={data.summary.how_it_makes_money} />
            <AiSection title="Where is the money going?" body={data.summary.where_money_goes} />
            <AiList title="Key strengths" items={data.summary.strengths} icon="plus-circle" tone="gain" />
            <AiList title="Key risks" items={data.summary.risks} icon="alert-circle" tone="loss" />
            <AiList
              title="Things to verify in the RHP"
              items={data.summary.things_to_verify}
              icon="check-square"
              tone="muted"
            />
            <View style={{ borderTopWidth: 1, borderTopColor: "transparent", paddingTop: 4 }}>
              <Txt size={10} color="muted">
                {data.model} · {data.generated_label}
              </Txt>
              <Txt size={10} color="muted" style={{ marginTop: 4 }}>
                {data.disclaimer}
              </Txt>
            </View>
          </View>
        )}
      </Card>
    </View>
  );
}

function AiSection({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <View>
      <Txt size={13} weight="bold" style={{ marginBottom: 4 }}>
        {title}
      </Txt>
      <Txt size={13} color="onSurfaceSecondary" style={{ lineHeight: 19 }}>
        {body}
      </Txt>
    </View>
  );
}

function AiList({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: string;
  tone: any;
}) {
  if (!items?.length) return null;
  return (
    <View>
      <Txt size={13} weight="bold" style={{ marginBottom: 6 }}>
        {title}
      </Txt>
      <View style={{ gap: 8 }}>
        {items.map((it, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ paddingTop: 2 }}>
              <Icon name={icon} size={13} color={tone} />
            </View>
            <Txt size={12} color="onSurfaceSecondary" style={{ flex: 1, lineHeight: 18 }}>
              {it}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

function CheckAllotment({ ipo }: { ipo: any }) {
  const s = useStyles();
  const links = [
    { label: "NSE — Public Issues", url: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo" },
    { label: "BSE — Public Issues", url: "https://www.bseindia.com/publicissue.html" },
  ];
  return (
    <View>
      <SectionHeader title="Check Allotment" />
      <Card>
        <Txt size={12} color="muted" style={{ marginBottom: 12 }}>
          Allotment status is checked on the official registrar's portal. Registrar details are not
          published by the current provider for this IPO — use the official exchange pages below.
        </Txt>
        {links.map((l) => (
          <Pressable
            key={l.url}
            style={s.linkRow}
            testID={`link-${l.label}`}
            onPress={() => WebBrowser.openBrowserAsync(l.url)}
          >
            <Icon name="external-link" size={16} color="onSurfaceSecondary" />
            <Txt size={13} weight="semibold" style={{ flex: 1 }}>
              {l.label}
            </Txt>
            <Icon name="chevron-right" size={16} color="muted" />
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const s2row = { flexDirection: "row" as const };

function Div() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 12 }} />;
}

const useStyles = makeStyles((colors) => ({
  calcBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 12,
    color: colors.onSurface,
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
}));
