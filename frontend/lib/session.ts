/** Single source of truth for the tenant session (access + refresh token,
 * cached user). Every place that reads, writes or clears the session goes
 * through here so token storage and the cookies the middleware checks can
 * never drift apart. The super-admin portal has its own separate session
 * (`admin_access_token`) and does not use this module. */

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const USER_KEY = "user";

// The middleware only checks that these cookies exist; the JWTs inside carry
// their own (shorter) expiry, which the API layer enforces via 401 → refresh.
const ACCESS_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const isBrowser = () => typeof window !== "undefined";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  status?: string;
  [k: string]: unknown;
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): SessionUser | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAge: number) {
  const secure = isBrowser() && window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

/** Persist a freshly issued token pair (and optionally the user record). */
export function setSession(
  accessToken: string,
  refreshToken: string,
  user?: SessionUser | null,
) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage disabled — cookies below still let the request through */
  }
  writeCookie(ACCESS_KEY, accessToken, ACCESS_MAX_AGE);
  writeCookie(REFRESH_KEY, refreshToken, REFRESH_MAX_AGE);
}

/** Wipe every trace of the session from this browser. */
export function clearSession() {
  if (!isBrowser()) return;
  try {
    [ACCESS_KEY, REFRESH_KEY, USER_KEY].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  document.cookie = `${ACCESS_KEY}=; path=/; max-age=0`;
  document.cookie = `${REFRESH_KEY}=; path=/; max-age=0`;
}

let ending = false;

/** End the session and get the user somewhere sensible.
 *  - "manual"  → they clicked Log out; land on the marketing home page.
 *  - "expired" → their token could not be refreshed; bounce to /login with a
 *    notice and remember where they were so they resume after signing in. */
export function endSession(reason: "manual" | "expired" = "expired") {
  clearSession();
  if (!isBrowser() || ending) return;
  ending = true;

  if (reason === "manual") {
    window.location.assign("/");
    return;
  }

  const path = window.location.pathname;
  const params = new URLSearchParams({ expired: "1" });
  if (path.startsWith("/dashboard")) {
    params.set("next", path + window.location.search);
  }
  window.location.assign(`/login?${params.toString()}`);
}
