// Design tokens for Indian IPO Terminal. Light + Dark, values from
// /app/design_guidelines.json. Numbers use Space Grotesk, text uses Plus
// Jakarta Sans (loaded in app/_layout.tsx).
//
// Colors always come from here via makeStyles((colors) => ...) for styles and
// useTheme().colors for color props. Never hardcode color literals in screens.

import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

import { storage } from "@/src/utils/storage";

export type ColorScheme = "light" | "dark";
export type ThemeMode = "light" | "dark" | "system";

const light = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F4F4F5",
  onSurfaceSecondary: "#27272A",
  surfaceTertiary: "#E4E4E7",
  onSurfaceTertiary: "#3F3F46",
  surfaceInverse: "#18181B",
  onSurfaceInverse: "#FFFFFF",
  brand: "#18181B",
  onBrand: "#FFFFFF",
  brandPrimary: "#18181B",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#52525B",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E4E4E7",
  onBrandTertiary: "#18181B",
  muted: "#71717A",
  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#CA8A04",
  onWarning: "#FFFFFF",
  error: "#DC2626",
  onError: "#FFFFFF",
  info: "#4B5563",
  onInfo: "#FFFFFF",
  border: "#E4E4E7",
  borderStrong: "#D4D4D8",
  divider: "#F4F4F5",
  gain: "#16A34A",
  loss: "#DC2626",
  statusUpcoming: "#CA8A04",
  statusOpen: "#16A34A",
  statusClosed: "#71717A",
  statusListed: "#18181B",
};

const dark: typeof light = {
  surface: "#09090B",
  onSurface: "#FAFAFA",
  surfaceSecondary: "#18181B",
  onSurfaceSecondary: "#E4E4E7",
  surfaceTertiary: "#27272A",
  onSurfaceTertiary: "#D4D4D8",
  surfaceInverse: "#FAFAFA",
  onSurfaceInverse: "#09090B",
  brand: "#FAFAFA",
  onBrand: "#09090B",
  brandPrimary: "#FAFAFA",
  onBrandPrimary: "#09090B",
  brandSecondary: "#A1A1AA",
  onBrandSecondary: "#09090B",
  brandTertiary: "#3F3F46",
  onBrandTertiary: "#FAFAFA",
  muted: "#A1A1AA",
  success: "#22C55E",
  onSuccess: "#000000",
  warning: "#FACC15",
  onWarning: "#000000",
  error: "#EF4444",
  onError: "#000000",
  info: "#9CA3AF",
  onInfo: "#000000",
  border: "#27272A",
  borderStrong: "#3F3F46",
  divider: "#18181B",
  gain: "#22C55E",
  loss: "#EF4444",
  statusUpcoming: "#FACC15",
  statusOpen: "#22C55E",
  statusClosed: "#A1A1AA",
  statusListed: "#FAFAFA",
};

export type ThemeColors = typeof light;

export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

export const fonts = {
  display: "SpaceGrotesk-Bold",
  displayMedium: "SpaceGrotesk-Medium",
  regular: "PlusJakartaSans-Regular",
  medium: "PlusJakartaSans-Medium",
  semibold: "PlusJakartaSans-SemiBold",
  bold: "PlusJakartaSans-Bold",
};

// --------------------------------------------------------------------------- //
// Manual override store (works on web + native). null => follow system.
// --------------------------------------------------------------------------- //
const STORAGE_KEY = "theme_mode";
let override: ColorScheme | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ColorScheme | null {
  return override;
}

export function setThemeMode(mode: ThemeMode) {
  override = mode === "system" ? null : mode;
  storage.setItem(STORAGE_KEY, mode);
  try {
    Appearance.setColorScheme?.(override);
  } catch {
    // web may not implement; the override store still drives useTheme.
  }
  emit();
}

export async function initThemeMode() {
  const mode = (await storage.getItem<ThemeMode>(STORAGE_KEY, "system")) ?? "system";
  override = mode === "system" ? null : (mode as ColorScheme);
  try {
    Appearance.setColorScheme?.(override);
  } catch {
    /* noop */
  }
  emit();
}

export function useThemeMode(): ThemeMode {
  const o = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return o == null ? "system" : o;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const o = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const scheme: ColorScheme = o ?? (system === "dark" ? "dark" : "light");
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
