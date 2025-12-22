import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  Users, Link2, Award, ThumbsUp, ThumbsDown, Meh, ExternalLink, Download
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import logoIcon from "@assets/images_1765741951084.png";
import type { MonitoringClient, MonitoringGroup, CheckSession, CheckResult } from "@shared/schema";

interface Citation {
  domain: string;
  count: number;
}

interface ShareOfVoiceItem {
  name: string;
  percentage: number;
  mentionCount: number;
}

interface CompetitorVisibility {
  name: string;
  visibilityPercent: number;
  mentionCount: number;
}

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
  resultsByGroup: { groupId: number; groupName: string; results: CheckResult[] }[];
  analytics: Analytics | null;
  trendData: TrendDataPoint[];
}

interface GroupTrendData {
  groupId: number;
  groupName: string;
  data: { date: string | null; visibilityScore: number; foundCount: number; totalPrompts: number }[];
}

interface CompetitorTrendData {
  competitorName: string;
  data: { date: string | null; visibilityPercent: number; mentionCount: number }[];
}

const COLORS = {
  primary: "#5599f9",
  accent: "#ffb41c",
  success: "#22c55e",
  danger: "#ef4444",
  gray: "#9ca3af",
};

export default function MonitorDashboard() {
  const [, params] = useRoute("/monitor/dashboard/:id");
  const [, setLocation] = useLocation();
  const clientId = params?.id ? parseInt(params.id) : null;
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("30");
  const [trendView, setTrendView] = useState<"overall" | "groups" | "competitors">("overall");
  const [selectedResult, setSelectedResult] = useState<CheckResult | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isExporting, setIsExporting] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  
  // Rescan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [scanSubStatus, setScanSubStatus] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);
  
  // Function to run a fresh scan
  const runRescan = async () => {
    if (!clientId) return;
    
    setIsScanning(true);
    setScanProgress(0);
    setScanStatus("Preparing scan...");
    setScanSubStatus("");
    
    try {
      // Step 1: Prepare the rescan
      const prepareResponse = await fetch(`/api/monitoring/rescan-prepare/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!prepareResponse.ok) {
        let errorMessage = "Failed to prepare scan";
        try {
          const errorData = await prepareResponse.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch {
          // Response is not JSON, use status text
          errorMessage = prepareResponse.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const { prepareId, totalPrompts } = await prepareResponse.json();
      
      // Guard against empty prompt sets
      if (totalPrompts === 0) {
        throw new Error("No prompts configured. Please add prompts in the settings first.");
      }
      
      // Step 2: Connect to SSE stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      const eventSource = new EventSource(`/api/monitoring/rescan-stream/${prepareId}`);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleStreamEvent(data);
          
          if (data.type === "complete" || data.type === "error") {
            eventSource.close();
            eventSourceRef.current = null;
          }
        } catch (e) {
          console.error("Failed to parse SSE event:", e);
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        toast({
          title: "Connection lost",
          description: "Lost connection to the scan. Please try again.",
          variant: "destructive",
        });
        setScanProgress(0);
        setScanStatus("Failed");
        setIsScanning(false);
      };
    } catch (error) {
      toast({
        title: "Error running scan",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setScanProgress(0);
      setScanStatus("Failed");
      setIsScanning(false);
    }
  };
  
  // Handle SSE events from rescan
  const handleStreamEvent = (event: {
    type: string;
    message?: string;
    progress?: number;
    groupName?: string;
    promptIndex?: number;
    totalPrompts?: number;
    promptText?: string;
    overallScore?: number;
  }) => {
    switch (event.type) {
      case "heartbeat":
        console.log("Rescan stream connected");
        break;
      case "status":
        setScanStatus(event.message || "");
        setScanSubStatus("");
        if (event.progress !== undefined) setScanProgress(event.progress);
        break;
      case "testing":
        setScanStatus(`Testing ${event.groupName}`);
        setScanSubStatus(event.promptText || "");
        if (event.progress !== undefined) setScanProgress(event.progress);
        break;
      case "prompt_complete":
        if (event.progress !== undefined) setScanProgress(event.progress);
        break;
      case "group_complete":
        break;
      case "complete":
        setScanProgress(100);
        setScanStatus("Scan Complete!");
        setScanSubStatus(`Overall Score: ${event.overallScore}%`);
        setIsScanning(false);
        toast({
          title: "Scan Complete",
          description: `New visibility data collected. Overall score: ${event.overallScore}%`,
        });
        // Refetch dashboard data to show new results
        queryClient.invalidateQueries({ queryKey: ["/api/monitoring/dashboard", clientId] });
        break;
      case "error":
        toast({
          title: "Scan Error",
          description: event.message || "Unknown error occurred",
          variant: "destructive",
        });
        setIsScanning(false);
        break;
    }
  };

  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/monitoring/dashboard", clientId],
    enabled: !!clientId,
  });

  // Fetch group trends when "groups" view is selected
  const { data: groupTrendsData } = useQuery<{ groupTrends: GroupTrendData[] }>({
    queryKey: ["/api/monitoring/trends/groups", clientId],
    enabled: !!clientId && trendView === "groups",
  });

  // Fetch competitor trends when "competitors" view is selected
  const { data: competitorTrendsData } = useQuery<{ competitorTrends: CompetitorTrendData[] }>({
    queryKey: ["/api/monitoring/trends/competitors", clientId],
    enabled: !!clientId && trendView === "competitors",
  });

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>No data found</p>
      </div>
    );
  }

  const { client, groups, sessions, latestResults, resultsByGroup, analytics, trendData } = data;

  // Calculate scores
  const latestSession = sessions[0];
  const previousSession = sessions[1];
  
  const overallScore = latestSession?.overallScore ?? 0;
  const chatgptScore = latestSession?.chatgptScore ?? 0;
  const googleAIScore = latestSession?.googleAIScore ?? 0;
  
  const scoreDelta = previousSession 
    ? overallScore - previousSession.overallScore 
    : 0;

  // Calculate visibility metrics
  // Each prompt is checked across 2 platforms, so total exposures = prompts × 2
  const promptCount = latestResults.length;
  const totalExposures = promptCount * 2;
  
  // Per-platform visibility metrics
  const chatgptFoundCount = latestResults.filter(r => r.chatgptFound).length;
  const googleAIFoundCount = latestResults.filter(r => r.googleAIFound).length;
  const chatgptCitedCount = latestResults.filter(r => r.chatgptCited).length;
  const googleAICitedCount = latestResults.filter(r => r.googleAICited).length;
  
  // Overall counts are sum of both platforms
  const foundCount = chatgptFoundCount + googleAIFoundCount;
  const citedCount = chatgptCitedCount + googleAICitedCount;
  
  // Visibility rate uses total exposures (prompts × 2 platforms)
  const visibilityRate = totalExposures > 0 ? Math.round((foundCount / totalExposures) * 100) : 0;
  const citationRate = totalExposures > 0 ? Math.round((citedCount / totalExposures) * 100) : 0;
  
  // Per-platform percentages use per-prompt basis (out of promptCount)
  const chatgptVisibility = promptCount > 0 ? Math.round((chatgptFoundCount / promptCount) * 100) : 0;
  const googleAIVisibility = promptCount > 0 ? Math.round((googleAIFoundCount / promptCount) * 100) : 0;
  
  // Calculate average rank across all results
  const chatgptRanks = latestResults.filter(r => r.chatgptRank != null).map(r => r.chatgptRank as number);
  const googleAIRanks = latestResults.filter(r => r.googleAIRank != null).map(r => r.googleAIRank as number);
  const allRanks = [...chatgptRanks, ...googleAIRanks];
  const avgRank = allRanks.length > 0 
    ? Math.round((allRanks.reduce((a, b) => a + b, 0) / allRanks.length) * 10) / 10
    : null;

  // Prepare chart data
  const sessionChartData = sessions.slice().reverse().map((session) => ({
    date: format(new Date(session.createdAt), "MMM d"),
    overall: session.overallScore,
    chatgpt: session.chatgptScore,
    googleAI: session.googleAIScore,
  }));

  // Prepare group trend chart data (merge all groups into a single dataset)
  const groupTrendChartData = (() => {
    if (!groupTrendsData?.groupTrends?.length) return [];
    // Collect all unique date timestamps across all groups (use ISO string for deduplication)
    const allDatesMap = new Map<string, Date>();
    groupTrendsData.groupTrends.forEach(g => {
      g.data.forEach(d => {
        if (d.date) {
          const dateObj = new Date(d.date);
          const isoKey = dateObj.toISOString();
          if (!allDatesMap.has(isoKey)) {
            allDatesMap.set(isoKey, dateObj);
          }
        }
      });
    });
    // Sort by actual date chronologically
    const sortedDates = Array.from(allDatesMap.entries())
      .sort((a, b) => a[1].getTime() - b[1].getTime());
    
    return sortedDates.map(([isoKey, dateObj]) => {
      const displayDate = format(dateObj, "MMM d");
      const point: Record<string, string | number> = { date: displayDate };
      groupTrendsData.groupTrends.forEach(g => {
        const match = g.data.find(d => d.date && new Date(d.date).toISOString() === isoKey);
        point[g.groupName] = match?.visibilityScore ?? 0;
      });
      return point;
    });
  })();

  // Prepare competitor trend chart data
  const competitorTrendChartData = (() => {
    if (!competitorTrendsData?.competitorTrends?.length) return [];
    // Collect all unique date timestamps across all competitors (use ISO string for deduplication)
    const allDatesMap = new Map<string, Date>();
    competitorTrendsData.competitorTrends.forEach(c => {
      c.data.forEach(d => {
        if (d.date) {
          const dateObj = new Date(d.date);
          const isoKey = dateObj.toISOString();
          if (!allDatesMap.has(isoKey)) {
            allDatesMap.set(isoKey, dateObj);
          }
        }
      });
    });
    // Sort by actual date chronologically
    const sortedDates = Array.from(allDatesMap.entries())
      .sort((a, b) => a[1].getTime() - b[1].getTime());
    
    return sortedDates.map(([isoKey, dateObj]) => {
      const displayDate = format(dateObj, "MMM d");
      const point: Record<string, string | number> = { date: displayDate };
      competitorTrendsData.competitorTrends.forEach(c => {
        const match = c.data.find(d => d.date && new Date(d.date).toISOString() === isoKey);
        point[c.competitorName] = match ? Math.round(match.visibilityPercent * 10) / 10 : 0;
      });
      return point;
    });
  })();

  // Colors for group/competitor lines
  const trendLineColors = [
    "#5599f9", "#ffb41c", "#22c55e", "#ef4444", "#8b5cf6", 
    "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"
  ];

  const groupBarData = resultsByGroup.map((g) => {
    const groupFoundCount = g.results.filter(r => r.chatgptFound || r.googleAIFound).length;
    const groupTotal = g.results.length;
    return {
      name: g.groupName.length > 15 ? g.groupName.slice(0, 15) + "..." : g.groupName,
      fullName: g.groupName,
      visibility: groupTotal > 0 ? Math.round((groupFoundCount / groupTotal) * 100) : 0,
      total: groupTotal,
    };
  });

  // Filter results by selected group
  const filteredResults = selectedGroup === "all"
    ? latestResults
    : latestResults.filter(r => r.groupId === parseInt(selectedGroup));

  return (
    <div className="min-h-screen bg-gray-50 selection:bg-[#5599f9] selection:text-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setLocation("/")} className="flex items-center gap-2" data-testid="link-home">
              <img src={logoIcon} alt="Rossman Media" className="w-8 h-8 rounded" />
              <span className="text-xl font-bold tracking-tight">
                <span className="text-gray-900">ROSSMAN</span>
                <span className="font-light text-gray-500">MEDIA</span>
              </span>
            </button>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-400" />
              <span className="font-medium text-gray-700">{client.businessName}</span>
            </div>
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
            <Button
              variant="outline"
              size="sm"
              onClick={runRescan}
              disabled={isScanning}
              className="flex items-center gap-2"
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "Scanning..." : "Run New Scan"}
            </Button>
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
          </div>
        </div>
      </header>

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
        {/* Scorecard Row */}
        <div className="grid md:grid-cols-4 gap-4">
          {/* Average Rank */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500">Avg Rank</p>
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
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500">Visibility Rate</p>
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
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500">Citation Rate</p>
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
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500">Next Check</p>
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
              <CardTitle className="text-lg font-bold tracking-tight">Visibility Trend</CardTitle>
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
              <CardTitle className="text-lg font-bold tracking-tight">Platform Visibility</CardTitle>
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

        {/* Analytics Row */}
        {analytics && (
          <div className="grid md:grid-cols-4 gap-4">
            {/* Share of Voice */}
            <Card className="shadow-2xl shadow-blue-900/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#5599f9]" />
                  <CardTitle className="text-sm font-bold tracking-tight">Share of Voice</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.shareOfVoice.length > 0 ? (
                  <div className="space-y-2">
                    {analytics.shareOfVoice
                      .slice(0, 5)
                      .map((item) => {
                        const isClient = item.name.toLowerCase() === client.businessName.toLowerCase();
                        return (
                          <div key={item.name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className={`truncate max-w-[120px] ${isClient ? "font-bold text-[#5599f9]" : "text-gray-700"}`}>
                                {isClient ? "You" : item.name}
                              </span>
                              <span className={`${isClient ? "font-bold text-[#5599f9]" : "text-gray-500"}`}>
                                {item.percentage}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${isClient ? "bg-[#5599f9]" : "bg-gray-300"}`}
                                style={{ width: `${Math.min(item.percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No competitor data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Top Citations */}
            <Card className="shadow-2xl shadow-blue-900/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#ffb41c]" />
                  <CardTitle className="text-sm font-bold tracking-tight">Top Citations</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.topCitations.length > 0 ? (
                  <div className="space-y-2">
                    {analytics.topCitations.slice(0, 5).map((citation: { domain: string; count: number }, index: number) => (
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
                  <CardTitle className="text-sm font-bold tracking-tight">Prominence</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Average Position</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {analytics.avgChatgptRank || analytics.avgGoogleAIRank 
                        ? Math.round(
                            ((analytics.avgChatgptRank || 0) + (analytics.avgGoogleAIRank || 0)) / 
                            ((analytics.avgChatgptRank ? 1 : 0) + (analytics.avgGoogleAIRank ? 1 : 0))
                          )
                        : "-"}
                    </span>
                    {(analytics.avgChatgptRank || analytics.avgGoogleAIRank) && (
                      <span className="text-sm text-gray-500">avg rank</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">First Choice</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold text-[#ffb41c]">{analytics.firstPlaceCount}</span>
                    <span className="text-sm text-gray-500">times ranked #1</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sentiment Score */}
            <Card className="shadow-2xl shadow-blue-900/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-500" />
                  <CardTitle className="text-sm font-bold tracking-tight">Sentiment Score</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.sentimentScore !== null ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className={`text-4xl font-bold ${
                        analytics.sentimentScore >= 70 ? 'text-green-500' : 
                        analytics.sentimentScore >= 40 ? 'text-[#ffb41c]' : 
                        'text-red-500'
                      }`}>
                        {analytics.sentimentScore}
                      </div>
                      <div className="flex-1">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              analytics.sentimentScore >= 70 ? 'bg-green-500' : 
                              analytics.sentimentScore >= 40 ? 'bg-[#ffb41c]' : 
                              'bg-red-500'
                            }`}
                            style={{ width: `${analytics.sentimentScore}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {analytics.sentimentScore >= 70 ? 'Positive perception' : 
                           analytics.sentimentScore >= 40 ? 'Mixed perception' : 
                           'Needs improvement'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3 text-green-500" />
                        <span>{analytics.sentimentBreakdown.positive}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Meh className="w-3 h-3 text-gray-400" />
                        <span>{analytics.sentimentBreakdown.neutral}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ThumbsDown className="w-3 h-3 text-red-500" />
                        <span>{analytics.sentimentBreakdown.negative}%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No sentiment data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Competitor Visibility + Sentiment Statements Row */}
        {analytics && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Competitor Visibility */}
            <Card className="shadow-2xl shadow-blue-900/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#5599f9]" />
                  <CardTitle className="text-sm font-bold tracking-tight">Competitor Visibility</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.competitorVisibility && analytics.competitorVisibility.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.competitorVisibility.map((competitor, index) => (
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
        )}

        {/* Key Sentiment Drivers - Two Column Layout (SEMRush Style) */}
        {analytics && (analytics.sentimentNarratives?.strengths?.length || analytics.sentimentNarratives?.improvements?.length) ? (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Meh className="w-5 h-5 text-[#ffb41c]" />
                <CardTitle className="text-lg font-bold tracking-tight">Key Sentiment Drivers</CardTitle>
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
                      analytics.sentimentNarratives.strengths.map((narrative, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 bg-green-50 border border-green-100 rounded-lg"
                          data-testid={`narrative-strength-${idx}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-gray-700 leading-relaxed flex-1">{narrative.text}</p>
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
                      analytics.sentimentNarratives.improvements.map((narrative, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 bg-amber-50 border border-amber-100 rounded-lg"
                          data-testid={`narrative-improvement-${idx}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-gray-700 leading-relaxed flex-1">{narrative.text}</p>
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

        {/* Detailed Results */}
        <Card className="shadow-2xl shadow-blue-900/5">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold tracking-tight">Prompt Results</CardTitle>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-48" data-testid="select-group-filter">
                <SelectValue placeholder="Filter by group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id.toString()}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {filteredResults.slice(0, displayLimit).map((result) => {
                const groupName = resultsByGroup.find(g => g.groupId === result.groupId)?.groupName;
                const isVisible = result.chatgptFound || result.googleAIFound;
                const isCited = result.chatgptCited || result.googleAICited;
                
                return (
                  <button 
                    key={result.id} 
                    className="w-full py-4 flex items-start gap-4 text-left hover-elevate rounded-lg transition-colors cursor-pointer"
                    onClick={() => setSelectedResult(result)}
                    data-testid={`button-result-${result.id}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isCited ? "bg-green-100" :
                      isVisible ? "bg-blue-100" :
                      "bg-red-100"
                    }`}>
                      {isCited ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
                       isVisible ? <Eye className="w-5 h-5 text-blue-600" /> :
                       <XCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-medium">{result.promptText}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant={groupName ? "secondary" : "outline"} className="text-xs">
                          {groupName || "Unknown Group"}
                        </Badge>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span className={result.chatgptFound ? "text-green-600" : "text-gray-400"}>
                            ChatGPT: {result.chatgptFound ? (result.chatgptCited ? "Cited" : "Found") : "Not found"}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className={result.googleAIFound ? "text-green-600" : "text-gray-400"}>
                            Google AI: {result.googleAIFound ? (result.googleAICited ? "Cited" : "Found") : "Not found"}
                          </span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-gray-400 ml-auto flex-shrink-0" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {filteredResults.length > displayLimit && (
              <div className="pt-4 text-center">
                <Button 
                  variant="outline" 
                  data-testid="button-load-more"
                  onClick={() => setDisplayLimit(prev => prev + 20)}
                >
                  Load More ({filteredResults.length - displayLimit} remaining)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Response Detail Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight">
              AI Response Details
            </DialogTitle>
          </DialogHeader>
          {selectedResult && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Prompt</p>
                <p className="text-gray-900">{selectedResult.promptText}</p>
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
                  <ScrollArea className="h-[350px] rounded-lg border p-4">
                    {selectedResult.chatgptResponse ? (
                      <div 
                        className="prose prose-sm max-w-none text-gray-700"
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
                  <ScrollArea className="h-[350px] rounded-lg border p-4">
                    {selectedResult.googleAIResponse ? (
                      <div 
                        className="prose prose-sm max-w-none text-gray-700"
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
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold tracking-tight">Export Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">
              Download your visibility data as a ZIP file. This export is formatted for use with AI assistants like Claude or ChatGPT to help optimize your website.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="export-start">Start Date</Label>
                <Input
                  id="export-start"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  data-testid="input-export-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-end">End Date</Label>
                <Input
                  id="export-end"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  data-testid="input-export-end-date"
                />
              </div>
            </div>
            <div className="text-xs text-gray-500">
              <p className="font-medium mb-1">Export includes:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>README with AI assistant instructions</li>
                <li>Summary of your visibility metrics</li>
                <li>ChatGPT results (prompts, responses, citations)</li>
                <li>Google AI results (prompts, responses, citations)</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} data-testid="button-cancel-export">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setIsExporting(true);
                try {
                  const url = `/api/monitoring/exports/${clientId}?startDate=${exportStartDate}&endDate=${exportEndDate}`;
                  const response = await fetch(url);
                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Export failed");
                  }
                  const blob = await response.blob();
                  const downloadUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = downloadUrl;
                  a.download = `visibility-export-${client.businessName.replace(/[^a-zA-Z0-9]/g, "-")}-${exportEndDate}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(downloadUrl);
                  setExportDialogOpen(false);
                } catch (error) {
                  console.error("Export error:", error);
                  alert(error instanceof Error ? error.message : "Export failed");
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
              className="flex items-center gap-2"
              data-testid="button-download-export"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? "Preparing..." : "Download ZIP"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
