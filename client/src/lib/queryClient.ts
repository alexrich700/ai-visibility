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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
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

// Cache policy tiers are grouped by data volatility to avoid one-size-fits-all defaults.
// This keeps business metrics fresh while still caching stable data efficiently.
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

function applyDataClassQueryPolicies(client: QueryClient) {
  for (const key of QUERY_POLICY_BY_KEY_PREFIX.nearRealTime) {
    client.setQueryDefaults(key, QUERY_CACHE_TIERS.nearRealTime);
  }

  for (const key of QUERY_POLICY_BY_KEY_PREFIX.semiStatic) {
    client.setQueryDefaults(key, QUERY_CACHE_TIERS.semiStatic);
  }

  for (const key of QUERY_POLICY_BY_KEY_PREFIX.reference) {
    client.setQueryDefaults(key, QUERY_CACHE_TIERS.reference);
  }
}

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

applyDataClassQueryPolicies(queryClient);
