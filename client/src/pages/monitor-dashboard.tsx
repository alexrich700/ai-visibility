import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAdminToken, getSessionAwareQueryFn } from "@/lib/queryClient";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, TrendingDown, Eye, Target, Calendar, Clock, Settings,
  ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle, Minus, Building2,
  Users, Link2, Award, ThumbsUp, ThumbsDown, Meh, ExternalLink, Download, HelpCircle, AlertTriangle,
  Share2, Copy, Check, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Filter
} from "lucide-react";
import {
  Tooltip as InfoTooltip,
  TooltipContent as InfoTooltipContent,
  TooltipTrigger as InfoTooltipTrigger,
  TooltipProvider as InfoTooltipProvider,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import logoIcon from "@assets/images_1765741951084.png";
import type { MonitoringClient, MonitoringGroup, CheckSession, CheckResult } from "@shared/schema";
import {
  buildCompetitorTrendChartData,
  buildGroupBarData,
  buildGroupTrendChartData,
  buildSessionChartData,
  computeAverageRank,
  computeCompetitorVisibility,
  computeFirstPlaceCount,
  computeShareOfVoice,
  computeTopCitations,
  computeVisibilityMetrics,
  filterResultsByGroup,
  selectAggregatedScores,
  selectBrandSentimentGroupIds,
  selectCityScopedDashboardData,
  type Citation,
  type CompetitorTrendData,
  type CompetitorVisibility,
  type GroupResults,
  type GroupTrendData,
  type ShareOfVoiceItem,
} from "@/features/monitor-dashboard/selectors";

interface SentimentStatement {
  text: string;
  platform: 'chatgpt' | 'google';
  promptText?: string;
}

interface SentimentStatements {
  positive: SentimentStatement[];
  negative: SentimentStatement[];
}

interface SentimentNarrative {
  text: string;
  strength: number; // 1-5 scale
}

interface SentimentNarratives {
  strengths: SentimentNarrative[];
  improvements: SentimentNarrative[];
}

interface Analytics {
  shareOfVoice: ShareOfVoiceItem[];
  avgChatgptRank: number | null;
  avgGoogleAIRank: number | null;
  firstPlaceCount: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topCitations: Citation[];
  sentimentScore: number | null;
  competitorVisibility: CompetitorVisibility[];
  sentimentStatements: SentimentStatements;
  sentimentNarratives?: SentimentNarratives;
}

interface TrendDataPoint {
  date: string;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  foundCount: number;
  citedCount: number;
  shareOfVoice: ShareOfVoiceItem[] | null;
  avgRank: number | null;
  sentiment: { positive: number; neutral: number; negative: number } | null;
}

interface DashboardData {
  client: MonitoringClient;
  groups: MonitoringGroup[];
  sessions: CheckSession[];
  latestResults: CheckResult[];
  resultsByGroup: GroupResults[];
  analytics: Analytics | null;
  trendData: TrendDataPoint[];
}

interface GroupTrendItem {
  groupId: number;
  groupName: string;
  data: { date: string | null; visibilityScore: number; foundCount: number; totalPrompts: number }[];
}

interface GroupTrendsResponse {
  groupTrends: GroupTrendItem[];
}

interface CompetitorTrendItem {
  competitorName: string;
  data: { date: string | null; visibilityPercent: number; mentionCount: number }[];
}

interface CompetitorTrendsResponse {
  competitorTrends: CompetitorTrendItem[];
}

const COLORS = {
  primary: "#5599f9",
  accent: "#ffb41c",
  success: "#22c55e",
  danger: "#ef4444",
  gray: "#9ca3af",
};

// Tooltip descriptions for each metric
const METRIC_TOOLTIPS = {
  avgRank: "The average position where your business appears when mentioned by AI. Lower numbers are better - being ranked #1 means you're the first recommendation.",
  visibilityRate: "Percentage of AI queries where your business was mentioned. Calculated as (mentions found ÷ total prompts checked) × 100.",
  citationRate: "Percentage of AI responses that directly cited your website URL as a source. This is stronger than just being mentioned.",
  nextCheck: "When the next automated visibility scan is scheduled. Scans run at the frequency you've configured in settings.",
  platformVisibility: "Breakdown of how visible your business is on each AI platform. Shows the percentage of prompts where you were found on ChatGPT vs Google AI.",
  visibilityTrend: "Historical view of your visibility scores over time. Track how your AI presence improves or changes with each scan.",
  trendOverall: "Overall visibility percentage combining both ChatGPT and Google AI results. Dashed lines show per-platform performance.",
  trendGroups: "Visibility scores broken down by service category. See which services have better AI visibility than others.",
  trendCompetitors: "Track how often your competitors are mentioned over time. Helps identify competitive threats and opportunities.",
  shareOfVoice: "Your brand's percentage of total mentions compared to competitors. Calculated by dividing your mentions by total market mentions.",
  topCitations: "Websites most frequently cited by AI when answering queries about your services. These are the authoritative sources AI trusts.",
  prominence: "How prominently your business is featured when mentioned. Average position tracks where you appear in lists, and first choice counts #1 rankings.",
  competitorVisibility: "Top competitors ranked by how often they appear in AI responses. Visibility percentage shows their mention rate across all prompts.",
  sentimentDrivers: "AI-synthesized insights about what drives perception of your brand. Strengths show positive factors, improvements show areas to address.",
};

// Helper component for metric tooltips
function MetricInfo({ tooltip, id }: { tooltip: string; id: string }) {
  return (
    <InfoTooltipProvider>
      <InfoTooltip>
        <InfoTooltipTrigger asChild>
          <button className="ml-1 text-gray-400 hover:text-gray-600 transition-colors" data-testid={`tooltip-trigger-${id}`}>
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </InfoTooltipTrigger>
        <InfoTooltipContent className="max-w-xs text-sm" side="top">
          {tooltip}
        </InfoTooltipContent>
      </InfoTooltip>
    </InfoTooltipProvider>
  );
}


export default function MonitorDashboardPage() {
  const { isAuthenticated: isAdminAuth, isLoading: isAdminLoading } = useAuth();

  const { data: clientSession, isLoading: isClientSessionLoading } = useQuery<{ authenticated: boolean; isAdmin: boolean }>({
    queryKey: ["/api/monitoring/client-session"],
    queryFn: getSessionAwareQueryFn({ on401: "returnNull" }),
    staleTime: 30 * 1000,
  });

  const isCheckingAuth = isAdminLoading || isClientSessionLoading;
  const hasClientSession = clientSession?.authenticated === true;
  const hasAccess = isAdminAuth || hasClientSession;

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <RedirectToLogin />;
  }

  if (isAdminAuth) {
    return (
      <AdminLayout>
        <MonitorDashboardContent isAdminUser={true} />
      </AdminLayout>
    );
  }

  return <MonitorDashboardContent isAdminUser={false} />;
}

