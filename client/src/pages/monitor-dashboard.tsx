import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
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
  const [selectedResult, setSelectedResult] = useState<CheckResult | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/monitoring/dashboard", clientId],
    enabled: !!clientId,
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

  const platformPieData = [
    { name: "ChatGPT", value: chatgptScore, color: COLORS.primary },
    { name: "Google AI", value: googleAIScore, color: COLORS.accent },
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
              onClick={() => refetch()}
              disabled={isRefetching}
              className="flex items-center gap-2"
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
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

        {/* Platform Visibility Breakdown */}
        <Card className="shadow-2xl shadow-blue-900/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-8 flex-wrap">
              <p className="text-xs uppercase font-bold tracking-wider text-gray-500">Platform Visibility</p>
              <div className="flex items-center gap-6 flex-1">
                <div className="flex items-center gap-3" data-testid="stat-chatgpt-visibility">
                  <div className="w-3 h-3 rounded-full bg-[#5599f9]" />
                  <div>
                    <span className="text-2xl font-bold text-gray-900">{chatgptVisibility}%</span>
                    <span className="text-sm text-gray-500 ml-2">ChatGPT</span>
                  </div>
                  <span className="text-xs text-gray-400">({chatgptFoundCount}/{promptCount})</span>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex items-center gap-3" data-testid="stat-google-visibility">
                  <div className="w-3 h-3 rounded-full bg-[#ffb41c]" />
                  <div>
                    <span className="text-2xl font-bold text-gray-900">{googleAIVisibility}%</span>
                    <span className="text-sm text-gray-500 ml-2">Google AI</span>
                  </div>
                  <span className="text-xs text-gray-400">({googleAIFoundCount}/{promptCount})</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts Row */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Score Trend Chart */}
          <Card className="md:col-span-2 shadow-2xl shadow-blue-900/5">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg font-bold tracking-tight">Score Trend</CardTitle>
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
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Platform Breakdown */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold tracking-tight">Platform Scores</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={platformPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {platformPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-4">
                {platformPieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm text-gray-600">{entry.name}: {entry.value}</span>
                  </div>
                ))}
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

            {/* Sentiment Statements */}
            <Card className="shadow-2xl shadow-blue-900/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Meh className="w-4 h-4 text-[#ffb41c]" />
                  <CardTitle className="text-sm font-bold tracking-tight">What AI Says About You</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Tabs defaultValue="positive" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-3">
                    <TabsTrigger value="positive" className="text-xs" data-testid="tab-positive-sentiment">
                      <ThumbsUp className="w-3 h-3 mr-1" />
                      Positive ({analytics.sentimentStatements?.positive?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="negative" className="text-xs" data-testid="tab-negative-sentiment">
                      <ThumbsDown className="w-3 h-3 mr-1" />
                      Negative ({analytics.sentimentStatements?.negative?.length || 0})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="positive" className="mt-0">
                    <ScrollArea className="h-48">
                      {analytics.sentimentStatements?.positive?.length > 0 ? (
                        <div className="space-y-2 pr-4">
                          {analytics.sentimentStatements.positive.map((statement, idx) => (
                            <div key={idx} className="p-2 bg-green-50 border border-green-100 rounded-lg">
                              <p className="text-xs text-gray-700 leading-relaxed">"{statement.text}"</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px] px-1">
                                  {statement.platform === 'chatgpt' ? 'ChatGPT' : 'Google AI'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No positive statements found</p>
                      )}
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="negative" className="mt-0">
                    <ScrollArea className="h-48">
                      {analytics.sentimentStatements?.negative?.length > 0 ? (
                        <div className="space-y-2 pr-4">
                          {analytics.sentimentStatements.negative.map((statement, idx) => (
                            <div key={idx} className="p-2 bg-red-50 border border-red-100 rounded-lg">
                              <p className="text-xs text-gray-700 leading-relaxed">"{statement.text}"</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px] px-1">
                                  {statement.platform === 'chatgpt' ? 'ChatGPT' : 'Google AI'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No negative statements found</p>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

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
              {filteredResults.slice(0, 20).map((result) => {
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
            
            {filteredResults.length > 20 && (
              <div className="pt-4 text-center">
                <Button variant="outline" data-testid="button-load-more">
                  Load More ({filteredResults.length - 20} remaining)
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
                
                <TabsContent value="chatgpt" className="mt-4">
                  <ScrollArea className="h-[400px] rounded-lg border p-4">
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
                </TabsContent>
                
                <TabsContent value="googleai" className="mt-4">
                  <ScrollArea className="h-[400px] rounded-lg border p-4">
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
