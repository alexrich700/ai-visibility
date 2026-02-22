import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAdminQueryFn, setAdminToken, getAdminToken, clearAdminToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lock, Check, X, Eye, ArrowLeft, Building2, Globe, Search, MapPin, Calendar, User, Mail, Phone, FileText, LogOut, KeyRound, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

interface Audit {
  id: number;
  businessName: string;
  url: string | null;
  keyword: string;
  scope: string;
  city: string | null;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  fullResults: string | null;
  createdAt: string;
  lead?: Lead;
}

interface Lead {
  id: number;
  auditId: number | null;
  name: string;
  email: string;
  phone: string;
  businessName: string;
  auditScore: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse {
  data: Audit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const statusLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  not_reached: "Not Reached",
  closed: "Closed",
};

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  contacted: "bg-green-100 text-green-800 border-green-200",
  not_reached: "bg-yellow-100 text-yellow-800 border-yellow-200",
  closed: "bg-gray-100 text-gray-800 border-gray-200",
};

type AuthView = "login" | "forgot-password" | "reset-sent";

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterHasLead, setFilterHasLead] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/admin/login", { email, password });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.token) {
        setAdminToken(data.token);
      }
      setIsAuthenticated(true);
      setLoginError("");
    },
    onError: (error: Error) => {
      if (error.message.includes("429")) {
        setLoginError("Too many login attempts. Please try again later.");
      } else {
        setLoginError("Invalid email or password");
      }
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/admin/forgot-password", { email });
      return response.json();
    },
    onSuccess: () => {
      setAuthView("reset-sent");
      setLoginError("");
    },
    onError: () => {
      setLoginError("Failed to send reset email. Please try again.");
    },
  });

  const buildAuditsUrl = () => {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(ITEMS_PER_PAGE));
    if (searchQuery) params.set("search", searchQuery);
    if (filterHasLead !== "all") params.set("hasLead", filterHasLead);
    if (filterStatus !== "all") params.set("status", filterStatus);
    return `/api/admin/audits?${params.toString()}`;
  };

  const { data: paginatedData, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/admin/audits", currentPage, searchQuery, filterHasLead, filterStatus],
    queryFn: async () => {
      const token = getAdminToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(buildAuditsUrl(), { credentials: "include", headers });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const audits = paginatedData?.data ?? [];
  const totalPages = paginatedData?.totalPages ?? 1;
  const totalAudits = paginatedData?.total ?? 0;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/leads/${id}`, { status }, { useAdminAuth: true });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audits"] });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    loginMutation.mutate({ email, password });
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    forgotPasswordMutation.mutate(email);
  };

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/admin/logout", undefined, { useAdminAuth: true });
    } catch {
      // Always clear local auth state even if server logout fails.
    } finally {
      clearAdminToken();
      setIsAuthenticated(false);
      setEmail("");
      setPassword("");
    }
  };

  const handleStatusChange = (leadId: number, newStatus: string) => {
    updateStatusMutation.mutate({ id: leadId, status: newStatus });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-blue-100";
    if (score >= 40) return "bg-yellow-100";
    return "bg-red-100";
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 bg-white rounded-xl border border-gray-200 shadow-2xl shadow-blue-900/5">
          {authView === "login" && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-[#5599f9] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Portal</h1>
                <p className="text-gray-500 mt-2">Sign in to access the dashboard</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                    data-testid="input-admin-email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                    data-testid="input-admin-password"
                    required
                  />
                </div>
                {loginError && (
                  <p className="text-red-500 text-sm" data-testid="text-login-error">{loginError}</p>
                )}
                <Button 
                  type="submit" 
                  className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
                  disabled={loginMutation.isPending}
                  data-testid="button-admin-login"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setAuthView("forgot-password");
                  setLoginError("");
                }}
                className="w-full mt-4 text-sm text-[#5599f9] hover:text-[#4488e8] transition-colors"
                data-testid="link-forgot-password"
              >
                Forgot your password?
              </button>
            </>
          )}

          {authView === "forgot-password" && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-[#5599f9] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reset Password</h1>
                <p className="text-gray-500 mt-2">Enter your email to receive a reset link</p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                    data-testid="input-reset-email"
                    required
                  />
                </div>
                {loginError && (
                  <p className="text-red-500 text-sm">{loginError}</p>
                )}
                <Button 
                  type="submit" 
                  className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
                  disabled={forgotPasswordMutation.isPending}
                  data-testid="button-send-reset"
                >
                  {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setAuthView("login");
                  setLoginError("");
                }}
                className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
                data-testid="link-back-login"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            </>
          )}

          {authView === "reset-sent" && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Check Your Email</h1>
                <p className="text-gray-500 mt-2">
                  If an account exists for {email}, we've sent a password reset link.
                </p>
              </div>

              <Button 
                onClick={() => {
                  setAuthView("login");
                  setEmail("");
                }}
                className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
                data-testid="button-back-login"
              >
                Back to Sign In
              </Button>
            </>
          )}

          <a 
            href="/" 
            className="flex items-center justify-center gap-2 mt-6 text-gray-500 hover:text-gray-700 transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Audit Tool
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-[#5599f9] rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-700"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
            <a 
              href="/" 
              className="text-gray-500 hover:text-gray-700 transition-colors text-sm flex items-center gap-2"
              data-testid="link-exit-admin"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit Admin
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Audit Submissions</h2>
          <p className="text-gray-500 text-sm">Track visibility audits and manage leads</p>
        </div>

        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(searchInput);
              setCurrentPage(1);
            }}
            className="flex-1 flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search business, keyword, location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 bg-white border-gray-200"
                data-testid="input-audit-search"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="px-4" data-testid="button-audit-search">
              Search
            </Button>
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </form>

          <div className="flex gap-2">
            <Select
              value={filterHasLead}
              onValueChange={(value) => {
                setFilterHasLead(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-36 bg-white border-gray-200" data-testid="select-filter-lead">
                <Filter className="w-4 h-4 mr-1 text-gray-400" />
                <SelectValue placeholder="Lead status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Leads</SelectItem>
                <SelectItem value="true">Has Lead</SelectItem>
                <SelectItem value="false">No Lead</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filterStatus}
              onValueChange={(value) => {
                setFilterStatus(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-36 bg-white border-gray-200" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="not_reached">Not Reached</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-[#5599f9] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading audits...</p>
          </div>
        ) : audits.length === 0 ? (
          <Card className="p-12 text-center bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">
              {searchQuery || filterHasLead !== "all" || filterStatus !== "all"
                ? "No audits match your search or filters."
                : "No audits have been submitted yet."}
            </p>
            {(searchQuery || filterHasLead !== "all" || filterStatus !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                  setFilterHasLead("all");
                  setFilterStatus("all");
                  setCurrentPage(1);
                }}
                data-testid="button-clear-all-filters"
              >
                Clear all filters
              </Button>
            )}
          </Card>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Business</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Keyword</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Location</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Score</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Lead Info</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {audits.map((audit) => (
                    <tr key={audit.id} className="hover:bg-gray-50 transition-colors" data-testid={`row-audit-${audit.id}`}>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {format(new Date(audit.createdAt), "MMM d, yyyy")}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {format(new Date(audit.createdAt), "h:mm a")}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{audit.businessName}</div>
                        {audit.url && (
                          <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                            <Globe className="w-3 h-3" />
                            {audit.url}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Search className="w-4 h-4 text-gray-400" />
                          {audit.keyword}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {audit.scope === "local" && audit.city ? (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            {audit.city}
                          </div>
                        ) : (
                          <span className="text-gray-400">National</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg font-bold text-lg ${getScoreBgColor(audit.overallScore)} ${getScoreColor(audit.overallScore)}`}>
                          {audit.overallScore}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {audit.lead ? (
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                              <Check className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{audit.lead.name}</div>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                            <X className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {audit.lead ? (
                          <Select
                            value={audit.lead.status}
                            onValueChange={(value) => handleStatusChange(audit.lead!.id, value)}
                            disabled={updateStatusMutation.isPending}
                          >
                            <SelectTrigger 
                              className={`w-32 h-8 text-xs font-medium border ${statusColors[audit.lead.status]}`}
                              data-testid={`select-status-${audit.id}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="not_reached">Not Reached</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-gray-400 text-sm">No lead</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedAudit(audit)}
                          data-testid={`button-view-${audit.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-500" data-testid="text-pagination-info">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalAudits)} of {totalAudits} audits
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      if (totalPages <= 7) return true;
                      if (p === 1 || p === totalPages) return true;
                      if (Math.abs(p - currentPage) <= 1) return true;
                      return false;
                    })
                    .reduce<(number | string)[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                        acc.push("...");
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-sm">...</span>
                      ) : (
                        <Button
                          key={item}
                          variant={currentPage === item ? "default" : "outline"}
                          size="sm"
                          className={currentPage === item ? "bg-[#5599f9] hover:bg-[#4488e8] text-white" : ""}
                          onClick={() => setCurrentPage(item as number)}
                          data-testid={`button-page-${item}`}
                        >
                          {item}
                        </Button>
                      )
                    )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {totalPages <= 1 && totalAudits > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-500" data-testid="text-pagination-info">
                  Showing {totalAudits} audit{totalAudits !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={!!selectedAudit} onOpenChange={() => setSelectedAudit(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#5599f9]" />
              Audit Details
            </DialogTitle>
          </DialogHeader>

          {selectedAudit && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Business</label>
                  <p className="text-gray-900 font-medium">{selectedAudit.businessName}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Website</label>
                  <p className="text-gray-900">{selectedAudit.url || "N/A"}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Keyword</label>
                  <p className="text-gray-900">{selectedAudit.keyword}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Location</label>
                  <p className="text-gray-900">
                    {selectedAudit.scope === "local" ? selectedAudit.city : "National"}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 block">Scores</label>
                <div className="grid grid-cols-3 gap-4">
                  <div className={`p-4 rounded-lg ${getScoreBgColor(selectedAudit.overallScore)} text-center`}>
                    <div className={`text-2xl font-bold ${getScoreColor(selectedAudit.overallScore)}`}>
                      {selectedAudit.overallScore}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Overall</div>
                  </div>
                  <div className={`p-4 rounded-lg ${getScoreBgColor(selectedAudit.chatgptScore)} text-center`}>
                    <div className={`text-2xl font-bold ${getScoreColor(selectedAudit.chatgptScore)}`}>
                      {selectedAudit.chatgptScore}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">ChatGPT</div>
                  </div>
                  <div className={`p-4 rounded-lg ${getScoreBgColor(selectedAudit.googleAIScore)} text-center`}>
                    <div className={`text-2xl font-bold ${getScoreColor(selectedAudit.googleAIScore)}`}>
                      {selectedAudit.googleAIScore}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Google AI</div>
                  </div>
                </div>
              </div>

              {selectedAudit.lead && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 block">Lead Information</label>
                  <div className="bg-green-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-green-600" />
                      <span className="text-gray-900">{selectedAudit.lead.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-green-600" />
                      <a href={`mailto:${selectedAudit.lead.email}`} className="text-blue-600 hover:underline">
                        {selectedAudit.lead.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-green-600" />
                      <a href={`tel:${selectedAudit.lead.phone}`} className="text-blue-600 hover:underline">
                        {selectedAudit.lead.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={`${statusColors[selectedAudit.lead.status]} border`}>
                        {statusLabels[selectedAudit.lead.status]}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 block">Submitted</label>
                <p className="text-gray-600">
                  {format(new Date(selectedAudit.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>

              {selectedAudit.fullResults && (
                <div className="border-t border-gray-200 pt-4">
                  <Link href={`/admin/audit/${selectedAudit.id}`}>
                    <Button 
                      className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold"
                      data-testid="button-view-full-audit"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Full Audit Report
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
