import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminToken, getSessionAwareQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  FileSearch, Download, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Search, ExternalLink, Globe, FileText, TrendingUp, ChevronLeft, ChevronRight
} from "lucide-react";

interface SitemapCategory {
  name: string;
  count: number;
}

interface SearchTermMatch {
  searchTerm: string;
  matchedUrl: string | null;
  matchedPageTitle: string | null;
  matchScore: number;
  category: string;
  promptText: string;
  status: "covered" | "opportunity";
}

interface ContentGapResult {
  clientId: number;
  domain: string;
  sitemapSummary: {
    totalUrls: number;
    categories: SitemapCategory[];
    errors: string[];
  };
  searchTermsCount: number;
  uniqueSearchTermsCount: number;
  coveredCount: number;
  opportunityCount: number;
  coveragePercent: number;
  matches: SearchTermMatch[];
  opportunities: SearchTermMatch[];
  coveredTerms: SearchTermMatch[];
}

interface ContentGapAnalysisProps {
  clientId: number;
  businessName: string;
}

export function ContentGapAnalysis({ clientId, businessName }: ContentGapAnalysisProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const { data: analysis, isLoading, error, refetch } = useQuery<ContentGapResult>({
    queryKey: ["/api/monitoring/content-gaps", clientId],
    queryFn: getSessionAwareQueryFn({ on401: "throw" }),
    enabled: analysisTriggered,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleRunAnalysis = () => {
    setAnalysisTriggered(true);
    if (analysisTriggered) {
      refetch();
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(`/api/monitoring/content-gaps/${clientId}/export`, { headers });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Export failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `content-gap-analysis-${businessName.replace(/[^a-zA-Z0-9]/g, "-")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      toast({
        title: "Export Complete",
        description: "Content gap analysis has been downloaded as Excel",
      });
    } catch (err) {
      console.error("Export error:", err);
      toast({
        title: "Export Failed",
        description: err instanceof Error ? err.message : "Export failed",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const filteredMatches = analysis?.matches.filter((m) => {
    const matchesSearch = !searchFilter.trim() ||
      m.searchTerm.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (m.matchedUrl && m.matchedUrl.toLowerCase().includes(searchFilter.toLowerCase()));
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "opportunity" && m.status === "opportunity") ||
      (statusFilter === "covered" && m.status === "covered");
    return matchesSearch && matchesStatus;
  }) || [];

  const totalPages = Math.ceil(filteredMatches.length / ITEMS_PER_PAGE);
  const paginatedMatches = filteredMatches.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (!analysisTriggered) {
    return (
      <Card className="shadow-2xl shadow-blue-900/5">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-16 h-16 bg-gradient-to-br from-[#5599f9]/10 to-[#ffb41c]/10 rounded-2xl flex items-center justify-center mb-6">
            <FileSearch className="w-8 h-8 text-[#5599f9]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2" data-testid="text-content-gap-title">
            Content Gap Analysis
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-md mb-6">
            Analyze your website's sitemap against Gemini's search queries to find pages you should create
            to improve AI visibility. This compares what Gemini searches for with pages that already exist on your site.
          </p>
          <Button
            onClick={handleRunAnalysis}
            className="flex items-center gap-2 bg-[#5599f9] hover:bg-[#4488e8]"
            data-testid="button-run-content-gap"
          >
            <FileSearch className="w-4 h-4" />
            Run Content Gap Analysis
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="shadow-2xl shadow-blue-900/5">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <Loader2 className="w-10 h-10 text-[#5599f9] animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-700 mb-1">Analyzing content gaps...</p>
          <p className="text-xs text-gray-500">Fetching sitemap and comparing with Gemini search terms</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-2xl shadow-blue-900/5">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6">
          <AlertTriangle className="w-10 h-10 text-amber-500 mb-4" />
          <p className="text-sm font-medium text-gray-700 mb-2">Analysis failed</p>
          <p className="text-xs text-gray-500 mb-4">
            {error instanceof Error ? error.message : "Could not complete content gap analysis"}
          </p>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-content-gap">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-6">
      <Card className="shadow-2xl shadow-blue-900/5">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-[#5599f9]" />
                Content Gap Analysis
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Sitemap vs. Gemini search queries for {analysis.domain}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="flex items-center gap-2"
                data-testid="button-refresh-content-gap"
              >
                <FileSearch className="w-4 h-4" />
                Re-analyze
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2"
                data-testid="button-export-content-gap"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? "Exporting..." : "Export Excel"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">Sitemap Pages</span>
              </div>
              <p className="text-2xl font-bold text-gray-900" data-testid="text-sitemap-pages">
                {analysis.sitemapSummary.totalUrls.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">Search Terms</span>
              </div>
              <p className="text-2xl font-bold text-gray-900" data-testid="text-search-terms">
                {analysis.uniqueSearchTermsCount}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-600 font-medium">Covered</span>
              </div>
              <p className="text-2xl font-bold text-green-700" data-testid="text-covered-count">
                {analysis.coveredCount}
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-amber-600 font-medium">Opportunities</span>
              </div>
              <p className="text-2xl font-bold text-amber-700" data-testid="text-opportunity-count">
                {analysis.opportunityCount}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Content Coverage</span>
              <span className="text-sm font-bold text-gray-900">{analysis.coveragePercent}%</span>
            </div>
            <Progress value={analysis.coveragePercent} className="h-2" />
            <p className="text-xs text-gray-500 mt-1">
              {analysis.coveredCount} of {analysis.uniqueSearchTermsCount} Gemini search terms have a matching page on your site
            </p>
          </div>

          {analysis.sitemapSummary.categories.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Sitemap Categories</p>
              <div className="flex flex-wrap gap-2">
                {analysis.sitemapSummary.categories.map((cat) => (
                  <Badge key={cat.name} variant="outline" className="text-xs py-1">
                    <FileText className="w-3 h-3 mr-1" />
                    {cat.name} ({cat.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {analysis.sitemapSummary.errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700">Sitemap Notes</span>
              </div>
              {analysis.sitemapSummary.errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-600">{err}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-2xl shadow-blue-900/5">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-bold tracking-tight">
              Search Term Mapping
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search terms or URLs..."
                  value={searchFilter}
                  onChange={(e) => { setSearchFilter(e.target.value); setCurrentPage(1); }}
                  className="pl-9 w-56 h-9 text-sm"
                  data-testid="input-content-gap-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-content-gap-status">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Terms</SelectItem>
                  <SelectItem value="opportunity">Opportunities Only</SelectItem>
                  <SelectItem value="covered">Covered Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-[3rem_1fr_1fr_100px] items-center gap-2 px-6 py-2.5 border-b border-gray-200 bg-gray-50/80 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span className="text-center">#</span>
            <span>Search Term</span>
            <span className="hidden md:block">Matched Page</span>
            <span className="text-center">Status</span>
          </div>

          {paginatedMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Search className="w-8 h-8 mb-2" />
              <p className="text-sm">No matching terms found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {paginatedMatches.map((match, idx) => (
                <div
                  key={`${match.searchTerm}-${idx}`}
                  className={`grid grid-cols-[3rem_1fr_1fr_100px] items-center gap-2 px-6 py-3 hover:bg-gray-50/50 transition-colors ${
                    match.status === "opportunity" ? "bg-amber-50/30" : ""
                  }`}
                  data-testid={`row-content-gap-${idx}`}
                >
                  <span className="text-center text-xs text-gray-400">
                    {(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate" title={match.searchTerm}>
                      {match.searchTerm}
                    </p>
                    <p className="text-xs text-gray-400 truncate" title={match.promptText}>
                      From: {match.promptText}
                    </p>
                  </div>
                  <div className="hidden md:block min-w-0">
                    {match.matchedUrl ? (
                      <div>
                        <a
                          href={match.matchedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#5599f9] hover:underline truncate flex items-center gap-1"
                          title={match.matchedUrl}
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{match.matchedPageTitle || match.matchedUrl}</span>
                        </a>
                        <p className="text-xs text-gray-400">
                          Match: {match.matchScore}% | {match.category}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 italic">No matching page found</span>
                    )}
                  </div>
                  <div className="text-center">
                    {match.status === "covered" ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Covered
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                        <XCircle className="w-3 h-3 mr-1" />
                        Gap
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50/50">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredMatches.length)} of {filteredMatches.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  data-testid="button-content-gap-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "default" : "ghost"}
                      size="sm"
                      className="text-xs"
                      onClick={() => setCurrentPage(pageNum)}
                      data-testid={`button-content-gap-page-${pageNum}`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  data-testid="button-content-gap-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
