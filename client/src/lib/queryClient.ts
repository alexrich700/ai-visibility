import { QueryClient, QueryFunction } from "@tanstack/react-query";

const ADMIN_TOKEN_KEY = "adminToken";

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { useAdminAuth?: boolean }
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (options?.useAdminAuth) {
    const token = getAdminToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

const QUERY_CACHE_TIERS = {
  nearRealTime: {
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  },
  semiStatic: {
    staleTime: 10 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  },
  reference: {
    staleTime: 30 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  },
} as const;

// Query key prefixes mapped to cache tiers.
// IMPORTANT: add new /api query keys here so they do not silently fall back to the baseline policy.
const QUERY_POLICY_BY_KEY_PREFIX = {
  nearRealTime: [
    ["/api/monitoring/dashboard"],
    ["/api/monitoring/clients-with-stats"],
  ],
  semiStatic: [
    ["/api/monitoring/trends/groups"],
    ["/api/monitoring/trends/competitors"],
    ["/api/monitoring/scan-dates"],
    ["/api/admin/audits"],
    ["/api/audit"],
    ["/api/audit/share"],
  ],
  reference: [["/api/monitoring/settings"]],
} as const;

const REGISTERED_QUERY_PREFIXES: Set<string> = new Set(
  Object.values(QUERY_POLICY_BY_KEY_PREFIX)
    .flat()
    .map(([prefix]) => prefix)
);

const warnedUnmappedQueryPrefixes = new Set<string>();

export function hasDataClassPolicy(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === "string" && REGISTERED_QUERY_PREFIXES.has(queryKey[0]);
}

function maybeWarnUnmappedPolicy(queryKey: readonly unknown[]) {
  const prefix = queryKey[0];
  if (!import.meta.env.DEV || typeof prefix !== "string") {
    return;
  }

  if (!prefix.startsWith("/api/") || hasDataClassPolicy(queryKey) || warnedUnmappedQueryPrefixes.has(prefix)) {
    return;
  }

  warnedUnmappedQueryPrefixes.add(prefix);
  console.warn(
    `[React Query] Unmapped query key '${prefix}' is using baseline defaults. Consider adding it to QUERY_POLICY_BY_KEY_PREFIX.`
  );
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    maybeWarnUnmappedPolicy(queryKey);

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const getAdminQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    maybeWarnUnmappedPolicy(queryKey);

    const token = getAdminToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const getSessionAwareQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    maybeWarnUnmappedPolicy(queryKey);

    const headers: Record<string, string> = {};
    const token = getAdminToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 60 * 1000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

function applyDataClassQueryPolicies(qc: QueryClient) {
  for (const [tierName, keys] of Object.entries(QUERY_POLICY_BY_KEY_PREFIX)) {
    const tier = QUERY_CACHE_TIERS[tierName as keyof typeof QUERY_CACHE_TIERS];
    for (const key of keys) {
      qc.setQueryDefaults(key as unknown as readonly unknown[], tier);
    }
  }
}

applyDataClassQueryPolicies(queryClient);
