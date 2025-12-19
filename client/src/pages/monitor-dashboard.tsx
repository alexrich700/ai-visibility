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
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, TrendingDown, Eye, Target, Calendar, Clock, Settings,
  ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle, Minus, Building2
} from "lucide-react";
import { format } from "date-fns";
import logoIcon from "@assets/images_1765741951084.png";
import type { MonitoringClient, MonitoringGroup, CheckSession, CheckResult } from "@shared/schema";

interface DashboardData {
  client: MonitoringClient;
  groups: MonitoringGroup[];
  sessions: CheckSession[];
  latestResults: CheckResult[];
  resultsByGroup: { groupId: number; groupName: string; results: CheckResult[] }[];
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

  const { client, groups, sessions, latestResults, resultsByGroup } = data;

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
  const totalPrompts = latestResults.length;
  const foundCount = latestResults.filter(r => r.chatgptFound || r.googleAIFound).length;
  const citedCount = latestResults.filter(r => r.chatgptCited || r.googleAICited).length;
  
  const visibilityRate = totalPrompts > 0 ? Math.round((foundCount / totalPrompts) * 100) : 0;
  const citationRate = totalPrompts > 0 ? Math.round((citedCount / totalPrompts) * 100) : 0;

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
          {/* Overall Score */}
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-gray-500">Overall Score</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-bold text-gray-900">{overallScore}</span>
                    <span className="text-xl text-gray-400">/100</span>
                  </div>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${
                  scoreDelta > 0 ? "bg-green-100 text-green-700" :
                  scoreDelta < 0 ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-500"
                }`}>
                  {scoreDelta > 0 ? <TrendingUp className="w-4 h-4" /> :
                   scoreDelta < 0 ? <TrendingDown className="w-4 h-4" /> :
                   <Minus className="w-4 h-4" />}
                  {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                </div>
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
                  <p className="text-sm text-gray-500 mt-1">{foundCount} of {totalPrompts} prompts</p>
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
                  <div key={result.id} className="py-4 flex items-start gap-4">
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
                      <div className="flex items-center gap-4 mt-2">
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
                      </div>
                    </div>
                  </div>
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
    </div>
  );
}
