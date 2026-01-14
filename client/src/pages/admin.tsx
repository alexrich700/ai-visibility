import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAdminQueryFn, setAdminToken, getAdminToken, clearAdminToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { Lock, Check, X, Eye, ArrowLeft, Building2, Globe, Search, MapPin, Calendar, User, Mail, Phone, FileText, LogOut } from "lucide-react";
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

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (pwd: string) => {
      const response = await apiRequest("POST", "/api/admin/login", { password: pwd });
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
        setLoginError("Invalid password");
      }
    },
  });

  const { data: audits = [], isLoading } = useQuery<Audit[]>({
    queryKey: ["/api/admin/audits"],
    queryFn: getAdminQueryFn({ on401: "throw" }),
    enabled: isAuthenticated,
  });

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
    loginMutation.mutate(password);
  };

  const handleLogout = () => {
    clearAdminToken();
    setIsAuthenticated(false);
    setPassword("");
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
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#5599f9] rounded-xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Portal</h1>
            <p className="text-gray-500 mt-2">Enter your password to access the dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                data-testid="input-admin-password"
              />
              {loginError && (
                <p className="text-red-500 text-sm mt-2" data-testid="text-login-error">{loginError}</p>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
              disabled={loginMutation.isPending}
              data-testid="button-admin-login"
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>

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

        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-[#5599f9] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading audits...</p>
          </div>
        ) : audits.length === 0 ? (
          <Card className="p-12 text-center bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">No audits have been submitted yet.</p>
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