function RedirectToLogin() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const returnTo = encodeURIComponent(location);
    navigate(`/admin/login?redirect=${returnTo}`);
  }, [location, navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function MonitorDashboardContent({ isAdminUser }: { isAdminUser: boolean }) {
  const [, params] = useRoute("/monitor/dashboard/:id");
  const [, setLocation] = useLocation();
  const clientId = params?.id ? parseInt(params.id) : null;
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("30");
  const [trendView, setTrendView] = useState<"overall" | "groups" | "competitors">("overall");
  const [selectedViewCity, setSelectedViewCity] = useState<string>("all");
  const [selectedResult, setSelectedResult] = useState<CheckResult | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedExportDate, setSelectedExportDate] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [promptSearch, setPromptSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [scanSubStatus, setScanSubStatus] = useState("");
  const [selectedScanCity, setSelectedScanCity] = useState<string>("all");
  const [currentScanCityIndex, setCurrentScanCityIndex] = useState(0);
  const [totalScanCities, setTotalScanCities] = useState(0);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [totalScanJobs, setTotalScanJobs] = useState(0);
  const [completedScanJobs, setCompletedScanJobs] = useState(0);
  const totalScanJobsRef = useRef(0);
  const completedScanJobsRef = useRef(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = isAdminUser;
  
  // AbortController for in-flight poll requests
  const pollAbortRef = useRef<AbortController | null>(null);

  // Pause polling when tab is hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Tab is hidden — pause polling to avoid stale/queued requests
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        // Abort any in-flight poll request
        pollAbortRef.current?.abort();
      } else if (isMountedRef.current && activeJobId) {
        // Tab became visible again — restart polling for the active job
        startJobPolling(activeJobId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [activeJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup polling on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollAbortRef.current?.abort();
    };
  }, []);

  // Check for active background job on mount and restore scan state
  useEffect(() => {
    if (!clientId || !isAdmin) return;
    
    const checkActiveJob = async () => {
      try {
        const token = getAdminToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        
        const response = await fetch(`/api/monitoring/scan-job-active/${clientId}`, { headers });
        if (response.ok) {
          const data = await response.json();
          if (data.hasActiveJob && data.job) {
            // Restore scan state from active job
            setActiveJobId(data.job.id);
            setIsScanning(true);
            setScanProgress(data.job.progress);
            setScanStatus(data.job.progressMessage || 'Scan in progress...');
            if (data.job.targetCity) {
              setScanSubStatus(`Scanning: ${data.job.targetCity}`);
            }
            // Start polling for updates
            startJobPolling(data.job.id);
          }
        }
      } catch (error) {
        console.error('Error checking active job:', error);
      }
    };
    
    checkActiveJob();
  }, [clientId, isAdmin]);

  // Poll for job status updates
  const startJobPolling = (jobId: number) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    const pollJob = async () => {
      if (!isMountedRef.current || document.hidden) return;

      // Abort previous in-flight request before starting a new one
      pollAbortRef.current?.abort();
      const controller = new AbortController();
      pollAbortRef.current = controller;

      try {
        const token = getAdminToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(`/api/monitoring/scan-job/${jobId}`, { headers, signal: controller.signal });
        if (!response.ok) {
          throw new Error('Failed to get job status');
        }
        
        const job = await response.json();
        
        if (!isMountedRef.current) return;
        
        setScanProgress(job.progress);
        setScanStatus(job.progressMessage || 'Processing...');
        if (job.targetCity) {
          setScanSubStatus(`Scanning: ${job.targetCity}`);
        } else {
          setScanSubStatus(`${job.completedPrompts}/${job.totalPrompts} prompts`);
        }
        
        if (job.status === 'complete') {
          const newCompleted = completedScanJobsRef.current + 1;
          completedScanJobsRef.current = newCompleted;
          setCompletedScanJobs(newCompleted);

          let nextJob = null;
          const total = totalScanJobsRef.current;
          const maxRetries = total > 1 && newCompleted < total ? 3 : 1;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
              await new Promise(r => setTimeout(r, 2000));
            }
            const activeResponse = await fetch(`/api/monitoring/scan-job-active/${clientId}`, { headers });
            if (activeResponse.ok) {
              const activeData = await activeResponse.json();
              if (activeData.hasActiveJob && activeData.job) {
                nextJob = activeData.job;
                break;
              }
            }
          }

          if (nextJob) {
            setActiveJobId(nextJob.id);
            setScanProgress(nextJob.progress || 0);
            setScanStatus(nextJob.progressMessage || 'Processing next city...');
            if (nextJob.targetCity) {
              setScanSubStatus(`Scanning: ${nextJob.targetCity}`);
            }
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            startJobPolling(nextJob.id);
            return;
          }

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsScanning(false);
          setActiveJobId(null);
          setTotalScanJobs(0);
          totalScanJobsRef.current = 0;
          setCompletedScanJobs(0);
          completedScanJobsRef.current = 0;
          setScanProgress(100);
          setScanStatus('Scan Complete!');
          setScanSubStatus(job.resultScore !== null ? `Overall Score: ${job.resultScore}%` : '');
          
          toast({
            title: "Scan Complete",
            description: `Visibility scan finished${job.resultScore !== null ? ` with ${job.resultScore}% score` : ''}.`,
          });
          
          queryClient.invalidateQueries({ queryKey: ["/api/monitoring/dashboard", clientId] });
          
        } else if (job.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsScanning(false);
          setActiveJobId(null);
          setTotalScanJobs(0);
          totalScanJobsRef.current = 0;
          setCompletedScanJobs(0);
          completedScanJobsRef.current = 0;
          setScanProgress(0);
          setScanStatus('Scan Failed');
          setScanSubStatus(job.errorMessage || 'Unknown error');
          
          toast({
            title: "Scan Failed",
            description: job.errorMessage || 'Unknown error occurred',
            variant: "destructive",
          });
        }
        
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error polling job status:', error);
      }
    };

    pollJob();
    pollIntervalRef.current = setInterval(pollJob, 3000);
  };
  
  // Generate and copy client share link (admin only)
  const copyClientShareLink = async () => {
    if (!clientId) return;
    
    const token = getAdminToken();
    if (!token) {
      toast({
        title: "Admin access required",
        description: "Only admins can generate client share links.",
        variant: "destructive",
      });
      return;
    }
    
    setIsGeneratingLink(true);
    
    try {
      // First try to get existing token
      let response = await fetch(`/api/monitoring/clients/${clientId}/access-token`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      
      let data = await response.json();
      
      // If no token exists, generate one
      if (!data.accessToken) {
        response = await fetch(`/api/monitoring/clients/${clientId}/access-token`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
        });
        data = await response.json();
      }
      
      if (!response.ok || !data.accessToken) {
        throw new Error("Failed to get access token");
      }
      
      // Build full URL and copy to clipboard
      const shareUrl = `${window.location.origin}${data.accessUrl}`;
      await navigator.clipboard.writeText(shareUrl);
      
      setLinkCopied(true);
      toast({
        title: "Link copied!",
        description: "Client access link has been copied to clipboard.",
      });
      
      // Reset the copied state after 3 seconds
      setTimeout(() => setLinkCopied(false), 3000);
      
    } catch (error) {
      toast({
        title: "Failed to generate link",
        description: "Could not generate client access link.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };
  
  // Function to queue a background scan job (browser-independent)
  const runRescan = async () => {
    if (!clientId || !data) return;
    
    // Prevent starting if already scanning
    if (isScanning || activeJobId) {
      toast({
        title: "Scan in progress",
        description: "Please wait for the current scan to complete.",
        variant: "default",
      });
      return;
    }
    
    setIsScanning(true);
    setScanProgress(0);
    setScanStatus("Queueing scan...");
    setScanSubStatus("");
    
    try {
      // Determine target city for the job
      const targetCity = selectedScanCity === "all" ? null : selectedScanCity;
      
      const token = getAdminToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const response = await fetch(`/api/monitoring/scan-job/${clientId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ targetCity }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // Handle case where scan is already in progress
        if (response.status === 409 && errorData.jobId) {
          setActiveJobId(errorData.jobId);
          setScanProgress(errorData.progress || 0);
          setScanStatus("Scan already in progress");
          startJobPolling(errorData.jobId);
          return;
        }
        
        throw new Error(errorData.details || errorData.error || "Failed to queue scan");
      }
      
      const result = await response.json();
      
      setActiveJobId(result.jobId);
      const jobCount = result.totalJobs || 1;
      setTotalScanJobs(jobCount);
      totalScanJobsRef.current = jobCount;
      setCompletedScanJobs(0);
      completedScanJobsRef.current = 0;
      setScanStatus("Scan queued - processing...");
      setScanSubStatus(
        result.totalJobs > 1
          ? `${result.totalJobs} cities, ${result.totalPrompts} prompts each`
          : `${result.totalPrompts} prompts to scan`
      );
      
      toast({
        title: "Scan Started",
        description: result.totalJobs > 1
          ? `Scanning ${result.totalJobs} cities. You can close this page - it will continue running.`
          : "Your scan is running in the background. You can close this page - it will continue running.",
      });
      
      startJobPolling(result.jobId);
      
    } catch (error) {
      toast({
        title: "Error starting scan",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setScanProgress(0);
      setScanStatus("Failed to start");
      setIsScanning(false);
      setActiveJobId(null);
    }
  };

  const { data, isLoading, error, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/monitoring/dashboard", clientId],
    queryFn: getSessionAwareQueryFn({ on401: "throw" }),
    enabled: !!clientId,
  });

  // Fetch group trends when "groups" view is selected
  const { data: groupTrendsData } = useQuery<GroupTrendsResponse>({
    queryKey: ["/api/monitoring/trends/groups", clientId],
    queryFn: getSessionAwareQueryFn({ on401: "throw" }),
    enabled: !!clientId && trendView === "groups",
  });

  // Fetch competitor trends when "competitors" view is selected
  const { data: competitorTrendsData } = useQuery<CompetitorTrendsResponse>({
    queryKey: ["/api/monitoring/trends/competitors", clientId],
    queryFn: getSessionAwareQueryFn({ on401: "throw" }),
    enabled: !!clientId && trendView === "competitors",
  });

  // Fetch available scan dates for export dropdown
  const { data: scanDatesData } = useQuery<{ scanDates: { date: string; cities: string[]; sessionIds: number[] }[] }>({
    queryKey: ["/api/monitoring/scan-dates", clientId],
    queryFn: getSessionAwareQueryFn({ on401: "throw" }),
    enabled: !!clientId && exportDialogOpen,
  });

  const maybeClient = data?.client;
  const sessions = data?.sessions ?? [];
  const latestResults = data?.latestResults ?? [];
  const resultsByGroup = data?.resultsByGroup ?? [];
  const analytics = data?.analytics ?? null;
  const groups = data?.groups ?? [];
  const clientBusinessName = maybeClient?.businessName ?? "";

  const cityScopedData = useMemo(
    () => selectCityScopedDashboardData(sessions, latestResults, resultsByGroup, selectedViewCity),
    [sessions, latestResults, resultsByGroup, selectedViewCity],
  );
  const {
    isSpecificCitySelected,
    filteredSessions,
    selectedCityHasNoData,
    latestSession,
    previousSession,
    cityFilteredResults,
    cityFilteredResultsByGroup,
  } = cityScopedData;

  const brandSentimentGroupIds = useMemo(() => selectBrandSentimentGroupIds(resultsByGroup), [resultsByGroup]);

  const serviceResultsOnly = useMemo(
    () => cityFilteredResults.filter((result) => !brandSentimentGroupIds.has(result.groupId)),
    [cityFilteredResults, brandSentimentGroupIds],
  );
  const serviceResultsByGroup = useMemo(
    () => cityFilteredResultsByGroup.filter((group) => group.promptCategory !== "brand_sentiment"),
    [cityFilteredResultsByGroup],
  );

  const brandSentimentResults = useMemo(
    () => cityFilteredResults.filter((result) => brandSentimentGroupIds.has(result.groupId)),
    [cityFilteredResults, brandSentimentGroupIds],
  );
  const brandSentimentGroups = useMemo(
    () => cityFilteredResultsByGroup.filter((group) => group.promptCategory === "brand_sentiment"),
    [cityFilteredResultsByGroup],
  );

  const aggregatedScores = useMemo(
    () => selectAggregatedScores(sessions, isSpecificCitySelected),
    [sessions, isSpecificCitySelected],
  );

  const overallScore = aggregatedScores?.overallScore ?? latestSession?.overallScore ?? 0;
  const chatgptScore = aggregatedScores?.chatgptScore ?? latestSession?.chatgptScore ?? 0;
  const googleAIScore = aggregatedScores?.googleAIScore ?? latestSession?.googleAIScore ?? 0;

  const scoreDelta = previousSession ? (latestSession?.overallScore ?? 0) - previousSession.overallScore : 0;

  const visibilityMetrics = useMemo(() => computeVisibilityMetrics(serviceResultsOnly), [serviceResultsOnly]);
  const {
    promptCount,
    totalExposures,
    foundCount,
    citedCount,
    visibilityRate,
    citationRate,
    chatgptVisibility,
    googleAIVisibility,
    chatgptFoundCount,
    googleAIFoundCount,
  } = visibilityMetrics;

  const avgRank = useMemo(() => computeAverageRank(serviceResultsOnly), [serviceResultsOnly]);
  const computedCompetitorVisibility = useMemo(
    () => computeCompetitorVisibility(serviceResultsOnly, clientBusinessName),
    [serviceResultsOnly, clientBusinessName],
  );
  const computedShareOfVoice = useMemo(
    () => computeShareOfVoice(serviceResultsOnly, clientBusinessName),
    [serviceResultsOnly, clientBusinessName],
  );
  const computedTopCitations = useMemo(() => computeTopCitations(serviceResultsOnly), [serviceResultsOnly]);
  const firstPlaceCount = useMemo(() => computeFirstPlaceCount(serviceResultsOnly), [serviceResultsOnly]);

  const sessionChartData = useMemo(
    () => buildSessionChartData(filteredSessions, isSpecificCitySelected),
    [filteredSessions, isSpecificCitySelected],
  );

  const groupTrendChartData = useMemo(
    () => buildGroupTrendChartData(groupTrendsData?.groupTrends ?? []),
    [groupTrendsData],
  );

  const competitorTrendChartData = useMemo(
    () => buildCompetitorTrendChartData(competitorTrendsData?.competitorTrends ?? []),
    [competitorTrendsData],
  );

  const groupBarData = useMemo(() => buildGroupBarData(serviceResultsByGroup), [serviceResultsByGroup]);

  const getVisibilityScore = (r: CheckResult) => {
    const chatgptVisible = r.chatgptCited || r.chatgptFound;
    const googleVisible = r.googleAICited || r.googleAIFound;
    if (chatgptVisible && googleVisible) return 3;
    if (chatgptVisible || googleVisible) return 2;
    return 1;
  };

  const getPlatformStatusScore = (cited: boolean | null | undefined, found: boolean | null | undefined) => {
    if (cited) return 3;
    if (found) return 2;
    return 1;
  };

  const filteredResults = useMemo(
    () => {
      let results = filterResultsByGroup(serviceResultsOnly, selectedGroup);
      if (promptSearch.trim()) {
        const search = promptSearch.toLowerCase();
        results = results.filter(r => r.promptText.toLowerCase().includes(search));
      }
      if (statusFilter !== "all") {
        results = results.filter(r => {
          const chatgptVisible = r.chatgptCited || r.chatgptFound;
          const googleVisible = r.googleAICited || r.googleAIFound;
          switch (statusFilter) {
            case "both": return chatgptVisible && googleVisible;
            case "chatgpt_only": return chatgptVisible && !googleVisible;
            case "google_only": return !chatgptVisible && googleVisible;
            case "not_found": return !chatgptVisible && !googleVisible;
            default: return true;
          }
        });
      }

      const sorted = [...results];
      if (sortColumn) {
        sorted.sort((a, b) => {
          let cmp = 0;
          switch (sortColumn) {
            case "prompt":
              cmp = a.promptText.localeCompare(b.promptText);
              break;
            case "group": {
              const gA = serviceResultsByGroup.find(g => g.groupId === a.groupId)?.groupName || "";
              const gB = serviceResultsByGroup.find(g => g.groupId === b.groupId)?.groupName || "";
              cmp = gA.localeCompare(gB);
              break;
            }
            case "chatgpt":
              cmp = getPlatformStatusScore(a.chatgptCited, a.chatgptFound) - getPlatformStatusScore(b.chatgptCited, b.chatgptFound);
              break;
            case "google":
              cmp = getPlatformStatusScore(a.googleAICited, a.googleAIFound) - getPlatformStatusScore(b.googleAICited, b.googleAIFound);
              break;
            case "rank": {
              const rA = [a.chatgptRank, a.googleAIRank].filter((r): r is number => r != null && r > 0);
              const rB = [b.chatgptRank, b.googleAIRank].filter((r): r is number => r != null && r > 0);
              const avgA = rA.length > 0 ? rA.reduce((s, v) => s + v, 0) / rA.length : 999;
              const avgB = rB.length > 0 ? rB.reduce((s, v) => s + v, 0) / rB.length : 999;
              cmp = avgA - avgB;
              break;
            }
          }
          return sortDirection === "desc" ? -cmp : cmp;
        });
      } else {
        sorted.sort((a, b) => {
          const scoreA = getVisibilityScore(a);
          const scoreB = getVisibilityScore(b);
          if (scoreA !== scoreB) return scoreB - scoreA;
          const citedA = (a.chatgptCited ? 1 : 0) + (a.googleAICited ? 1 : 0);
          const citedB = (b.chatgptCited ? 1 : 0) + (b.googleAICited ? 1 : 0);
          if (citedA !== citedB) return citedB - citedA;
          const ranksA = [a.chatgptRank, a.googleAIRank].filter((r): r is number => r != null && r > 0);
          const ranksB = [b.chatgptRank, b.googleAIRank].filter((r): r is number => r != null && r > 0);
          const avgA = ranksA.length > 0 ? ranksA.reduce((s, v) => s + v, 0) / ranksA.length : 999;
          const avgB = ranksB.length > 0 ? ranksB.reduce((s, v) => s + v, 0) / ranksB.length : 999;
          return avgA - avgB;
        });
      }
      return sorted;
    },
    [serviceResultsOnly, selectedGroup, promptSearch, statusFilter, sortColumn, sortDirection, serviceResultsByGroup],
  );

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / ITEMS_PER_PAGE));
  const paginatedResults = useMemo(
    () => filteredResults.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filteredResults, currentPage, ITEMS_PER_PAGE],
  );

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-0 group-hover/sort:opacity-50 transition-opacity" />;
    if (sortDirection === "asc") return <ArrowUp className="w-3 h-3 ml-1 text-blue-600" />;
    return <ArrowDown className="w-3 h-3 ml-1 text-blue-600" />;
  };

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages));
  }, [totalPages, currentPage]);

  if (!clientId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Invalid client ID</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5599f9] animate-spin" />
      </div>
    );
  }

  if (!data) {
    const errorMessage = error instanceof Error ? error.message : "";
    const isAuthError = errorMessage.includes("401") || errorMessage.includes("403");
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="border border-gray-200 shadow-sm max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 px-6">
            {isAuthError ? (
              <>
                <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2" data-testid="text-auth-error">
                  {errorMessage.includes("403") ? "Access denied" : "Session expired"}
                </h3>
                <p className="text-gray-500 text-center text-sm mb-4" data-testid="text-auth-error-detail">
                  {errorMessage.includes("403")
                    ? "You don't have permission to view this dashboard."
                    : "Your login session has expired. Please log in again to view this dashboard."}
                </p>
                <Button onClick={() => setLocation("/")} data-testid="button-go-home">
                  Go to Home
                </Button>
              </>
            ) : (
              <>
                <XCircle className="w-10 h-10 text-gray-400 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2" data-testid="text-no-data">No data found</h3>
                <p className="text-gray-500 text-center text-sm mb-4" data-testid="text-no-data-detail">
                  {error ? "Something went wrong loading the dashboard. Please try again." : "No monitoring data is available for this client yet."}
                </p>
                <Button onClick={() => refetch()} variant="outline" data-testid="button-retry">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const client = data.client;


  // Colors for group/competitor lines
  const trendLineColors = [
    "#5599f9", "#ffb41c", "#22c55e", "#ef4444", "#8b5cf6", 
    "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"
  ];

  return (
    <div className="bg-gray-50 selection:bg-[#5599f9] selection:text-white h-full overflow-auto">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">{client.businessName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDialogOpen(true)}
              className="flex items-center gap-2"
              data-testid="button-export"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
            {client.cities && client.cities.length > 1 && (
              <Select value={selectedScanCity} onValueChange={setSelectedScanCity}>
                <SelectTrigger className="w-[160px] h-9" data-testid="select-scan-city">
                  <SelectValue placeholder="All cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cities</SelectItem>
                  {client.cities.map((cityName: string) => (
                    <SelectItem key={cityName} value={cityName}>
                      {cityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={runRescan}
                disabled={isScanning}
                className="flex items-center gap-2"
                data-testid="button-refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
                {isScanning ? "Scanning..." : (selectedScanCity && selectedScanCity !== "all" ? `Scan ${selectedScanCity}` : "Run New Scan")}
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/monitor/settings/${clientId}`)}
                className="flex items-center gap-2"
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyClientShareLink}
                disabled={isGeneratingLink}
                className="flex items-center gap-2"
                data-testid="button-share-client-link"
              >
                {isGeneratingLink ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : linkCopied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
                {linkCopied ? "Copied!" : "Share Link"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scanning Progress Overlay */}
      {isScanning && (
        <div className="bg-gradient-to-r from-[#5599f9]/10 to-[#ffb41c]/10 border-b border-[#5599f9]/20">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <Loader2 className="w-5 h-5 text-[#5599f9] animate-spin" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{scanStatus}</span>
                  <span className="text-sm text-gray-500">{scanProgress}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#5599f9] to-[#ffb41c] transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                {scanSubStatus && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{scanSubStatus}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Multi-city info banner */}
        {client.cities && client.cities.length > 1 && (
          <Card className="bg-gradient-to-r from-[#5599f9]/5 to-[#ffb41c]/5 border-[#5599f9]/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-[#5599f9]" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Multi-location business: Tracking visibility across {client.cities.length} cities
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {client.cities.map((cityName: string) => (
                        <Badge key={cityName} variant="outline" className="text-xs">
                          {cityName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">View data for:</span>
                  <Select value={selectedViewCity} onValueChange={setSelectedViewCity}>
                    <SelectTrigger className="w-[200px]" data-testid="select-view-city">
                      <SelectValue placeholder="All cities (latest scan)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All cities (latest overall scan)</SelectItem>
                      {client.cities.map((cityName: string) => (
                        <SelectItem key={cityName} value={cityName}>
                          {cityName} only
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No data for selected city warning */}
        {selectedCityHasNoData && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">
                    No scan data for {selectedViewCity}
                  </p>
                  <p className="text-sm text-amber-600 mt-1">
                    You haven't run a scan for this city yet. Use the "Run New Scan" button above and select "{selectedViewCity}" to scan this location.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scorecard Row */}
        <div className="grid md:grid-cols-4 gap-4">
          {/* Average Rank */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500 flex items-center">
                    Avg Rank
                    <MetricInfo tooltip={METRIC_TOOLTIPS.avgRank} id="avg-rank" />
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-bold text-gray-900">
                      {avgRank !== null ? avgRank.toFixed(1) : "—"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {avgRank !== null ? "Lower is better" : "No rankings yet"}
                  </p>
                </div>
                <Award className="w-8 h-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Visibility Rate */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500 flex items-center">
                    Visibility Rate
                    <MetricInfo tooltip={METRIC_TOOLTIPS.visibilityRate} id="visibility-rate" />
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-bold text-[#5599f9]">{visibilityRate}%</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{foundCount} of {totalExposures} platform checks</p>
                </div>
                <Eye className="w-8 h-8 text-[#5599f9]" />
              </div>
            </CardContent>
          </Card>

          {/* Citation Rate */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500 flex items-center">
                    Citation Rate
                    <MetricInfo tooltip={METRIC_TOOLTIPS.citationRate} id="citation-rate" />
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-bold text-[#ffb41c]">{citationRate}%</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{citedCount} direct citations</p>
                </div>
                <Target className="w-8 h-8 text-[#ffb41c]" />
              </div>
            </CardContent>
          </Card>

          {/* Next Check */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500 flex items-center">
                    Next Check
                    <MetricInfo tooltip={METRIC_TOOLTIPS.nextCheck} id="next-check" />
                  </p>
                  <div className="text-lg font-bold text-gray-900 mt-2">
                    {client.nextCheckAt 
                      ? format(new Date(client.nextCheckAt), "MMM d, yyyy")
                      : "Not scheduled"}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Every {client.checkFrequencyDays} days</p>
                </div>
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Score Trend Chart with View Selector */}
          <Card className="md:col-span-2 shadow-2xl shadow-blue-900/5">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-lg font-bold tracking-tight flex items-center">
                Visibility Trend
                <MetricInfo tooltip={METRIC_TOOLTIPS.visibilityTrend} id="visibility-trend" />
              </CardTitle>
              <div className="flex items-center gap-3">
                <Tabs value={trendView} onValueChange={(v) => setTrendView(v as "overall" | "groups" | "competitors")} className="w-auto">
                  <TabsList className="h-8">
                    <TabsTrigger value="overall" className="text-xs px-3" data-testid="tab-trend-overall">Overall</TabsTrigger>
                    <TabsTrigger value="groups" className="text-xs px-3" data-testid="tab-trend-groups">By Group</TabsTrigger>
                    <TabsTrigger value="competitors" className="text-xs px-3" data-testid="tab-trend-competitors">Competitors</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-32" data-testid="select-time-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {trendView === "overall" && (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={sessionChartData}>
                    <defs>
                      <linearGradient id="colorOverall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "white", 
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                      }} 
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="overall" 
                      stroke={COLORS.primary} 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorOverall)" 
                      name="Overall"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="chatgpt" 
                      stroke={COLORS.primary} 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="ChatGPT"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="googleAI" 
                      stroke={COLORS.accent} 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Google AI"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {trendView === "groups" && (
                <ResponsiveContainer width="100%" height={300}>
                  {groupTrendChartData.length > 0 ? (
                    <LineChart data={groupTrendChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                      <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "white", 
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                        }} 
                      />
                      <Legend />
                      {groupTrendsData?.groupTrends?.map((g, i) => (
                        <Line 
                          key={g.groupId}
                          type="monotone" 
                          dataKey={g.groupName} 
                          stroke={trendLineColors[i % trendLineColors.length]} 
                          strokeWidth={2}
                          dot={false}
                          name={g.groupName.length > 20 ? g.groupName.slice(0, 20) + "..." : g.groupName}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <p>No group trend data available yet. Run a scan to start tracking.</p>
                    </div>
                  )}
                </ResponsiveContainer>
              )}
              {trendView === "competitors" && (
                <ResponsiveContainer width="100%" height={300}>
                  {competitorTrendChartData.length > 0 ? (
                    <LineChart data={competitorTrendChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                      <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} unit="%" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "white", 
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                        }}
                        formatter={(value: number) => [`${value}%`, undefined]}
                      />
                      <Legend />
                      {competitorTrendsData?.competitorTrends?.map((c, i) => (
                        <Line 
                          key={c.competitorName}
                          type="monotone" 
                          dataKey={c.competitorName} 
                          stroke={trendLineColors[i % trendLineColors.length]} 
                          strokeWidth={2}
                          dot={false}
                          name={c.competitorName.length > 20 ? c.competitorName.slice(0, 20) + "..." : c.competitorName}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <p>No competitor trend data available yet. Run a scan to start tracking.</p>
                    </div>
                  )}
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Platform Visibility */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold tracking-tight flex items-center">
                Platform Visibility
                <MetricInfo tooltip={METRIC_TOOLTIPS.platformVisibility} id="platform-visibility" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* ChatGPT */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#5599f9]" />
                    <span className="font-medium text-gray-900">ChatGPT</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-[#5599f9]">{chatgptVisibility}%</span>
                    <span className="text-sm text-gray-500">({chatgptFoundCount}/{promptCount})</span>
                  </div>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#5599f9] rounded-full transition-all"
                    style={{ width: `${chatgptVisibility}%` }}
                  />
                </div>
              </div>

              {/* Google AI */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ffb41c]" />
                    <span className="font-medium text-gray-900">Google AI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-[#ffb41c]">{googleAIVisibility}%</span>
                    <span className="text-sm text-gray-500">({googleAIFoundCount}/{promptCount})</span>
                  </div>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#ffb41c] rounded-full transition-all"
                    style={{ width: `${googleAIVisibility}%` }}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Combined Visibility</span>
                  <span className="font-bold text-gray-900">{visibilityRate}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Found in {foundCount} of {totalExposures} total AI responses
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analytics Grid - 3 Column Layout */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* Top Citations */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#ffb41c]" />
                <CardTitle className="text-sm font-bold tracking-tight flex items-center">
                  Top Citations
                  <MetricInfo tooltip={METRIC_TOOLTIPS.topCitations} id="top-citations" />
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {computedTopCitations.length > 0 ? (
                <div className="space-y-2">
                  {computedTopCitations.slice(0, 5).map((citation, index) => (
                    <div key={index} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs text-gray-400 flex-shrink-0">{index + 1}.</span>
                        <a 
                          href={`https://${citation.domain}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-[#5599f9] hover:underline truncate"
                          data-testid={`link-citation-${index}`}
                        >
                          {citation.domain}
                        </a>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {citation.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No citations found</p>
              )}
            </CardContent>
          </Card>

          {/* Prominence */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-green-500" />
                <CardTitle className="text-sm font-bold tracking-tight flex items-center">
                  Prominence
                  <MetricInfo tooltip={METRIC_TOOLTIPS.prominence} id="prominence" />
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Average Position</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-gray-900">
                    {avgRank !== null ? avgRank : "-"}
                  </span>
                  {avgRank !== null && (
                    <span className="text-sm text-gray-500">avg rank</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">First Choice</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-[#ffb41c]">{firstPlaceCount}</span>
                  <span className="text-sm text-gray-500">times ranked #1</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Competitor Visibility */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#5599f9]" />
                <CardTitle className="text-sm font-bold tracking-tight flex items-center">
                  Competitor Visibility
                  <MetricInfo tooltip={METRIC_TOOLTIPS.competitorVisibility} id="competitor-visibility" />
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {computedCompetitorVisibility.length > 0 ? (
                <div className="space-y-3">
                  {computedCompetitorVisibility.map((competitor, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-600">{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{competitor.name}</p>
                          <p className="text-xs text-gray-500">{competitor.mentionCount} mentions</p>
                        </div>
                        <div className="flex-shrink-0">
                          <Badge variant="secondary" className="text-xs">
                            {competitor.visibilityPercent}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No competitor data yet</p>
                )}
              </CardContent>
            </Card>
        </div>

        {/* Key Sentiment Drivers - Two Column Layout (SEMRush Style) */}
        {analytics && (analytics.sentimentNarratives?.strengths?.length || analytics.sentimentNarratives?.improvements?.length) ? (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Meh className="w-5 h-5 text-[#ffb41c]" />
                <CardTitle className="text-lg font-bold tracking-tight flex items-center">
                  Key Sentiment Drivers
                  <MetricInfo tooltip={METRIC_TOOLTIPS.sentimentDrivers} id="sentiment-drivers" />
                </CardTitle>
              </div>
              <p className="text-sm text-gray-500 mt-1">Uncover what shapes your brand perception</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Brand Strength Factors */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-4 h-4 text-green-600" />
                    <h3 className="font-semibold text-sm text-gray-900">Brand Strength Factors</h3>
                  </div>
                  <div className="space-y-3">
                    {analytics.sentimentNarratives?.strengths?.length ? (
                      analytics.sentimentNarratives.strengths.map((narrative: { text: string; strength: number; prompt?: string; platform?: 'chatgpt' | 'google' }, idx: number) => (
                        <div 
                          key={idx} 
                          className="p-3 bg-green-50 border border-green-100 rounded-lg"
                          data-testid={`narrative-strength-${idx}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              {narrative.platform && (
                                <Badge 
                                  variant="secondary" 
                                  className={`mb-2 text-xs ${
                                    narrative.platform === 'chatgpt' 
                                      ? 'bg-blue-100 text-blue-700 border-blue-200' 
                                      : 'bg-orange-100 text-orange-700 border-orange-200'
                                  }`}
                                  data-testid={`badge-platform-strength-${idx}`}
                                >
                                  {narrative.platform === 'chatgpt' ? 'ChatGPT' : 'Google AI'}
                                </Badge>
                              )}
                              <p className="text-sm text-gray-700 leading-relaxed">{narrative.text}</p>
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <div
                                  key={level}
                                  className={`w-4 h-2 rounded-sm ${
                                    level <= narrative.strength 
                                      ? 'bg-green-500' 
                                      : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No brand strengths identified yet</p>
                    )}
                  </div>
                </div>

                {/* Areas for Improvement */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-4 h-4 text-amber-600" />
                    <h3 className="font-semibold text-sm text-gray-900">Areas for Improvement</h3>
                  </div>
                  <div className="space-y-3">
                    {analytics.sentimentNarratives?.improvements?.length ? (
                      analytics.sentimentNarratives.improvements.map((narrative: { text: string; strength: number; prompt?: string; platform?: 'chatgpt' | 'google' }, idx: number) => (
                        <div 
                          key={idx} 
                          className="p-3 bg-amber-50 border border-amber-100 rounded-lg"
                          data-testid={`narrative-improvement-${idx}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              {narrative.platform && (
                                <Badge 
                                  variant="secondary" 
                                  className={`mb-2 text-xs ${
                                    narrative.platform === 'chatgpt' 
                                      ? 'bg-blue-100 text-blue-700 border-blue-200' 
                                      : 'bg-orange-100 text-orange-700 border-orange-200'
                                  }`}
                                  data-testid={`badge-platform-improvement-${idx}`}
                                >
                                  {narrative.platform === 'chatgpt' ? 'ChatGPT' : 'Google AI'}
                                </Badge>
                              )}
                              <p className="text-sm text-gray-700 leading-relaxed">{narrative.text}</p>
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <div
                                  key={level}
                                  className={`w-4 h-2 rounded-sm ${
                                    level <= narrative.strength 
                                      ? 'bg-amber-500' 
                                      : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No improvement areas identified</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Group Performance */}
        <Card className="shadow-2xl shadow-blue-900/5">
          <CardHeader>
            <CardTitle className="text-lg font-bold tracking-tight">Visibility by Group</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={groupBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
                <YAxis type="category" dataKey="name" width={150} stroke="#9ca3af" fontSize={12} />
                <Tooltip 
                  formatter={(value, name, props) => [`${value}%`, props.payload.fullName]}
                  contentStyle={{ 
                    backgroundColor: "white", 
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                  }}
                />
                <Bar dataKey="visibility" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Detailed Results - Table Layout */}
        <Card className="shadow-2xl shadow-blue-900/5">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg font-bold tracking-tight">Prompt Results</CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search prompts..."
                    value={promptSearch}
                    onChange={(e) => { setPromptSearch(e.target.value); setCurrentPage(1); }}
                    className="pl-9 w-56 h-9 text-sm"
                    data-testid="input-prompt-search"
                  />
                </div>
                <Select value={selectedGroup} onValueChange={(v) => { setSelectedGroup(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-48 h-9 text-sm" data-testid="select-group-filter">
                    <SelectValue placeholder="All Groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Service Groups</SelectItem>
                    {groups.filter(g => g.promptCategory !== 'brand_sentiment').map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-status-filter">
                    <Filter className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="both">Found in Both</SelectItem>
                    <SelectItem value="chatgpt_only">ChatGPT Only</SelectItem>
                    <SelectItem value="google_only">Google AI Only</SelectItem>
                    <SelectItem value="not_found">Not Found</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {/* Table Header */}
            <div className="grid grid-cols-[3rem_1fr_minmax(100px,160px)_100px_100px_80px] items-center gap-2 px-6 py-2.5 border-b border-gray-200 bg-gray-50/80 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="text-center">#</span>
              <button
                onClick={() => handleSort("prompt")}
                className="group/sort flex items-center text-left hover:text-gray-900 transition-colors cursor-pointer"
                data-testid="sort-prompt"
              >
                Prompt
                <SortIcon column="prompt" />
              </button>
              <button
                onClick={() => handleSort("group")}
                className="group/sort hidden md:flex items-center hover:text-gray-900 transition-colors cursor-pointer"
                data-testid="sort-group"
              >
                Group
                <SortIcon column="group" />
              </button>
              <button
                onClick={() => handleSort("chatgpt")}
                className="group/sort flex items-center justify-center hover:text-gray-900 transition-colors cursor-pointer"
                data-testid="sort-chatgpt"
              >
                ChatGPT
                <SortIcon column="chatgpt" />
              </button>
              <button
                onClick={() => handleSort("google")}
                className="group/sort flex items-center justify-center hover:text-gray-900 transition-colors cursor-pointer"
                data-testid="sort-google"
              >
                Google AI
                <SortIcon column="google" />
              </button>
              <button
                onClick={() => handleSort("rank")}
                className="group/sort flex items-center justify-center hover:text-gray-900 transition-colors cursor-pointer"
                data-testid="sort-rank"
              >
                Rank
                <SortIcon column="rank" />
              </button>
            </div>
            
            {/* Table Rows */}
            <div className="divide-y divide-gray-100">
              {paginatedResults.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500 text-sm">
                  {promptSearch || statusFilter !== "all" ? "No prompts match your filters" : "No prompt results available"}
                </div>
              ) : (
                paginatedResults.map((result, idx) => {
                  const groupName = serviceResultsByGroup.find(g => g.groupId === result.groupId)?.groupName || resultsByGroup.find(g => g.groupId === result.groupId)?.groupName;
                  const avgRank = (() => {
                    const ranks = [result.chatgptRank, result.googleAIRank].filter((r): r is number => r != null && r > 0);
                    return ranks.length > 0 ? (ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;
                  })();
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                  const visScore = getVisibilityScore(result);
                  const borderColor = visScore === 3 ? "border-l-green-500" : visScore === 2 ? "border-l-amber-400" : "border-l-transparent";

                  return (
                    <button
                      key={result.id}
                      className={`w-full grid grid-cols-[3rem_1fr_minmax(100px,160px)_100px_100px_80px] items-center gap-2 px-6 py-3.5 text-left hover-elevate rounded-lg transition-colors cursor-pointer group border-l-[3px] ${borderColor}`}
                      onClick={() => setSelectedResult(result)}
                      data-testid={`button-result-${result.id}`}
                    >
                      {/* Row number */}
                      <span className="text-center text-sm text-gray-400 font-medium tabular-nums">{globalIdx}</span>

                      {/* Prompt text */}
                      <div className="min-w-0 pr-2">
                        <p className="text-sm text-gray-900 font-medium truncate transition-colors" data-testid={`text-prompt-${result.id}`}>{result.promptText}</p>
                      </div>

                      {/* Group */}
                      <div className="hidden md:block min-w-0">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md truncate inline-block max-w-full">
                          {groupName || "—"}
                        </span>
                      </div>

                      {/* ChatGPT status */}
                      <div className="flex items-center justify-center gap-1.5" data-testid={`status-chatgpt-${result.id}`}>
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          result.chatgptCited ? "bg-green-500" :
                          result.chatgptFound ? "bg-blue-500" :
                          "bg-gray-300"
                        }`} />
                        <span className={`text-xs font-medium ${
                          result.chatgptCited ? "text-green-700" :
                          result.chatgptFound ? "text-blue-600" :
                          "text-gray-400"
                        }`}>
                          {result.chatgptCited ? "Cited" : result.chatgptFound ? "Found" : "—"}
                        </span>
                      </div>

                      {/* Google AI status */}
                      <div className="flex items-center justify-center gap-1.5" data-testid={`status-googleai-${result.id}`}>
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          result.googleAICited ? "bg-green-500" :
                          result.googleAIFound ? "bg-blue-500" :
                          "bg-gray-300"
                        }`} />
                        <span className={`text-xs font-medium ${
                          result.googleAICited ? "text-green-700" :
                          result.googleAIFound ? "text-blue-600" :
                          "text-gray-400"
                        }`}>
                          {result.googleAICited ? "Cited" : result.googleAIFound ? "Found" : "—"}
                        </span>
                      </div>

                      {/* Average Rank */}
                      <div className="flex items-center justify-center" data-testid={`text-rank-${result.id}`}>
                        {avgRank != null ? (
                          <span className={`text-sm font-bold tabular-nums ${
                            avgRank <= 3 ? "text-green-600" :
                            avgRank <= 5 ? "text-amber-600" :
                            "text-gray-500"
                          }`}>
                            #{avgRank.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Pagination Footer */}
            {filteredResults.length > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50/50">
                <p className="text-sm text-gray-500" data-testid="text-pagination-info">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredResults.length)} of {filteredResults.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    data-testid="button-prev-page"
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
                        data-testid={`button-page-${pageNum}`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Brand Sentiment Section - Dedicated section for brand-specific prompts */}
        {brandSentimentResults.length > 0 && (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-[#5599f9]" />
                    Brand Sentiment Analysis
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Direct AI queries about your business (excluded from visibility metrics)
                  </p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {brandSentimentResults.length} prompts
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Brand Sentiment Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Positive Findings */}
                <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsUp className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-700">Positive Themes</span>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const positiveResponses = brandSentimentResults.filter(r => 
                        (r.chatgptSentiment === 'positive' || r.googleAISentiment === 'positive')
                      );
                      return positiveResponses.length > 0 ? (
                        <p className="text-sm text-green-600">
                          {positiveResponses.length} positive response{positiveResponses.length !== 1 ? 's' : ''} found
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">No positive themes detected</p>
                      );
                    })()}
                  </div>
                </div>

                {/* Neutral Findings */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Meh className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-semibold text-gray-700">Neutral Themes</span>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const neutralResponses = brandSentimentResults.filter(r => 
                        (r.chatgptSentiment === 'neutral' || r.googleAISentiment === 'neutral')
                      );
                      return neutralResponses.length > 0 ? (
                        <p className="text-sm text-gray-600">
                          {neutralResponses.length} neutral response{neutralResponses.length !== 1 ? 's' : ''} found
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">No neutral themes detected</p>
                      );
                    })()}
                  </div>
                </div>

                {/* Negative Findings */}
                <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsDown className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-semibold text-red-700">Areas for Improvement</span>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const negativeResponses = brandSentimentResults.filter(r => 
                        (r.chatgptSentiment === 'negative' || r.googleAISentiment === 'negative')
                      );
                      return negativeResponses.length > 0 ? (
                        <p className="text-sm text-red-600">
                          {negativeResponses.length} area{negativeResponses.length !== 1 ? 's' : ''} identified
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">No issues detected</p>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Brand Sentiment Prompt Details */}
              <div className="divide-y divide-gray-100">
                {brandSentimentResults.map((result) => {
                  const overallSentiment = result.chatgptSentiment || result.googleAISentiment || 'neutral';
                  const sentimentColors = {
                    positive: { bg: 'bg-green-100', text: 'text-green-700', icon: ThumbsUp },
                    neutral: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Meh },
                    negative: { bg: 'bg-red-100', text: 'text-red-700', icon: ThumbsDown },
                  };
                  const sentimentStyle = sentimentColors[overallSentiment as keyof typeof sentimentColors] || sentimentColors.neutral;
                  const SentimentIcon = sentimentStyle.icon;

                  return (
                    <div 
                      key={result.id} 
                      className="py-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg px-2"
                      onClick={() => setSelectedResult(result)}
                      data-testid={`brand-sentiment-result-${result.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full ${sentimentStyle.bg}`}>
                          <SentimentIcon className={`h-4 w-4 ${sentimentStyle.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{result.promptText}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <Badge variant="outline" className={`${sentimentStyle.bg} ${sentimentStyle.text} capitalize`}>
                              {overallSentiment}
                            </Badge>
                            {result.chatgptResponse && (
                              <span className="text-xs text-gray-500">ChatGPT responded</span>
                            )}
                            {result.googleAIResponse && (
                              <span className="text-xs text-gray-500">Google AI responded</span>
                            )}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="shrink-0"
                          data-testid={`view-brand-sentiment-${result.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Response Detail Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight">
              AI Response Details
            </DialogTitle>
          </DialogHeader>
          {selectedResult && (
            <div className="space-y-4 overflow-hidden">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Prompt</p>
                <p className="text-gray-900 break-words">{selectedResult.promptText}</p>
              </div>
              
              <Tabs defaultValue="chatgpt" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="chatgpt" className="flex-1" data-testid="tab-chatgpt-response">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${selectedResult.chatgptFound ? "bg-green-500" : "bg-red-500"}`} />
                      ChatGPT
                      {selectedResult.chatgptCited && <Badge variant="secondary" className="text-xs ml-1">Cited</Badge>}
                    </div>
                  </TabsTrigger>
                  <TabsTrigger value="googleai" className="flex-1" data-testid="tab-googleai-response">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${selectedResult.googleAIFound ? "bg-green-500" : "bg-red-500"}`} />
                      Google AI
                      {selectedResult.googleAICited && <Badge variant="secondary" className="text-xs ml-1">Cited</Badge>}
                    </div>
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="chatgpt" className="mt-4 space-y-3">
                  <ScrollArea className="h-[350px] rounded-lg border p-4 overflow-x-hidden">
                    {selectedResult.chatgptResponse ? (
                      <div 
                        className="prose prose-sm max-w-none text-gray-700 break-words overflow-hidden"
                        dangerouslySetInnerHTML={{ 
                          __html: selectedResult.chatgptResponse
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                            .replace(new RegExp(`(${client.businessName})`, 'gi'), '<mark class="bg-yellow-200 px-1 rounded">$1</mark>')
                        }}
                      />
                    ) : (
                      <p className="text-gray-500 italic">No response recorded</p>
                    )}
                  </ScrollArea>
                  {(() => {
                    let citations: Array<{url: string; title?: string; domain: string}> | null = null;
                    const rawCitations = selectedResult.chatgptCitations;
                    if (typeof rawCitations === 'string') {
                      try { citations = JSON.parse(rawCitations); } catch { citations = null; }
                    } else if (Array.isArray(rawCitations)) {
                      citations = rawCitations as Array<{url: string; title?: string; domain: string}>;
                    }
                    if (!citations || !Array.isArray(citations) || citations.length === 0) return null;
                    return (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-700 uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                          Sources Cited ({citations.length})
                        </p>
                        <div className="space-y-1.5">
                          {citations.slice(0, 8).map((citation, idx) => (
                            <a
                              key={idx}
                              href={citation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline truncate"
                              data-testid={`link-chatgpt-citation-${idx}`}
                            >
                              <span className="text-xs text-blue-400 flex-shrink-0">{idx + 1}.</span>
                              <span className="truncate">{citation.title || citation.domain}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
                
                <TabsContent value="googleai" className="mt-4 space-y-3">
                  <ScrollArea className="h-[350px] rounded-lg border p-4 overflow-x-hidden">
                    {selectedResult.googleAIResponse ? (
                      <div 
                        className="prose prose-sm max-w-none text-gray-700 break-words overflow-hidden"
                        dangerouslySetInnerHTML={{ 
                          __html: selectedResult.googleAIResponse
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                            .replace(new RegExp(`(${client.businessName})`, 'gi'), '<mark class="bg-yellow-200 px-1 rounded">$1</mark>')
                        }}
                      />
                    ) : (
                      <p className="text-gray-500 italic">No response recorded</p>
                    )}
                  </ScrollArea>
                  {(() => {
                    let citations: Array<{url: string; title?: string; domain: string}> | null = null;
                    const rawCitations = selectedResult.googleAICitations;
                    if (typeof rawCitations === 'string') {
                      try { citations = JSON.parse(rawCitations); } catch { citations = null; }
                    } else if (Array.isArray(rawCitations)) {
                      citations = rawCitations as Array<{url: string; title?: string; domain: string}>;
                    }
                    if (!citations || !Array.isArray(citations) || citations.length === 0) return null;
                    return (
                      <div className="bg-orange-50 rounded-lg p-3">
                        <p className="text-xs text-orange-700 uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                          Sources Cited ({citations.length})
                        </p>
                        <div className="space-y-1.5">
                          {citations.slice(0, 8).map((citation, idx) => (
                            <a
                              key={idx}
                              href={citation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-800 hover:underline truncate"
                              data-testid={`link-googleai-citation-${idx}`}
                            >
                              <span className="text-xs text-orange-400 flex-shrink-0">{idx + 1}.</span>
                              <span className="truncate">{citation.title || citation.domain}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
              
              {selectedResult.competitors && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">Competitors Mentioned</p>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(selectedResult.competitors).slice(0, 10).map((competitor: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {competitor}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={(open) => {
        setExportDialogOpen(open);
        if (!open) setSelectedExportDate("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold tracking-tight">Export Scan Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">
              Select a scan date to export. {client.cities && client.cities.length > 1 
                ? `Each city will be exported as a separate Excel file with service group tabs.`
                : `Data will be exported as an Excel file with service group tabs.`}
            </p>
            <div className="space-y-2">
              <Label htmlFor="export-scan-date">Select Scan Date</Label>
              {scanDatesData?.scanDates && scanDatesData.scanDates.length > 0 ? (
                <Select value={selectedExportDate} onValueChange={setSelectedExportDate}>
                  <SelectTrigger className="w-full" data-testid="select-export-scan-date">
                    <SelectValue placeholder="Choose a scan date..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scanDatesData.scanDates.map((scanDate) => (
                      <SelectItem key={scanDate.date} value={scanDate.date}>
                        {format(new Date(scanDate.date + "T12:00:00"), "MMMM d, yyyy")}
                        {scanDate.cities.length > 0 && (
                          <span className="text-gray-400 ml-2">
                            ({scanDate.cities.join(", ")})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-gray-500 italic py-2">
                  No scans available. Run a scan first to export data.
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">
              <p className="font-medium mb-1">Export includes:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>README with usage instructions</li>
                {client.cities && client.cities.length > 1 ? (
                  <>
                    <li>Separate Excel file for each city</li>
                    <li>Tabs for each service group (Plumber, Drain Cleaner, etc.)</li>
                  </>
                ) : (
                  <li>Excel file with tabs for each service group</li>
                )}
                <li>All prompts, responses, and citations</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} data-testid="button-cancel-export">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedExportDate) {
                  toast({
                    title: "Select a scan date",
                    description: "Please choose a scan date to export",
                    variant: "destructive",
                  });
                  return;
                }
                setIsExporting(true);
                try {
                  const url = `/api/monitoring/export-by-date/${clientId}?scanDate=${selectedExportDate}`;
                  const token = getAdminToken();
                  const headers: Record<string, string> = {};
                  if (token) headers["Authorization"] = `Bearer ${token}`;
                  const response = await fetch(url, { headers });
                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Export failed");
                  }
                  const blob = await response.blob();
                  const downloadUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = downloadUrl;
                  a.download = `visibility-export-${client.businessName.replace(/[^a-zA-Z0-9]/g, "-")}-${selectedExportDate}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(downloadUrl);
                  setExportDialogOpen(false);
                  toast({
                    title: "Export Complete",
                    description: "Your visibility data has been downloaded",
                  });
                } catch (error) {
                  console.error("Export error:", error);
                  toast({
                    title: "Export Failed",
                    description: error instanceof Error ? error.message : "Export failed",
                    variant: "destructive",
                  });
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting || !selectedExportDate}
              className="flex items-center gap-2"
              data-testid="button-download-export"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? "Preparing..." : "Download"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
