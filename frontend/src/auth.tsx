import * as Linking from "expo-linking";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { API_URL, apiFetch, clearToken, loadToken, setToken } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processed = useRef<Set<string>>(new Set());

  const exchange = useCallback(async (sessionId: string) => {
    if (processed.current.has(sessionId)) return;
    processed.current.add(sessionId);
    const data = await apiFetch<{ session_token: string; user: User }>(
      "/auth/session",
      { method: "POST", body: { session_id: sessionId } },
    );
    await setToken(data.session_token);
    setUser(data.user);
  }, []);

  const checkExisting = useCallback(async () => {
    const t = await loadToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const me = await apiFetch<{ user: User }>("/auth/me", { auth: true });
      setUser(me.user);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  // Mount: process any incoming session_id first, else check existing token.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (Platform.OS === "web") {
          const url = typeof window !== "undefined" ? window.location.href : "";
          const sid = extractSessionId(url);
          if (sid) {
            await exchange(sid);
            // clean only after success
            if (typeof window !== "undefined") {
              const clean = window.location.href
                .replace(/[?#&]session_id=[^&#]+/, "")
                .replace(/#$/, "");
              window.history.replaceState(window.history.state, "", clean);
            }
          } else {
            await checkExisting();
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            await exchange(sid);
          } else {
            await checkExisting();
          }
        }
      } catch (e) {
        console.warn("[auth] init error", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) exchange(sid).catch((e) => console.warn("[auth] hot link", e));
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [exchange, checkExisting]);

  const signIn = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? window.location.origin + "/"
        : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
      redirectUrl,
    )}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }

    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = null;
      if (result.type === "success" && result.url) url = result.url;
      if (!url && captured) url = captured;
      if (!url) url = await Linking.getInitialURL();
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } finally {
      sub.remove();
    }
  }, [exchange]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST", auth: true });
    } catch {
      /* noop */
    }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { API_URL };
