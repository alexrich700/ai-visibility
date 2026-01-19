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
  Users, Link2, Award, ThumbsUp, ThumbsDown, Meh, ExternalLink, Download, HelpCircle, AlertTriangle
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
  resultsByGroup: { groupId: number; groupName: string; promptCategory: string; results: CheckResult[] }[];
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

// Helper functions to recalculate analytics from city-filtered results
function computeCompetitorVisibility(results: CheckResult[], businessName: string): CompetitorVisibility[] {
  const competitorCounts: Record<string, number> = {};
  const totalPrompts = results.length;
  
  results.forEach(result => {
    if (result.competitors) {
      try {
        const competitors = JSON.parse(result.competitors);
        if (Array.isArray(competitors)) {
          competitors.forEach((comp: string) => {
            const normalizedComp = comp.trim();
            if (normalizedComp && normalizedComp.toLowerCase() !== businessName.toLowerCase()) {
              competitorCounts[normalizedComp] = (competitorCounts[normalizedComp] || 0) + 1;
            }
          });
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  });
  
  return Object.entries(competitorCounts)
    .map(([name, mentionCount]) => ({
      name,
      mentionCount,
      visibilityPercent: totalPrompts > 0 ? Math.round((mentionCount / totalPrompts) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.visibilityPercent - a.visibilityPercent)
    .slice(0, 5);
}

function computeShareOfVoice(results: CheckResult[], businessName: string): ShareOfVoiceItem[] {
  const totalPrompts = results.length;
  if (totalPrompts === 0) return [];
  
  // Count brand mentions
  const brandMentions = results.filter(r => r.chatgptFound || r.googleAIFound).length;
  
  // Count competitor mentions
  const competitorCounts: Record<string, number> = {};
  results.forEach(result => {
    if (result.competitors) {
      try {
        const competitors = JSON.parse(result.competitors);
        if (Array.isArray(competitors)) {
          competitors.forEach((comp: string) => {
            const normalizedComp = comp.trim();
            if (normalizedComp && normalizedComp.toLowerCase() !== businessName.toLowerCase()) {
              competitorCounts[normalizedComp] = (competitorCounts[normalizedComp] || 0) + 1;
            }
          });
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  });
  
  // Calculate total mentions
  const competitorTotalMentions = Object.values(competitorCounts).reduce((sum, c) => sum + c, 0);
  const totalMentions = brandMentions + competitorTotalMentions;
  
  if (totalMentions === 0) return [];
  
  // Build share of voice array
  const shareOfVoice: ShareOfVoiceItem[] = [
    {
      name: businessName,
      mentionCount: brandMentions,
      percentage: Math.round((brandMentions / totalMentions) * 100)
    }
  ];
  
  // Add top competitors
  Object.entries(competitorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([name, count]) => {
      shareOfVoice.push({
        name,
        mentionCount: count,
        percentage: Math.round((count / totalMentions) * 100)
      });
    });
  
  return shareOfVoice;
}

function computeTopCitations(results: CheckResult[]): Citation[] {
  const citationCounts: Record<string, number> = {};
  
  // Filter out internal Google redirect URLs and other non-meaningful domains
  const excludedDomains = [
    'vertexaisearch.cloud.google.com',
    'grounding-api-redirect',
  ];
  
  const isDomainExcluded = (domain: string): boolean => {
    return excludedDomains.some(excluded => domain.includes(excluded));
  };
  
  results.forEach(result => {
    // Process ChatGPT citations
    if (result.chatgptCitations) {
      try {
        const citations = result.chatgptCitations as { url?: string; domain?: string }[];
        if (Array.isArray(citations)) {
          citations.forEach((cit) => {
            const domain = cit.domain || (cit.url ? new URL(cit.url).hostname : null);
            if (domain && !isDomainExcluded(domain)) {
              citationCounts[domain] = (citationCounts[domain] || 0) + 1;
            }
          });
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
    
    // Process Google AI citations
    if (result.googleAICitations) {
      try {
        const citations = result.googleAICitations as { url?: string; domain?: string }[];
        if (Array.isArray(citations)) {
          citations.forEach((cit) => {
            const domain = cit.domain || (cit.url ? new URL(cit.url).hostname : null);
            if (domain && !isDomainExcluded(domain)) {
              citationCounts[domain] = (citationCounts[domain] || 0) + 1;
            }
          });
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  });
  
  return Object.entries(citationCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function computeFirstPlaceCount(results: CheckResult[]): number {
  let count = 0;
  results.forEach(result => {
    if (result.chatgptRank === 1) count++;
    if (result.googleAIRank === 1) count++;
  });
  return count;
}

export default function MonitorDashboard() {
  const [, params] = useRoute("/monitor/dashboard/:id");
  const [, setLocation] = useLocation();
  const clientId = params?.id ? parseInt(params.id) : null;
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("30");
  const [trendView, setTrendView] = useState<"overall" | "groups" | "competitors">("overall");
  const [selectedViewCity, setSelectedViewCity] = useState<string>("all"); // Filter dashboard view by city
  const [selectedResult, setSelectedResult] = useState<CheckResult | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedExportDate, setSelectedExportDate] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  
  // Rescan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [scanSubStatus, setScanSubStatus] = useState("");
  const [selectedScanCity, setSelectedScanCity] = useState<string>("all"); // Selected city for next scan
  const [currentScanCityIndex, setCurrentScanCityIndex] = useState(0); // Multi-city: current city index
  const [totalScanCities, setTotalScanCities] = useState(0); // Multi-city: total cities to scan
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeSessionIdRef = useRef<number | null>(null); // Track session for resume
  const isScanningRef = useRef(false); // Ref to track scanning state for async operations
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track retry timeout for cleanup
  const isMountedRef = useRef(true); // Track mount state
  const maxReconnectAttempts = 5;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Cleanup EventSource and retries on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);
  
  // Function to attempt resuming a paused scan
  const attemptResume = (sessionId: number, attempt: number) => {
    // Guard: stop if unmounted, scan cancelled, or max attempts reached
    if (!isMountedRef.current || !isScanningRef.current) {
      return;
    }
    
    if (!sessionId || attempt >= maxReconnectAttempts) {
      if (isMountedRef.current) {
        toast({
          title: "Connection lost",
          description: "Unable to resume scan after multiple attempts. Your progress has been saved - try resuming later.",
          variant: "destructive",
        });
        isScanningRef.current = false;
        setIsScanning(false);
        setScanStatus("Paused - connection lost");
        // Refetch to show partial results
        queryClient.invalidateQueries({ queryKey: ["/api/monitoring/dashboard", clientId] });
      }
      return;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.pow(2, attempt) * 1000;
    if (isMountedRef.current) {
      setScanStatus(`Connection lost - reconnecting in ${delay/1000}s... (attempt ${attempt + 1}/${maxReconnectAttempts})`);
    }
    
    // Clear any previous timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    retryTimeoutRef.current = setTimeout(() => {
      // Guard again after delay
      if (!isMountedRef.current || !isScanningRef.current) {
        return;
      }
      
      if (isMountedRef.current) {
        setScanStatus(`Reconnecting to scan...`);
      }
      
      try {
        // Close any existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        
        // Connect to resume stream
        const eventSource = new EventSource(`/api/monitoring/resume-stream/${sessionId}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onmessage = (event) => {
          if (!isMountedRef.current) return;
          
          try {
            const data = JSON.parse(event.data);
            
            // Extract sessionId from complete event if available
            if (data.type === "complete" && data.sessionId) {
              activeSessionIdRef.current = data.sessionId;
            }
            
            handleStreamEvent(data);
            
            if (data.type === "complete" || data.type === "error") {
              eventSource.close();
              eventSourceRef.current = null;
              activeSessionIdRef.current = null;
              isScanningRef.current = false;
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e);
          }
        };
        
        eventSource.onerror = () => {
          eventSource.close();
          eventSourceRef.current = null;
          // Attempt to resume with incremented attempt count
          attemptResume(sessionId, attempt + 1);
        };
      } catch (error) {
        console.error("Resume attempt failed:", error);
        attemptResume(sessionId, attempt + 1);
      }
    }, delay);
  };
  
  // Run a single city scan - returns Promise that resolves when complete
  const runSingleCityRescan = (targetCity: string | undefined, cityIndex: number, totalCities: number): Promise<{ overallScore: number }> => {
    return new Promise((resolve, reject) => {
      setCurrentScanCityIndex(cityIndex);
      setTotalScanCities(totalCities);
      
      const prepareScan = async () => {
        try {
          const prepareResponse = await fetch(`/api/monitoring/rescan-prepare/${clientId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetCity }),
          });
          
          if (!prepareResponse.ok) {
            let errorMessage = "Failed to prepare scan";
            try {
              const errorData = await prepareResponse.json();
              errorMessage = errorData.details || errorData.error || errorMessage;
            } catch {
              errorMessage = prepareResponse.statusText || errorMessage;
            }
            throw new Error(errorMessage);
          }
          
          const { prepareId, totalPrompts } = await prepareResponse.json();
          
          if (totalPrompts === 0) {
            throw new Error("No prompts configured. Please add prompts in the settings first.");
          }
          
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
          
          const eventSource = new EventSource(`/api/monitoring/rescan-stream/${prepareId}`);
          eventSourceRef.current = eventSource;
          
          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              if (data.sessionId && typeof data.sessionId === 'number') {
                activeSessionIdRef.current = data.sessionId;
              }
              
              // Handle events for this city scan
              switch (data.type) {
                case "heartbeat":
                  break;
                case "session_created":
                  if (data.sessionId) {
                    activeSessionIdRef.current = data.sessionId;
                  }
                  break;
                case "status":
                  setScanStatus(data.message || "");
                  setScanSubStatus("");
                  if (data.progress !== undefined) {
                    const cityProgress = data.progress;
                    const overallProgress = Math.round(((cityIndex - 1) / totalCities) * 100 + (cityProgress / totalCities));
                    setScanProgress(overallProgress);
                  }
                  break;
                case "testing":
                  setScanStatus(`Testing ${data.groupName}`);
                  setScanSubStatus(data.promptText || "");
                  if (data.progress !== undefined) {
                    const cityProgress = data.progress;
                    const overallProgress = Math.round(((cityIndex - 1) / totalCities) * 100 + (cityProgress / totalCities));
                    setScanProgress(overallProgress);
                  }
                  break;
                case "prompt_complete":
                  if (data.progress !== undefined) {
                    const cityProgress = data.progress;
                    const overallProgress = Math.round(((cityIndex - 1) / totalCities) * 100 + (cityProgress / totalCities));
                    setScanProgress(overallProgress);
                  }
                  break;
                case "group_complete":
                  break;
                case "complete":
                  eventSource.close();
                  eventSourceRef.current = null;
                  activeSessionIdRef.current = null;
                  resolve({ overallScore: data.overallScore || 0 });
                  break;
                case "error":
                  eventSource.close();
                  eventSourceRef.current = null;
                  activeSessionIdRef.current = null;
                  reject(new Error(data.message || "Scan error"));
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
          };
          
          eventSource.onerror = () => {
            eventSource.close();
            eventSourceRef.current = null;
            activeSessionIdRef.current = null;
            // For multi-city scans, connection loss fails the current city
            // User can retry the scan for remaining cities
            reject(new Error("Connection lost during scan. Please try again."));
          };
        } catch (error) {
          reject(error);
        }
      };
      
      prepareScan();
    });
  };
  
  // Function to run a fresh scan (supports all cities or single city)
  const runRescan = async () => {
    if (!clientId || !data) return;
    
    // Clear any pending retry timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    isScanningRef.current = true;
    setIsScanning(true);
    setScanProgress(0);
    setScanStatus("Preparing scan...");
    setScanSubStatus("");
    
    try {
      // Determine which cities to scan
      // If "all" selected and client has multiple cities, scan all of them
      // Otherwise scan the single selected city (or undefined for national/single-city clients)
      let citiesToScan: (string | undefined)[];
      if (selectedScanCity === "all") {
        if (data.client.cities && data.client.cities.length > 0) {
          citiesToScan = data.client.cities;
        } else if (data.client.city) {
          citiesToScan = [data.client.city];
        } else {
          citiesToScan = [undefined]; // National scope or no city configured
        }
      } else {
        citiesToScan = [selectedScanCity];
      }
      
      const totalCities = citiesToScan.length;
      let totalScore = 0;
      
      // Scan each city sequentially with individual error handling
      const cityResults: { city: string | undefined; success: boolean; score: number }[] = [];
      
      for (let i = 0; i < citiesToScan.length; i++) {
        const targetCity = citiesToScan[i];
        const cityIndex = i + 1;
        
        // Update status to show which city we're scanning
        if (totalCities > 1 && targetCity) {
          setScanStatus(`Scanning ${targetCity} (${cityIndex}/${totalCities})`);
        }
        
        try {
          const result = await runSingleCityRescan(targetCity, cityIndex, totalCities);
          totalScore += result.overallScore;
          cityResults.push({ city: targetCity, success: true, score: result.overallScore });
        } catch (cityError) {
          // Log error but continue to next city
          console.error(`Scan failed for city ${targetCity}:`, cityError);
          cityResults.push({ city: targetCity, success: false, score: 0 });
          // Brief pause before next city to avoid rapid reconnection
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Check if any cities failed
      const failedCities = cityResults.filter(r => !r.success);
      const successCities = cityResults.filter(r => r.success);
      
      if (failedCities.length > 0 && failedCities.length < totalCities) {
        // Some cities failed, some succeeded - show partial success message
        toast({
          title: "Partial Scan Complete",
          description: `${successCities.length}/${totalCities} cities scanned successfully. Failed: ${failedCities.map(c => c.city || 'National').join(', ')}`,
          variant: "default",
        });
      } else if (failedCities.length === totalCities) {
        // All cities failed - throw error to trigger the catch block
        throw new Error("All city scans failed. Please check your connection and try again.");
      }
      
      // All cities scanned (or at least some succeeded)
      setScanProgress(100);
      setScanStatus(failedCities.length > 0 ? "Scan Partially Complete" : "Scan Complete!");
      // Calculate average score only from successful cities
      const avgScore = successCities.length > 0 ? Math.round(totalScore / successCities.length) : 0;
      setScanSubStatus(successCities.length > 1 
        ? `Scanned ${successCities.length} cities. Average Score: ${avgScore}%`
        : `Overall Score: ${avgScore}%`
      );
      isScanningRef.current = false;
      setIsScanning(false);
      setCurrentScanCityIndex(0);
      setTotalScanCities(0);
      
      // Refresh data after a short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/monitoring/dashboard", clientId] });
      }, 1000);
      
    } catch (error) {
      toast({
        title: "Error running scan",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      isScanningRef.current = false;
      setScanProgress(0);
      setScanStatus("Failed");
      setIsScanning(false);
      setCurrentScanCityIndex(0);
      setTotalScanCities(0);
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
    sessionId?: number;
    clientId?: number;
  }) => {
    switch (event.type) {
      case "heartbeat":
        console.log("Rescan stream connected");
        break;
      case "session_created":
        // Capture sessionId for potential resume on disconnect
        if (event.sessionId) {
          activeSessionIdRef.current = event.sessionId;
          console.log(`Scan session created: ${event.sessionId}`);
        }
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
        isScanningRef.current = false;
        activeSessionIdRef.current = null;
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
        isScanningRef.current = false;
        activeSessionIdRef.current = null;
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

  // Fetch available scan dates for export dropdown
  const { data: scanDatesData } = useQuery<{ scanDates: { date: string; cities: string[]; sessionIds: number[] }[] }>({
    queryKey: ["/api/monitoring/scan-dates", clientId],
    enabled: !!clientId && exportDialogOpen,
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

  // Check if a specific city is selected (not "all")
  const isSpecificCitySelected = selectedViewCity && selectedViewCity !== "all";
  
  // Filter sessions by selected city if multi-city client and city is selected
  const filteredSessions = isSpecificCitySelected
    ? sessions.filter(s => (s as any).city === selectedViewCity)
    : sessions;

  // Track if the selected city has no scan data yet
  const selectedCityHasNoData = isSpecificCitySelected && filteredSessions.length === 0;

  // Calculate scores - use filtered sessions
  const latestSession = filteredSessions[0];
  const previousSession = filteredSessions[1];
  
  // For "All Cities" mode, aggregate scores from latest session per city
  // Get unique cities and their latest sessions for aggregation
  // Sort sessions by createdAt desc first to ensure we get the latest per city
  const sortedSessions = [...sessions].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latestSessionPerCity = isSpecificCitySelected ? null : (() => {
    const citySessionMap = new Map<string | null, typeof sessions[0]>();
    for (const session of sortedSessions) {
      const city = (session as any).city || null;
      if (!citySessionMap.has(city)) {
        citySessionMap.set(city, session);
      }
    }
    return Array.from(citySessionMap.values());
  })();
  
  // Calculate aggregated scores for "All Cities" mode
  const aggregatedScores = latestSessionPerCity && latestSessionPerCity.length > 0 ? {
    overallScore: Math.round(latestSessionPerCity.reduce((sum, s) => sum + (s.overallScore || 0), 0) / latestSessionPerCity.length),
    chatgptScore: Math.round(latestSessionPerCity.reduce((sum, s) => sum + (s.chatgptScore || 0), 0) / latestSessionPerCity.length),
    googleAIScore: Math.round(latestSessionPerCity.reduce((sum, s) => sum + (s.googleAIScore || 0), 0) / latestSessionPerCity.length),
  } : null;
  
  // Filter latestResults to only include results from the selected city's session
  // IMPORTANT: When a specific city is selected but has no sessions, return empty array (not all results)
  const cityFilteredResults = isSpecificCitySelected
    ? (latestSession ? latestResults.filter(r => r.sessionId === latestSession.id) : [])
    : latestResults;
  
  // Filter resultsByGroup similarly for city filtering
  // When a specific city is selected but has no sessions, return empty array
  const cityFilteredResultsByGroup = isSpecificCitySelected
    ? (latestSession 
        ? resultsByGroup.map(g => ({
            ...g,
            results: g.results.filter(r => r.sessionId === latestSession.id)
          })).filter(g => g.results.length > 0)
        : [])
    : resultsByGroup;
  
  // Separate brand sentiment groups from service groups
  // Brand sentiment prompts are excluded from visibility metrics and shown in a dedicated section
  const brandSentimentGroupIds = new Set(
    resultsByGroup
      .filter(g => g.promptCategory === 'brand_sentiment')
      .map(g => g.groupId)
  );
  
  // Filter out brand sentiment results from visibility calculations
  const serviceResultsOnly = cityFilteredResults.filter(r => !brandSentimentGroupIds.has(r.groupId));
  const serviceResultsByGroup = cityFilteredResultsByGroup.filter(g => g.promptCategory !== 'brand_sentiment');
  
  // Get brand sentiment results separately for the dedicated section
  const brandSentimentResults = cityFilteredResults.filter(r => brandSentimentGroupIds.has(r.groupId));
  const brandSentimentGroups = cityFilteredResultsByGroup.filter(g => g.promptCategory === 'brand_sentiment');
  
  // Use aggregated scores for "All Cities" mode, otherwise use single session scores
  const overallScore = aggregatedScores?.overallScore ?? latestSession?.overallScore ?? 0;
  const chatgptScore = aggregatedScores?.chatgptScore ?? latestSession?.chatgptScore ?? 0;
  const googleAIScore = aggregatedScores?.googleAIScore ?? latestSession?.googleAIScore ?? 0;
  
  const scoreDelta = previousSession 
    ? (latestSession?.overallScore ?? 0) - previousSession.overallScore 
    : 0;

  // Calculate visibility metrics from service results only (excluding brand sentiment)
  // Each prompt is checked across 2 platforms, so total exposures = prompts × 2
  const promptCount = serviceResultsOnly.length;
  const totalExposures = promptCount * 2;
  
  // Per-platform visibility metrics (service prompts only)
  const chatgptFoundCount = serviceResultsOnly.filter(r => r.chatgptFound).length;
  const googleAIFoundCount = serviceResultsOnly.filter(r => r.googleAIFound).length;
  const chatgptCitedCount = serviceResultsOnly.filter(r => r.chatgptCited).length;
  const googleAICitedCount = serviceResultsOnly.filter(r => r.googleAICited).length;
  
  // Overall counts are sum of both platforms
  const foundCount = chatgptFoundCount + googleAIFoundCount;
  const citedCount = chatgptCitedCount + googleAICitedCount;
  
  // Visibility rate uses total exposures (prompts × 2 platforms)
  const visibilityRate = totalExposures > 0 ? Math.round((foundCount / totalExposures) * 100) : 0;
  const citationRate = totalExposures > 0 ? Math.round((citedCount / totalExposures) * 100) : 0;
  
  // Per-platform percentages use per-prompt basis (out of promptCount)
  const chatgptVisibility = promptCount > 0 ? Math.round((chatgptFoundCount / promptCount) * 100) : 0;
  const googleAIVisibility = promptCount > 0 ? Math.round((googleAIFoundCount / promptCount) * 100) : 0;
  
  // Calculate average rank across service results only (excluding brand sentiment)
  const chatgptRanks = serviceResultsOnly.filter(r => r.chatgptRank != null).map(r => r.chatgptRank as number);
  const googleAIRanks = serviceResultsOnly.filter(r => r.googleAIRank != null).map(r => r.googleAIRank as number);
  const allRanks = [...chatgptRanks, ...googleAIRanks];
  const avgRank = allRanks.length > 0 
    ? Math.round((allRanks.reduce((a, b) => a + b, 0) / allRanks.length) * 10) / 10
    : null;
  
  // Recalculate analytics from city-filtered results instead of using API analytics
  // Use serviceResultsOnly for competitor/share-of-voice/citations (excluding brand sentiment)
  const computedCompetitorVisibility = computeCompetitorVisibility(serviceResultsOnly, client.businessName);
  const computedShareOfVoice = computeShareOfVoice(serviceResultsOnly, client.businessName);
  const computedTopCitations = computeTopCitations(serviceResultsOnly);
  // Calculate first place count from service results for prominence metric
  const firstPlaceCount = computeFirstPlaceCount(serviceResultsOnly);

  // Prepare chart data - use filtered sessions
  const sessionChartData = filteredSessions.slice().reverse().map((session) => ({
    date: format(new Date(session.createdAt), "MMM d"),
    overall: session.overallScore,
    chatgpt: session.chatgptScore,
    googleAI: session.googleAIScore,
    city: (session as any).city || null, // Include city info for reference
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

  // Use service groups only for visibility bar chart (excludes brand sentiment)
  const groupBarData = serviceResultsByGroup.map((g) => {
    const groupFoundCount = g.results.filter(r => r.chatgptFound || r.googleAIFound).length;
    const groupTotal = g.results.length;
    return {
      name: g.groupName.length > 15 ? g.groupName.slice(0, 15) + "..." : g.groupName,
      fullName: g.groupName,
      visibility: groupTotal > 0 ? Math.round((groupFoundCount / groupTotal) * 100) : 0,
      total: groupTotal,
    };
  });

  // Filter results by selected group (applied on top of city filtering)
  // Use service results only for Prompt Results section (excludes brand sentiment)
  const filteredResults = selectedGroup === "all"
    ? serviceResultsOnly
    : serviceResultsOnly.filter(r => r.groupId === parseInt(selectedGroup));

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
            {/* City selector for multi-city businesses */}
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

        {/* Detailed Results */}
        <Card className="shadow-2xl shadow-blue-900/5">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold tracking-tight">Prompt Results</CardTitle>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-48" data-testid="select-group-filter">
                <SelectValue placeholder="Filter by group" />
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
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {filteredResults.slice(0, displayLimit).map((result) => {
                const groupName = serviceResultsByGroup.find(g => g.groupId === result.groupId)?.groupName || resultsByGroup.find(g => g.groupId === result.groupId)?.groupName;
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
              <Select value={selectedExportDate} onValueChange={setSelectedExportDate}>
                <SelectTrigger className="w-full" data-testid="select-export-scan-date">
                  <SelectValue placeholder="Choose a scan date..." />
                </SelectTrigger>
                <SelectContent>
                  {scanDatesData?.scanDates && scanDatesData.scanDates.length > 0 ? (
                    scanDatesData.scanDates.map((scanDate) => (
                      <SelectItem key={scanDate.date} value={scanDate.date}>
                        {format(new Date(scanDate.date + "T12:00:00"), "MMMM d, yyyy")}
                        {scanDate.cities.length > 0 && (
                          <span className="text-gray-400 ml-2">
                            ({scanDate.cities.join(", ")})
                          </span>
                        )}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>No scans available</SelectItem>
                  )}
                </SelectContent>
              </Select>
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
                  const response = await fetch(url);
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
