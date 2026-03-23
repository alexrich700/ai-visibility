import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAdminQueryFn, getAdminToken } from "@/lib/queryClient";
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
import { Check, X, Eye, Building2, Globe, Search, MapPin, Calendar, User, Mail, Phone, FileText, ChevronLeft, ChevronRight, Filter } from "lucide-react";
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
  new: "bg-orange-100 text-orange-800 border-orange-200",
  contacted: "bg-green-100 text-green-800 border-green-200",
  not_reached: "bg-yellow-100 text-yellow-800 border-yellow-200",
  closed: "bg-gray-100 text-gray-800 border-gray-200",
};

export default function Admin() {
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterHasLead, setFilterHasLead] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const ITEMS_PER_PAGE = 10;

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900" data-testid="text-page-title">Audit Submissions</h2>
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
          <div className="w-8 h-8 border-4 border-[#ff5800] border-t-transparent rounded-full animate-spin mx-auto"></div>
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
                        className={currentPage === item ? "bg-[#ff5800] hover:bg-[#e04f00] text-white" : ""}
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

      <Dialog open={!!selectedAudit} onOpenChange={() => setSelectedAudit(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#ff5800]" />
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
                      className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold"
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
