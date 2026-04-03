import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useRoute, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getAdminQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft, Share2, Presentation, ChevronLeft, ChevronRight,
  X, Loader2, MapPin, Target, Shield, FileText, Link2,
  Star, DollarSign, AlertTriangle, CheckCircle, XCircle, Search, Eye,
  ChevronDown, ChevronUp, Zap, Award, Check, TrendingUp,
  Cpu, Clock, Globe, Users,
} from "lucide-react";
import { format } from "date-fns";
import logoIcon from "@assets/BBM-Primary-Logo-300x69_1775234014796.png";

interface AuditRecord {
  id: number;
  businessName: string;
  websiteUrl: string;
  createdAt: string;
  marketPositionScore: number | null;
  siteHealthGrade: string | null;
  shareOfLocalVoice: number | null;
}

interface CompetitorProfile {
  businessName: string;
  domain: string;
  domainRating: number | null;
  organicKeywords: number | null;
  monthlyTraffic: number | null;
  referringDomains: number | null;
  totalReviews: number | null;
  averageRating: number | null;
  backlinkSummary: string | null;
  topBacklinks: Array<string | { url?: string; domain?: string }>;
  reviewVelocity?: number;
}

interface SnapshotData {
  marketPositionScore: number;
  siteHealthGrade: string;
  shareOfLocalVoice: number;
  totalKeywordGaps: number;
  totalContentGaps: number;
  clientDR: number;
  clientOrganicKeywords: number;
  clientMonthlyTraffic: number;
  clientTotalReviews: number;
  clientAverageRating: number;
}

interface GeoGridSummary {
  keyword: string;
  clientSolv: number;
  clientAvgRank: number | null;
  competitorName: string | null;
  competitorSolv: number;
}

interface GeoGridData {
  grids: GeoGridSummary[];
}

interface GridPoint {
  lat: number;
  lng: number;
  clientRank: number | null;
  competitorRank: number | null;
  localPackResults?: Array<{ name?: string; title?: string }>;
}

interface GeoGridPointsData {
  points: GridPoint[];
}

interface GeoVisData {
  aiVisibilityScore: number;
  totalChecked: number;
  overallVisibility: number;
  chatGptVisibility: number;
  geminiVisibility: number;
  foundInChatGpt: number;
  citedInChatGpt: number;
  foundInGemini: number;
  citedInGemini: number;
  gapsByService?: Array<{ service: string; found: boolean; platform: string }>;
}

interface KeywordEntry {
  keyword: string;
  targetCity: string;
  targetService: string;
  currentOrganicRank: number | null;
  searchVolume: number | null;
  inAiOverview: boolean;
  pageType: string;
  intent: string;
  competitorRanks: Record<string, number> | null;
}

interface RankingsData {
  keywords: KeywordEntry[];
  totalTracked: number;
  page1Count: number;
  page2Count: number;
  aiOverviewCount: number;
}

interface ForecastEntry {
  keyword: string;
  searchVolume: number;
  estimatedClicks: number;
  estimatedCpc: number;
  estimatedCost: number;
}

interface RevenueData {
  summary: {
    totalClicks: number;
    totalCost: number;
    avgCpc: number;
    totalConversions: number;
    estimatedLeads: number;
    estimatedRevenue: number;
  };
  forecasts: ForecastEntry[];
}

interface TechnicalFinding {
  category: string;
  checkName: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

interface TechnicalData {
  grade: string;
  findings: TechnicalFinding[];
  totalChecks: number;
  passCount: number;
  failCount: number;
  passRate: number;
}

interface ContentGap {
  gapType: string;
  service?: string;
  city?: string;
  exists: boolean;
  suggestedTitle: string;
  targetKeyword: string;
}

interface ContentGapsData {
  totalGaps: number;
  byType: Record<string, number>;
  gaps: ContentGap[];
}

interface BacklinksData {
  competitors: CompetitorProfile[];
}

interface ReviewClient {
  totalReviews: number;
  averageRating: number;
  reviewVelocity: number;
  platformBreakdown: Record<string, { count: number; rating: number } | number>;
  sentimentSummary: string;
}

interface ReviewsData {
  client: ReviewClient | null;
  competitors: Array<{
    businessName: string;
    totalReviews: number;
    averageRating: number;
    reviewVelocity?: number;
  }>;
}

interface Deliverable {
  title: string;
  description?: string;
  priority?: string;
  estimatedHours?: number;
}

interface ActionPlanData {
  totalDeliverables: number;
  estimatedTotalHours: number;
  estimatedMonthlyInvestment: number;
  executiveNarrative: string;
  phases: Record<string, Deliverable[]>;
  deliverables: Deliverable[];
}

type SectionDataMap = {
  snapshot: SnapshotData | undefined;
  geogrid: GeoGridData | undefined;
  geo_visibility: GeoVisData | undefined;
  rankings: RankingsData | undefined;
  revenue: RevenueData | undefined;
  technical: TechnicalData | undefined;
  content_gaps: ContentGapsData | undefined;
  backlinks: BacklinksData | undefined;
  reviews: ReviewsData | undefined;
  action_plan: ActionPlanData | undefined;
};

const SECTIONS = [
  { id: "snapshot", label: "Competitive Snapshot", icon: Target },
  { id: "geogrid", label: "Geo Grid", icon: MapPin },
  { id: "geo_visibility", label: "AI/GEO Visibility", icon: Eye },
  { id: "rankings", label: "Keyword Rankings", icon: Search },
  { id: "revenue", label: "Revenue Opportunity", icon: DollarSign },
  { id: "technical", label: "Site Health", icon: Shield },
  { id: "content_gaps", label: "Content Gaps", icon: FileText },
  { id: "backlinks", label: "Backlinks", icon: Link2 },
  { id: "reviews", label: "Review Health", icon: Star },
  { id: "action_plan", label: "Investment & Plan", icon: Zap },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

const RANK_COLOR = (rank: number | null) => {
  if (rank === null) return "bg-muted text-gray-400";
  if (rank <= 3) return "bg-green-100 text-green-700";
  if (rank <= 7) return "bg-yellow-100 text-yellow-700";
  if (rank <= 10) return "bg-orange-100 text-orange-700";
  if (rank <= 20) return "bg-red-100 text-red-600";
  return "bg-muted text-gray-500";
};

const rankFillColor = (r: number | null) => {
  if (r === null) return "#9ca3af";
  if (r <= 3) return "#22c55e";
  if (r <= 7) return "#eab308";
  if (r <= 10) return "#f97316";
  if (r <= 20) return "#ef4444";
  return "#9ca3af";
};

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-600 bg-green-50 border-green-200",
  B: "text-blue-600 bg-blue-50 border-blue-200",
  C: "text-yellow-600 bg-yellow-50 border-yellow-200",
  D: "text-orange-600 bg-orange-50 border-orange-200",
  F: "text-red-600 bg-red-50 border-red-200",
};

const CAT_SUMMARIES: Record<string, string> = {
  speed: "Page load times affect both user experience and search rankings — Google uses Core Web Vitals as a ranking factor.",
  mobile: "Over 60% of searches are mobile. Sites that aren't mobile-friendly lose rankings and customers.",
  crawlability: "If search engines can't efficiently crawl your site, new and updated content won't get indexed.",
  schema: "Structured data helps search engines understand your content and can earn rich results in SERPs.",
  onpage: "Title tags, meta descriptions, and heading structure directly influence click-through rates and relevance signals.",
  security: "HTTPS and proper security headers build trust with users and are a confirmed Google ranking signal.",
};

interface DashboardProps {
  isClientView?: boolean;
  magicToken?: string;
}

export default function SeoAuditDashboard({ isClientView = false, magicToken }: DashboardProps) {
  const [, params] = useRoute("/admin/seo-audits/:id/dashboard");
  const urlParams = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const auditId = params?.id ? parseInt(params.id, 10) : null;
  const token = magicToken || (urlParams as Record<string, string>)?.token;

  const [activeSection, setActiveSection] = useState<SectionId>("snapshot");
  const [presentMode, setPresentMode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: audit, isLoading: auditLoading } = useQuery<AuditRecord>({
    queryKey: isClientView ? ["/api/seo-audits/view", token] : ["/api/seo-audits", auditId],
    queryFn: isClientView
      ? async () => {
          const res = await fetch(`/api/seo-audits/view/${token}`);
          if (!res.ok) throw new Error("Failed to load audit");
          return res.json();
        }
      : getAdminQueryFn({ on401: "throw" }),
    enabled: isClientView ? !!token : !!auditId,
  });

  const effectiveId = audit?.id || auditId;
  const authParam = isClientView && token ? `?token=${token}` : "";

  const fetchSection = <T,>(section: string) => async (): Promise<T> => {
    const headers: Record<string, string> = {};
    if (!isClientView) {
      const t = sessionStorage.getItem("adminToken");
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }
    const res = await fetch(`/api/seo-audits/${effectiveId}/sections/${section}${authParam}`, { headers });
    if (!res.ok) throw new Error(`Failed to load ${section}`);
    return res.json();
  };

  const { data: snapshotData } = useQuery<SnapshotData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "snapshot"], queryFn: fetchSection<SnapshotData>("snapshot"), enabled: !!effectiveId });
  const { data: geogridData } = useQuery<GeoGridData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "geogrid"], queryFn: fetchSection<GeoGridData>("geogrid"), enabled: !!effectiveId });
  const { data: geoVisData } = useQuery<GeoVisData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "geo_visibility"], queryFn: fetchSection<GeoVisData>("geo_visibility"), enabled: !!effectiveId });
  const { data: rankingsData } = useQuery<RankingsData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "rankings"], queryFn: fetchSection<RankingsData>("rankings"), enabled: !!effectiveId });
  const { data: revenueData } = useQuery<RevenueData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "revenue"], queryFn: fetchSection<RevenueData>("revenue"), enabled: !!effectiveId });
  const { data: technicalData } = useQuery<TechnicalData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "technical"], queryFn: fetchSection<TechnicalData>("technical"), enabled: !!effectiveId });
  const { data: contentData } = useQuery<ContentGapsData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "content_gaps"], queryFn: fetchSection<ContentGapsData>("content_gaps"), enabled: !!effectiveId });
  const { data: backlinksData } = useQuery<BacklinksData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "backlinks"], queryFn: fetchSection<BacklinksData>("backlinks"), enabled: !!effectiveId });
  const { data: reviewsData } = useQuery<ReviewsData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "reviews"], queryFn: fetchSection<ReviewsData>("reviews"), enabled: !!effectiveId });
  const { data: actionData } = useQuery<ActionPlanData>({ queryKey: ["/api/seo-audits", effectiveId, "sections", "action_plan"], queryFn: fetchSection<ActionPlanData>("action_plan"), enabled: !!effectiveId });

  const sectionDataMap: SectionDataMap = {
    snapshot: snapshotData, geogrid: geogridData, geo_visibility: geoVisData,
    rankings: rankingsData, revenue: revenueData, technical: technicalData,
    content_gaps: contentData, backlinks: backlinksData, reviews: reviewsData, action_plan: actionData,
  };

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleShare = async () => {
    if (!effectiveId) return;
    try {
      const res = await apiRequest("POST", `/api/seo-audits/${effectiveId}/share`, undefined, { useAdminAuth: true });
      const d = await res.json();
      const shareUrl = `${window.location.origin}/seo-audit/view/${d.token}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      toast({ title: "Share link copied!", description: "Anyone with this link can view the audit." });
      setTimeout(() => setShareCopied(false), 3000);
    } catch {
      toast({ title: "Failed to generate share link", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!presentMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); setCurrentSlide(s => Math.min(s + 1, SECTIONS.length - 1)); }
      else if (e.key === "ArrowLeft") { setCurrentSlide(s => Math.max(s - 1, 0)); }
      else if (e.key === "Escape") { setPresentMode(false); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [presentMode]);

  if (auditLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-[#ff5800]" /></div>;

  if (!audit) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <h1 className="text-xl font-bold">Audit Not Found</h1>
        <Button onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-list"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Audits</Button>
      </div>
    );
  }

  const marketScore = audit.marketPositionScore ?? 0;

  return (
    <>
      <div className="flex h-[calc(100vh-64px)]" data-testid="seo-dashboard">
        {!isClientView && (
          <aside className="w-60 border-r bg-background flex-shrink-0 overflow-y-auto" data-testid="dashboard-sidebar">
            <div className="p-4 border-b">
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-audits" className="mb-2 -ml-2">
                <ArrowLeft className="w-4 h-4 mr-1" /> Audits
              </Button>
              <h2 className="font-semibold text-sm truncate" data-testid="sidebar-business-name">{audit.businessName}</h2>
              <p className="text-xs text-gray-500" data-testid="sidebar-date">{format(new Date(audit.createdAt), "MMM d, yyyy")}</p>
            </div>
            <nav className="py-2" data-testid="sidebar-nav">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                const hasData = !!sectionDataMap[s.id];
                return (
                  <button key={s.id} onClick={() => scrollToSection(s.id)} className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-muted transition-colors ${activeSection === s.id ? "bg-orange-50 text-[#ff5800] font-medium border-r-2 border-[#ff5800]" : "text-muted-foreground"}`} data-testid={`nav-${s.id}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{s.label}</span>
                    {hasData && <CheckCircle className="w-3 h-3 text-emerald-600 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <main className="flex-1 overflow-y-auto bg-muted" data-testid="dashboard-main">
          <header className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between" data-testid="dashboard-header">
            <div className="flex items-center gap-4">
              {isClientView && <img src={logoIcon} alt="Building Brands Marketing" className="h-6" data-testid="client-logo" />}
              <div>
                <h1 className="text-lg font-bold" data-testid="header-business-name">{audit.businessName}</h1>
                <p className="text-xs text-gray-500">SEO Audit &middot; {format(new Date(audit.createdAt), "MMMM d, yyyy")}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-bold ${marketScore >= 70 ? "bg-green-100 text-green-700" : marketScore >= 40 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`} data-testid="market-score-badge">
                {marketScore}/100
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isClientView && (
                <Button variant="outline" size="sm" onClick={handleShare} data-testid="button-share">
                  {shareCopied ? <Check className="w-4 h-4 mr-1" /> : <Share2 className="w-4 h-4 mr-1" />}
                  {shareCopied ? "Copied" : "Share Link"}
                </Button>
              )}
              <Button size="sm" className="bg-[#ff5800] hover:bg-[#e04f00]" onClick={() => { setCurrentSlide(0); setPresentMode(true); }} data-testid="button-present">
                <Presentation className="w-4 h-4 mr-1" /> Present
              </Button>
            </div>
          </header>

          <div className="p-6 space-y-8 max-w-6xl mx-auto">
            {SECTIONS.map(s => (
              <div key={s.id} ref={el => { sectionRefs.current[s.id] = el; }} id={`section-${s.id}`} data-testid={`section-${s.id}`}>
                <SectionRenderer sectionId={s.id} sectionDataMap={sectionDataMap} audit={audit} auditId={effectiveId!} authParam={authParam} isClientView={isClientView} />
              </div>
            ))}
          </div>
        </main>
      </div>

      {presentMode && (
        <PresentModeOverlay audit={audit} sectionDataMap={sectionDataMap} currentSlide={currentSlide} setCurrentSlide={setCurrentSlide} onClose={() => setPresentMode(false)} auditId={effectiveId!} authParam={authParam} isClientView={isClientView} />
      )}
    </>
  );
}

function SectionRenderer({ sectionId, sectionDataMap, audit, auditId, authParam, isClientView }: {
  sectionId: SectionId; sectionDataMap: SectionDataMap; audit: AuditRecord; auditId: number; authParam: string; isClientView: boolean;
}) {
  const section = SECTIONS.find(s => s.id === sectionId)!;
  const Icon = section.icon;
  const data = sectionDataMap[sectionId];
  if (!data) {
    return (<Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="w-5 h-5 text-[#ff5800]" /> {section.label}</CardTitle></CardHeader><CardContent><div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div></CardContent></Card>);
  }
  switch (sectionId) {
    case "snapshot": return <SnapshotSection data={sectionDataMap.snapshot!} audit={audit} backlinksData={sectionDataMap.backlinks} />;
    case "geogrid": return <GeoGridSection data={sectionDataMap.geogrid!} auditId={auditId} authParam={authParam} isClientView={isClientView} />;
    case "geo_visibility": return <GeoVisibilitySection data={sectionDataMap.geo_visibility!} />;
    case "rankings": return <RankingsSection data={sectionDataMap.rankings!} />;
    case "revenue": return <RevenueSection data={sectionDataMap.revenue!} />;
    case "technical": return <TechnicalSection data={sectionDataMap.technical!} />;
    case "content_gaps": return <ContentGapsSection data={sectionDataMap.content_gaps!} />;
    case "backlinks": return <BacklinksSection data={sectionDataMap.backlinks!} audit={audit} />;
    case "reviews": return <ReviewsSection data={sectionDataMap.reviews!} />;
    case "action_plan": return <ActionPlanSection data={sectionDataMap.action_plan!} />;
    default: return null;
  }
}

function SectionCard({ icon: Icon, title, impact, children }: { icon: typeof Target; title: string; impact?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 bg-[#ff5800]/10 rounded-lg"><Icon className="w-5 h-5 text-[#ff5800]" /></div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        {impact && (<div className="mt-4 pt-3 border-t"><p className="text-sm text-gray-600 italic flex items-center gap-1" data-testid="section-impact"><Zap className="w-3.5 h-3.5 text-[#ff5800]" /> {impact}</p></div>)}
      </CardContent>
    </Card>
  );
}

function StatBadge({ label, value, color = "text-gray-900", testId }: { label: string; value: string | number; color?: string; testId?: string }) {
  return (<div className="text-center px-4 py-3 bg-muted rounded-lg" data-testid={testId}><p className={`text-2xl font-bold ${color}`}>{value}</p><p className="text-xs text-gray-500 mt-0.5">{label}</p></div>);
}

function SnapshotSection({ data, audit, backlinksData }: { data: SnapshotData; audit: AuditRecord; backlinksData: BacklinksData | undefined }) {
  const competitors = backlinksData?.competitors || [];

  const compMetrics: Array<{ name: string; "Domain Rating": number; "Organic KWs": number; "Monthly Traffic": number; Reviews: number; "Avg Rating": number }> = [
    {
      name: audit.businessName || "You",
      "Domain Rating": data.clientDR ?? data.marketPositionScore ?? 0,
      "Organic KWs": data.clientOrganicKeywords ?? 0,
      "Monthly Traffic": data.clientMonthlyTraffic ?? 0,
      Reviews: data.clientTotalReviews ?? 0,
      "Avg Rating": data.clientAverageRating ?? 0,
    },
    ...competitors.slice(0, 3).map(c => ({
      name: c.businessName || c.domain,
      "Domain Rating": c.domainRating ?? 0,
      "Organic KWs": c.organicKeywords ?? 0,
      "Monthly Traffic": c.monthlyTraffic ?? 0,
      Reviews: c.totalReviews ?? 0,
      "Avg Rating": c.averageRating ?? 0,
    })),
  ];

  const allMetricChartData = compMetrics.map(m => ({
    name: m.name,
    DR: m["Domain Rating"],
    Keywords: Math.min(m["Organic KWs"], 500),
    Traffic: Math.min(m["Monthly Traffic"], 5000),
    Reviews: m.Reviews,
  }));

  const verdict = data.marketPositionScore >= 70
    ? "You have a strong competitive position. Focus on maintaining your advantage."
    : data.marketPositionScore >= 40
    ? "You have a moderate position with clear opportunities to overtake competitors."
    : "Your competitors are significantly ahead. Aggressive action is needed to catch up.";

  return (
    <SectionCard icon={Target} title="Competitive Snapshot" impact="Your competitors are winning in key areas. Here's exactly how to catch them.">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatBadge label="Market Position" value={`${data.marketPositionScore ?? 0}/100`} color={data.marketPositionScore >= 70 ? "text-green-600" : data.marketPositionScore >= 40 ? "text-yellow-600" : "text-red-600"} testId="stat-market-position" />
        <StatBadge label="Site Health" value={data.siteHealthGrade || "—"} color={GRADE_COLOR[data.siteHealthGrade]?.split(" ")[0] || "text-gray-600"} testId="stat-site-health" />
        <StatBadge label="Share of Local Voice" value={`${Math.round((data.shareOfLocalVoice ?? 0) * 100)}%`} testId="stat-solv" />
        <StatBadge label="Keyword Gaps" value={data.totalKeywordGaps ?? 0} color="text-red-600" testId="stat-keyword-gaps" />
        <StatBadge label="Content Gaps" value={data.totalContentGaps ?? 0} color="text-red-600" testId="stat-content-gaps" />
      </div>

      <h4 className="text-sm font-semibold mb-3">Client vs Competitors</h4>

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse" data-testid="snapshot-comparison-table">
          <thead>
            <tr className="border-b text-gray-600">
              <th className="text-left py-2 px-3 font-medium">Business</th>
              <th className="text-center py-2 px-3 font-medium">DR</th>
              <th className="text-center py-2 px-3 font-medium">Organic KWs</th>
              <th className="text-center py-2 px-3 font-medium">Traffic/mo</th>
              <th className="text-center py-2 px-3 font-medium">Reviews</th>
              <th className="text-center py-2 px-3 font-medium">Rating</th>
            </tr>
          </thead>
          <tbody>
            {compMetrics.map((m, i) => (
              <tr key={m.name} className={`border-b border-gray-100 ${i === 0 ? "bg-orange-50/50 font-medium" : "hover:bg-muted"}`} data-testid={`snapshot-row-${i}`}>
                <td className="py-2 px-3">{m.name}{i === 0 && <Badge className="ml-2 bg-[#ff5800] text-[10px]">You</Badge>}</td>
                <td className="py-2 px-3 text-center">{m["Domain Rating"]}</td>
                <td className="py-2 px-3 text-center">{m["Organic KWs"].toLocaleString()}</td>
                <td className="py-2 px-3 text-center">{m["Monthly Traffic"].toLocaleString()}</td>
                <td className="py-2 px-3 text-center">{m.Reviews.toLocaleString()}</td>
                <td className="py-2 px-3 text-center flex items-center justify-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{m["Avg Rating"].toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allMetricChartData.length > 1 && (
        <div className="h-56 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={allMetricChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <RTooltip />
              <Legend />
              <Bar dataKey="DR" name="Domain Rating" fill="#ff5800" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Keywords" name="Organic Keywords" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Traffic" name="Monthly Traffic" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Reviews" name="Reviews" fill="#ffb41c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-muted rounded-lg p-3">
        <p className="text-sm text-gray-700" data-testid="snapshot-verdict"><strong>Verdict:</strong> {verdict}</p>
      </div>
    </SectionCard>
  );
}

function GeoGridSection({ data, auditId, authParam, isClientView }: { data: GeoGridData; auditId: number; authParam: string; isClientView: boolean }) {
  const [activeKw, setActiveKw] = useState<string>(data.grids?.[0]?.keyword || "");
  const [viewMode, setViewMode] = useState<"client" | "sideBySide">("client");
  const activeGrid = data.grids?.find(g => g.keyword === activeKw);

  return (
    <SectionCard icon={MapPin} title="Geo Grid" impact="Your local search visibility determines how many nearby customers find you vs. your competitors.">
      {data.grids?.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {data.grids.map(g => (
              <Button key={g.keyword} variant={activeKw === g.keyword ? "default" : "outline"} size="sm"
                onClick={() => setActiveKw(g.keyword)} className={activeKw === g.keyword ? "bg-[#ff5800]" : ""}
                data-testid={`geogrid-tab-${g.keyword}`}>
                {g.keyword}
              </Button>
            ))}
          </div>
          {activeGrid && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBadge label="Your SoLV" value={`${Math.round((activeGrid.clientSolv ?? 0) * 100)}%`} color="text-[#ff5800]" testId="stat-your-solv" />
              <StatBadge label="Avg Rank" value={activeGrid.clientAvgRank?.toFixed(1) || "—"} testId="stat-avg-rank" />
              {activeGrid.competitorName && (
                <StatBadge label={`${activeGrid.competitorName} SoLV`} value={`${Math.round((activeGrid.competitorSolv ?? 0) * 100)}%`} color="text-gray-600" testId="stat-competitor-solv" />
              )}
              {activeGrid.competitorName && (
                <div className="flex items-center justify-center">
                  <Button variant="outline" size="sm" onClick={() => setViewMode(v => v === "client" ? "sideBySide" : "client")} data-testid="toggle-grid-view">
                    {viewMode === "client" ? "Side-by-Side" : "Your Ranks Only"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {viewMode === "sideBySide" ? (
            <div className="grid grid-cols-2 gap-4" data-testid="geogrid-sidebyside">
              <div>
                <p className="text-xs font-semibold text-center mb-1 text-[#ff5800]">Your Rankings</p>
                <GeoGridMap auditId={auditId} keyword={activeKw} authParam={authParam} isClientView={isClientView} showField="client" />
              </div>
              <div>
                <p className="text-xs font-semibold text-center mb-1 text-gray-600">{activeGrid?.competitorName || "Competitor"}</p>
                <GeoGridMap auditId={auditId} keyword={activeKw} authParam={authParam} isClientView={isClientView} showField="competitor" />
              </div>
            </div>
          ) : (
            <GeoGridMap auditId={auditId} keyword={activeKw} authParam={authParam} isClientView={isClientView} showField="client" />
          )}
        </>
      ) : (
        <p className="text-gray-500 text-sm py-4">No geo grid data available.</p>
      )}
      {activeGrid && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted rounded-lg p-3" data-testid="geogrid-summary-bar">
          <div className="text-center"><p className="text-xs text-gray-500">Your SoLV</p><p className="text-sm font-bold text-[#ff5800]">{Math.round((activeGrid.clientSolv ?? 0) * 100)}%</p></div>
          {activeGrid.competitorName && <div className="text-center"><p className="text-xs text-gray-500">{activeGrid.competitorName} SoLV</p><p className="text-sm font-bold text-gray-600">{Math.round((activeGrid.competitorSolv ?? 0) * 100)}%</p></div>}
          <div className="text-center"><p className="text-xs text-gray-500">Delta</p><p className={`text-sm font-bold ${(activeGrid.clientSolv ?? 0) >= (activeGrid.competitorSolv ?? 0) ? "text-green-600" : "text-red-600"}`}>{((activeGrid.clientSolv ?? 0) - (activeGrid.competitorSolv ?? 0) > 0 ? "+" : "")}{Math.round(((activeGrid.clientSolv ?? 0) - (activeGrid.competitorSolv ?? 0)) * 100)}%</p></div>
          <div className="text-center"><p className="text-xs text-gray-500">Avg Rank</p><p className="text-sm font-bold">{activeGrid.clientAvgRank?.toFixed(1) || "—"}</p></div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500" data-testid="geogrid-legend">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" /> #1-3</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> #4-7</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> #8-10</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-destructive inline-block" /> #11-20</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> Not Found</span>
      </div>
    </SectionCard>
  );
}

function GeoGridMap({ auditId, keyword, authParam, isClientView, showField }: { auditId: number; keyword: string; authParam: string; isClientView: boolean; showField: "client" | "competitor" }) {
  const { data: gridData } = useQuery<GeoGridPointsData>({
    queryKey: ["/api/seo-audits", auditId, "geogrid", keyword],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (!isClientView) { const t = sessionStorage.getItem("adminToken"); if (t) headers["Authorization"] = `Bearer ${t}`; }
      const res = await fetch(`/api/seo-audits/${auditId}/geogrid/${encodeURIComponent(keyword)}${authParam}`, { headers });
      if (!res.ok) throw new Error("Failed to load grid");
      return res.json();
    },
    enabled: !!keyword,
  });

  if (!gridData?.points?.length) return <div className="h-64 flex items-center justify-center bg-muted rounded text-gray-400 text-sm">No grid points available</div>;

  const points = gridData.points;
  const center: [number, number] = [
    points.reduce((s, p) => s + p.lat, 0) / points.length,
    points.reduce((s, p) => s + p.lng, 0) / points.length,
  ];

  return (
    <div className="rounded-lg overflow-hidden border" style={{ height: 320 }} data-testid={`geogrid-leaflet-map-${showField}`}>
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        {points.map((pt, i) => {
          const rank = showField === "competitor" ? pt.competitorRank : pt.clientRank;
          return (
            <CircleMarker key={i} center={[pt.lat, pt.lng]} radius={12} pathOptions={{ fillColor: rankFillColor(rank), color: "white", weight: 2, fillOpacity: 0.85 }} data-testid={`grid-point-${showField}-${i}`}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold mb-1">{keyword}</p>
                  <p>Your Rank: <strong className={pt.clientRank !== null && pt.clientRank <= 3 ? "text-green-600" : "text-red-600"}>{pt.clientRank ?? "Not Found"}</strong></p>
                  {pt.competitorRank !== undefined && <p>Competitor: <strong>{pt.competitorRank ?? "N/F"}</strong></p>}
                  {pt.localPackResults && pt.localPackResults.length > 0 && (
                    <div className="mt-1 pt-1 border-t">
                      <p className="font-semibold">Local Pack:</p>
                      {pt.localPackResults.slice(0, 3).map((r, j) => (
                        <p key={j}>#{j + 1} {r.name || r.title || "—"}</p>
                      ))}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function GeoVisibilitySection({ data }: { data: GeoVisData }) {
  const platforms = [
    { name: "ChatGPT", found: data.foundInChatGpt ?? 0, cited: data.citedInChatGpt ?? 0, visibility: data.chatGptVisibility ?? 0 },
    { name: "Gemini", found: data.foundInGemini ?? 0, cited: data.citedInGemini ?? 0, visibility: data.geminiVisibility ?? 0 },
  ];

  const gapsByService = data.gapsByService || [];
  const serviceNames = Array.from(new Set(gapsByService.map(g => g.service)));

  return (
    <SectionCard icon={Eye} title="AI/GEO Visibility" impact="AI search engines are reshaping how customers discover businesses. Your visibility in these channels directly impacts future lead volume.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBadge label="AI Visibility Score" value={`${data.aiVisibilityScore ?? 0}%`} color={data.aiVisibilityScore >= 50 ? "text-green-600" : "text-red-600"} testId="stat-ai-visibility" />
        <StatBadge label="Total Checked" value={data.totalChecked ?? 0} testId="stat-total-checked" />
        <StatBadge label="Overall Visibility" value={`${Math.round(data.overallVisibility ?? 0)}%`} testId="stat-overall-vis" />
        <StatBadge label="ChatGPT / Gemini" value={`${Math.round(data.chatGptVisibility ?? 0)}% / ${Math.round(data.geminiVisibility ?? 0)}%`} testId="stat-platform-vis" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {platforms.map(p => (
          <Card key={p.name} className="border">
            <CardContent className="pt-4">
              <h4 className="font-medium mb-2 flex items-center gap-2" data-testid={`platform-heading-${p.name}`}><Cpu className="w-4 h-4" /> {p.name}</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Mentioned</span><span className="font-medium" data-testid={`mentioned-${p.name}`}>{p.found} times</span></div>
                <div className="flex justify-between text-sm"><span>Cited (URL)</span><span className="font-medium" data-testid={`cited-${p.name}`}>{p.cited} times</span></div>
                <div className="flex justify-between text-sm"><span>Visibility</span><span className="font-medium">{Math.round(p.visibility)}%</span></div>
                <Progress value={p.visibility} className="h-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {serviceNames.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mb-2">Visibility Gaps by Service Category</h4>
          <div className="space-y-2" data-testid="ai-gaps-by-service">
            {serviceNames.map(svc => {
              const svcGaps = gapsByService.filter(g => g.service === svc);
              const foundCount = svcGaps.filter(g => g.found).length;
              return (
                <div key={svc} className="flex items-center justify-between py-2 px-3 bg-muted rounded text-sm" data-testid={`ai-gap-${svc}`}>
                  <span className="font-medium">{svc}</span>
                  <div className="flex items-center gap-2">
                    <span className={foundCount > 0 ? "text-green-600" : "text-red-600"}>{foundCount}/{svcGaps.length} found</span>
                    {svcGaps.filter(g => !g.found).length > 0 && (
                      <Badge variant="outline" className="text-[10px] border-red-200 text-red-600">
                        {svcGaps.filter(g => !g.found).length} missing
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function RankingsSection({ data }: { data: RankingsData }) {
  const [filter, setFilter] = useState<"all" | "organic" | "localPack" | "aiOverview">("all");
  const [colPage, setColPage] = useState(0);
  const keywords = data.keywords || [];

  const cities = useMemo(() => { const s = new Set<string>(); keywords.forEach(k => { if (k.targetCity) s.add(k.targetCity); }); return Array.from(s); }, [keywords]);
  const maxCols = 6;
  const visibleCities = cities.slice(colPage * maxCols, (colPage + 1) * maxCols);
  const services = useMemo(() => { const s = new Set<string>(); keywords.forEach(k => { if (k.targetService) s.add(k.targetService); }); return Array.from(s); }, [keywords]);

  const filtered = useMemo(() => {
    return keywords.filter(k => {
      if (filter === "organic") return k.currentOrganicRank !== null;
      if (filter === "localPack") return k.pageType === "local" || k.intent === "local";
      if (filter === "aiOverview") return k.inAiOverview;
      return true;
    });
  }, [keywords, filter]);

  return (
    <SectionCard icon={Search} title="Keyword Rankings" impact="Every keyword where you don't rank on page 1 is revenue going to your competitors.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatBadge label="Total Tracked" value={data.totalTracked ?? 0} testId="stat-total-tracked" />
        <StatBadge label="Page 1 (Top 10)" value={data.page1Count ?? 0} color="text-green-600" testId="stat-page1" />
        <StatBadge label="Page 2 (11-20)" value={data.page2Count ?? 0} color="text-yellow-600" testId="stat-page2" />
        <StatBadge label="In AI Overview" value={data.aiOverviewCount ?? 0} color="text-blue-600" testId="stat-ai-overview" />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {(["all", "organic", "localPack", "aiOverview"] as const).map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}
            className={filter === f ? "bg-[#ff5800]" : ""} data-testid={`filter-${f}`}>
            {f === "all" ? "All" : f === "organic" ? "Organic" : f === "localPack" ? "Local Pack" : "AI Overview"}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500" data-testid="filtered-count">{filtered.length} keywords</span>
          {cities.length > maxCols && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setColPage(p => Math.max(0, p - 1))} disabled={colPage === 0} data-testid="btn-prev-cols"><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-xs text-gray-500">{colPage + 1}/{Math.ceil(cities.length / maxCols)}</span>
              <Button variant="ghost" size="sm" onClick={() => setColPage(p => Math.min(Math.ceil(cities.length / maxCols) - 1, p + 1))} disabled={(colPage + 1) * maxCols >= cities.length} data-testid="btn-next-cols"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </div>
        <table className="w-full text-sm border-collapse" data-testid="rankings-table">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2 font-medium text-gray-600">Keyword</th>
              <th className="text-center py-2 px-2 font-medium text-gray-600">Vol</th>
              {visibleCities.length > 0 ? visibleCities.map(c => (<th key={c} className="text-center py-2 px-2 font-medium text-gray-600 whitespace-nowrap">{c}</th>)) :
                <th className="text-center py-2 px-2 font-medium text-gray-600">Rank</th>}
            </tr>
          </thead>
          <tbody>
            {services.map(svc => {
              const svcKws = filtered.filter(k => k.targetService === svc);
              if (svcKws.length === 0) return null;
              return (
                <Fragment key={svc}>
                  <tr><td colSpan={2 + Math.max(visibleCities.length, 1)} className="pt-3 pb-1 px-2 font-semibold text-[#ff5800] text-xs uppercase tracking-wide">{svc}</td></tr>
                  {svcKws.map((kw, i) => (
                    <tr key={`${kw.keyword}-${i}`} className="border-b border-gray-100 hover:bg-muted" data-testid={`ranking-row-${kw.keyword}`}>
                      <td className="py-1.5 px-2 max-w-[200px]">
                        <span className="truncate block">{kw.keyword}</span>
                        {kw.inAiOverview && <Badge variant="outline" className="text-[9px] mt-0.5 border-blue-200 text-blue-600">AI</Badge>}
                      </td>
                      <td className="py-1.5 px-2 text-center text-gray-400 text-xs">{kw.searchVolume ?? "—"}</td>
                      {visibleCities.length > 0 ? visibleCities.map(city => {
                        const rank = kw.targetCity === city ? kw.currentOrganicRank : null;
                        return (
                          <td key={city} className="py-1.5 px-2 text-center">
                            <span className={`inline-block w-8 py-0.5 rounded text-xs font-bold ${RANK_COLOR(rank)}`}>{rank ?? "—"}</span>
                            {kw.competitorRanks && kw.targetCity === city && Object.keys(kw.competitorRanks).length > 0 && (
                              <div className="flex justify-center gap-1 mt-0.5">
                                {Object.entries(kw.competitorRanks).slice(0, 2).map(([name, cr]) => (
                                  <TooltipProvider key={name}><Tooltip><TooltipTrigger asChild>
                                    <span className="text-[9px] text-gray-400 cursor-help">{cr}</span>
                                  </TooltipTrigger><TooltipContent side="bottom"><p className="text-xs">{name}: #{cr}</p></TooltipContent></Tooltip></TooltipProvider>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      }) : (
                        <td className="py-1.5 px-2 text-center">
                          <span className={`inline-block w-8 py-0.5 rounded text-xs font-bold ${RANK_COLOR(kw.currentOrganicRank)}`}>{kw.currentOrganicRank ?? "—"}</span>
                          {kw.competitorRanks && Object.keys(kw.competitorRanks).length > 0 && (
                            <div className="flex justify-center gap-1 mt-0.5">
                              {Object.entries(kw.competitorRanks).slice(0, 2).map(([name, cr]) => (
                                <TooltipProvider key={name}><Tooltip><TooltipTrigger asChild>
                                  <span className="text-[9px] text-gray-400 cursor-help">{cr}</span>
                                </TooltipTrigger><TooltipContent side="bottom"><p className="text-xs">{name}: #{cr}</p></TooltipContent></Tooltip></TooltipProvider>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {services.length === 0 && filtered.map((kw, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-muted" data-testid={`ranking-row-${i}`}>
                <td className="py-1.5 px-2">{kw.keyword}{kw.inAiOverview && <Badge variant="outline" className="text-[9px] ml-1 border-blue-200 text-blue-600">AI</Badge>}</td>
                <td className="py-1.5 px-2 text-center text-gray-400">{kw.searchVolume ?? "—"}</td>
                <td className="py-1.5 px-2 text-center"><span className={`inline-block w-8 py-0.5 rounded text-xs font-bold ${RANK_COLOR(kw.currentOrganicRank)}`}>{kw.currentOrganicRank ?? "—"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2" data-testid="competitor-rank-hint">Small numbers below ranks indicate competitor positions for that keyword.</p>
    </SectionCard>
  );
}

function RevenueSection({ data }: { data: RevenueData }) {
  const summary = data.summary || {} as RevenueData["summary"];
  const forecasts = data.forecasts || [];

  const totalVolume = forecasts.reduce((s, f) => s + (f.searchVolume || 0), 0);
  const estLeads = summary.estimatedLeads ?? Math.round((summary.totalConversions || 0) * 0.3);
  const estRevenue = summary.estimatedRevenue ?? Math.round(estLeads * 500);

  const funnelData = [
    { name: "Search Volume", value: totalVolume, fill: "#ff5800" },
    { name: "Est. Clicks", value: summary.totalClicks || 0, fill: "#ffb41c" },
    { name: "Est. Conversions", value: summary.totalConversions || 0, fill: "#3b82f6" },
    { name: "Est. Leads", value: estLeads, fill: "#8b5cf6" },
    { name: "Est. Revenue", value: estRevenue, fill: "#22c55e" },
  ];

  const seoMonthlyCost = 3000;
  const seoTrafficValue = Math.round((summary.totalClicks || 0) * (summary.avgCpc || 2));
  const ppCost = summary.totalCost || 0;

  const capturedPct = totalVolume > 0 ? Math.round((summary.totalClicks || 0) / totalVolume * 100) : 0;

  return (
    <SectionCard icon={DollarSign} title="Revenue Opportunity" impact="Every month without SEO investment, you're leaving revenue on the table for competitors to capture.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBadge label="Est. Monthly Clicks" value={summary.totalClicks?.toLocaleString() || "0"} testId="stat-monthly-clicks" />
        <StatBadge label="PPC Equivalent Cost" value={`$${summary.totalCost?.toLocaleString() || "0"}`} color="text-red-600" testId="stat-ppc-cost" />
        <StatBadge label="Est. Leads" value={estLeads.toLocaleString()} color="text-purple-600" testId="stat-est-leads" />
        <StatBadge label="Est. Revenue" value={`$${estRevenue.toLocaleString()}`} color="text-green-600" testId="stat-est-revenue" />
      </div>

      <h4 className="text-sm font-semibold mb-2">SEO Opportunity Funnel</h4>
      <div className="h-56 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={funnelData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <RTooltip formatter={(v: number) => v.toLocaleString()} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>{funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h4 className="text-sm font-semibold mb-2">SEO vs Google Ads ROI Comparison</h4>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="border border-green-200 bg-green-50/30">
          <CardContent className="pt-4" data-testid="roi-seo-card">
            <h5 className="font-medium text-sm mb-2 flex items-center gap-1"><TrendingUp className="w-4 h-4 text-green-600" /> SEO (Organic)</h5>
            <p className="text-xs text-gray-500">Est. monthly investment: <strong>${seoMonthlyCost.toLocaleString()}</strong></p>
            <p className="text-xs text-gray-500">Traffic value equivalent: <strong className="text-green-600">${seoTrafficValue.toLocaleString()}</strong></p>
            <p className="text-xs text-gray-500 mt-1">ROI: <strong className="text-green-600">{seoTrafficValue > 0 ? `${Math.round(seoTrafficValue / seoMonthlyCost * 100)}%` : "Compounding"}</strong></p>
            <Badge variant="outline" className="mt-2 text-[10px] border-green-200 text-green-600">Compounding returns — value grows over time</Badge>
          </CardContent>
        </Card>
        <Card className="border border-red-200 bg-red-50/30">
          <CardContent className="pt-4" data-testid="roi-ppc-card">
            <h5 className="font-medium text-sm mb-2 flex items-center gap-1"><DollarSign className="w-4 h-4 text-red-600" /> Google Ads (PPC)</h5>
            <p className="text-xs text-gray-500">Est. monthly cost: <strong className="text-red-600">${ppCost.toLocaleString()}</strong></p>
            <p className="text-xs text-gray-500">Clicks: <strong>{summary.totalClicks?.toLocaleString() || "0"}</strong></p>
            <p className="text-xs text-gray-500 mt-1">Avg CPC: <strong>${summary.avgCpc || "0"}</strong></p>
            <Badge variant="outline" className="mt-2 text-[10px] border-red-200 text-red-600">Linear — traffic stops when budget stops</Badge>
          </CardContent>
        </Card>
      </div>

      <h4 className="text-sm font-semibold mb-2">Current vs Available Traffic</h4>
      <div className="flex items-center gap-3 mb-2" data-testid="captured-traffic-bar">
        <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
          <div className="bg-[#ff5800] h-full rounded-full flex items-center justify-end pr-2 text-xs text-white font-bold transition-all" style={{ width: `${Math.max(capturedPct, 5)}%` }}>{capturedPct}%</div>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{capturedPct}% captured</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">You're currently capturing {capturedPct}% of the available search traffic. {100 - capturedPct}% is going to competitors.</p>

      {forecasts.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-4 mb-2">Google Ads Projection</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" data-testid="ppc-forecast-table">
              <thead><tr className="border-b text-gray-600">
                <th className="text-left py-2 px-2">Keyword</th><th className="text-right py-2 px-2">Volume</th>
                <th className="text-right py-2 px-2">Clicks</th><th className="text-right py-2 px-2">CPC</th><th className="text-right py-2 px-2">Cost/mo</th>
              </tr></thead>
              <tbody>
                {forecasts.slice(0, 10).map((f, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-muted" data-testid={`forecast-row-${i}`}>
                    <td className="py-1.5 px-2">{f.keyword}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{f.searchVolume?.toLocaleString() || "—"}</td>
                    <td className="py-1.5 px-2 text-right">{f.estimatedClicks?.toLocaleString() || "—"}</td>
                    <td className="py-1.5 px-2 text-right">${f.estimatedCpc?.toFixed(2) || "—"}</td>
                    <td className="py-1.5 px-2 text-right font-medium text-red-600">${f.estimatedCost?.toLocaleString() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function TechnicalSection({ data }: { data: TechnicalData }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const grade = data.grade || "—";
  const findings = data.findings || [];
  const catNames: Record<string, string> = { speed: "Speed", mobile: "Mobile", crawlability: "Crawlability", schema: "Schema", onpage: "On-Page", security: "Security" };

  const categories = useMemo(() => {
    const cats: Record<string, { pass: number; fail: number; warn: number; items: TechnicalFinding[] }> = {};
    for (const f of findings) {
      const cat = f.category || "other";
      if (!cats[cat]) cats[cat] = { pass: 0, fail: 0, warn: 0, items: [] };
      cats[cat].items.push(f);
      if (f.status === "pass") cats[cat].pass++; else if (f.status === "fail") cats[cat].fail++; else cats[cat].warn++;
    }
    return Object.entries(cats).map(([key, val]) => ({
      key, name: catNames[key] || key, ...val,
      grade: val.fail === 0 ? "A" : val.fail <= 1 ? "B" : val.fail <= 3 ? "C" : val.fail <= 5 ? "D" : "F",
    }));
  }, [findings]);

  return (
    <SectionCard icon={Shield} title="Site Health" impact="Technical issues silently prevent search engines from finding and ranking your pages.">
      <div className="flex items-center gap-6 mb-6">
        <div className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center text-4xl font-bold ${GRADE_COLOR[grade] || "text-gray-600 bg-muted border-gray-200"}`} data-testid="site-health-grade">{grade}</div>
        <div>
          <p className="text-sm text-gray-500" data-testid="total-checks">{data.totalChecks || 0} checks performed</p>
          <p className="text-sm"><span className="text-green-600 font-medium" data-testid="pass-count">{data.passCount || 0} passed</span> &middot; <span className="text-red-600 font-medium" data-testid="fail-count">{data.failCount || 0} failed</span></p>
          <Progress value={data.passRate ?? 0} className="h-2 mt-2 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map(cat => (
          <Card key={cat.key} className="border cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setExpanded(e => ({ ...e, [cat.key]: !e[cat.key] }))} data-testid={`health-card-${cat.key}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium text-sm">{cat.name}</h4>
                <span className={`text-lg font-bold px-2 rounded ${GRADE_COLOR[cat.grade] || ""}`} data-testid={`grade-${cat.key}`}>{cat.grade}</span>
              </div>
              <p className="text-[11px] text-gray-400 mb-2 leading-snug">{CAT_SUMMARIES[cat.key] || ""}</p>
              <p className="text-xs text-gray-500">{cat.pass} pass &middot; {cat.fail} fail &middot; {cat.warn} warn</p>
              {expanded[cat.key] && (
                <div className="mt-3 pt-3 border-t space-y-1.5">
                  {cat.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs" data-testid={`finding-${cat.key}-${i}`}>
                      {item.status === "pass" ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> :
                       item.status === "fail" ? <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" /> :
                       <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />}
                      <div><p className="font-medium">{item.checkName}</p>{item.detail && <p className="text-gray-500 mt-0.5">{item.detail}</p>}</div>
                    </div>
                  ))}
                </div>
              )}
              <button className="text-xs text-[#ff5800] mt-2 flex items-center gap-1" data-testid={`expand-${cat.key}`}>
                {expanded[cat.key] ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> Details</>}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionCard>
  );
}

function ContentGapsSection({ data }: { data: ContentGapsData }) {
  const [colPage, setColPage] = useState(0);
  const gaps = data.gaps || [];
  const byType = data.byType || {};
  const typeLabels: Record<string, string> = { service_page: "Service Pages", city_page: "City Pages", subcity_page: "Sub-City Pages", comparison_page: "Comparison Pages", resource_page: "Resource Pages" };

  const serviceGaps = gaps.filter(g => g.gapType === "service_page");
  const cityGaps = gaps.filter(g => g.gapType === "city_page");
  const subcityGaps = gaps.filter(g => g.gapType === "subcity_page");

  const services = useMemo(() => Array.from(new Set(subcityGaps.map(g => g.service).filter(Boolean) as string[])), [subcityGaps]);
  const cities = useMemo(() => Array.from(new Set(subcityGaps.map(g => g.city).filter(Boolean) as string[])), [subcityGaps]);
  const maxCols = 6;
  const visCities = cities.slice(colPage * maxCols, (colPage + 1) * maxCols);

  return (
    <SectionCard icon={FileText} title="Content Gap Analysis" impact={`You need ${data.totalGaps || 0} new pages to fully compete in your market.`}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(byType).map(([type, count]) => <StatBadge key={type} label={typeLabels[type] || type} value={count as number} color="text-red-600" testId={`gap-type-${type}`} />)}
        {Object.keys(byType).length === 0 && <StatBadge label="Total Gaps" value={data.totalGaps || 0} color="text-red-600" testId="gap-total" />}
      </div>

      {serviceGaps.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold mb-2">Service Pages</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {serviceGaps.map((g, i) => (
              <div key={i} className={`flex items-center gap-2 p-2 rounded text-sm ${g.exists ? "bg-green-50" : "bg-red-50"}`} data-testid={`service-gap-${i}`}>
                {g.exists ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                <span className="truncate">{g.suggestedTitle || g.targetKeyword || g.service || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cityGaps.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold mb-2">City Pages</h4>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {cityGaps.slice(0, 12).map((g, i) => (
              <div key={i} className={`text-center p-2 rounded text-xs ${g.exists ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} data-testid={`city-gap-${i}`}>
                {g.exists ? <CheckCircle className="w-3 h-3 mx-auto mb-1 text-emerald-600" /> : <XCircle className="w-3 h-3 mx-auto mb-1 text-destructive" />}
                {g.city || g.suggestedTitle || "—"}
              </div>
            ))}
          </div>
        </div>
      )}

      {services.length > 0 && cities.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Service x City Matrix (Sub-City Pages)</h4>
            {cities.length > maxCols && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setColPage(p => Math.max(0, p - 1))} disabled={colPage === 0} data-testid="matrix-prev"><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-xs text-gray-500">{colPage + 1}/{Math.ceil(cities.length / maxCols)}</span>
                <Button variant="ghost" size="sm" onClick={() => setColPage(p => Math.min(Math.ceil(cities.length / maxCols) - 1, p + 1))} disabled={(colPage + 1) * maxCols >= cities.length} data-testid="matrix-next"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" data-testid="content-matrix">
              <thead><tr className="border-b">
                <th className="text-left py-2 px-2 font-medium text-gray-600">Service</th>
                {visCities.map(c => <th key={c} className="text-center py-2 px-1 font-medium text-gray-600 whitespace-nowrap">{c}</th>)}
              </tr></thead>
              <tbody>
                {services.map(svc => (
                  <tr key={svc} className="border-b border-gray-100" data-testid={`matrix-row-${svc}`}>
                    <td className="py-1.5 px-2 font-medium">{svc}</td>
                    {visCities.map(city => {
                      const gap = subcityGaps.find(g => g.service === svc && g.city === city);
                      const exists = gap?.exists ?? false;
                      return (
                        <td key={city} className="py-1.5 px-1 text-center">
                          {exists ? <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" /> : <XCircle className="w-4 h-4 text-destructive mx-auto" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {gaps.length > 0 && serviceGaps.length === 0 && cityGaps.length === 0 && services.length === 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {gaps.slice(0, 20).map((g, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 hover:bg-muted rounded text-sm" data-testid={`gap-item-${i}`}>
              <div className="flex items-center gap-2">
                {g.exists ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                <span>{g.suggestedTitle || g.targetKeyword || "—"}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{typeLabels[g.gapType] || g.gapType}</Badge>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function BacklinksSection({ data, audit }: { data: BacklinksData; audit: AuditRecord }) {
  const competitors = data.competitors || [];

  const chartData = [
    { name: audit.businessName || "You", DR: (audit.marketPositionScore ?? 0), RefDomains: 0 },
    ...competitors.slice(0, 3).map(c => ({
      name: c.businessName || c.domain,
      DR: c.domainRating ?? 0,
      RefDomains: Math.min(c.referringDomains ?? 0, 1000),
    })),
  ];

  const qualityData = competitors.slice(0, 4).map(c => {
    const summary = c.backlinkSummary || "";
    const high = summary.includes("high") ? 40 : 20;
    return { name: c.businessName || c.domain, High: high, Medium: 35, Low: 100 - high - 35 };
  });

  return (
    <SectionCard icon={Link2} title="Backlink Summary" impact="Backlinks are votes of trust from other websites. More high-quality links means higher rankings.">
      {chartData.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mb-2">Domain Rating & Referring Domains</h4>
          <div className="h-48 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <RTooltip />
                <Legend />
                <Bar dataKey="DR" name="Domain Rating" fill="#ff5800" radius={[4, 4, 0, 0]} />
                <Bar dataKey="RefDomains" name="Ref. Domains" fill="#ffb41c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {qualityData.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mb-2">Link Quality Distribution (estimated)</h4>
          <div className="h-40 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qualityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Legend />
                <Bar dataKey="High" stackId="q" fill="#22c55e" />
                <Bar dataKey="Medium" stackId="q" fill="#ffb41c" />
                <Bar dataKey="Low" stackId="q" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {competitors.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mb-2">Top Missing Competitor Backlinks</h4>
          <div className="space-y-2">
            {competitors.slice(0, 5).map((c, i) => (
              <Card key={i} className="border" data-testid={`backlink-competitor-${i}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="font-medium text-sm">{c.businessName || c.domain}</h5>
                    <Badge variant="outline" className="text-xs" data-testid={`dr-badge-${i}`}>DR {c.domainRating ?? "—"}</Badge>
                  </div>
                  <p className="text-xs text-gray-500">{c.referringDomains?.toLocaleString() || "—"} referring domains</p>
                  {c.backlinkSummary && <p className="text-xs text-gray-600 mt-1">{c.backlinkSummary}</p>}
                  {c.topBacklinks && c.topBacklinks.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">Top Links You're Missing:</p>
                      {c.topBacklinks.slice(0, 3).map((bl, j) => (
                        <p key={j} className="text-[10px] text-gray-400 truncate" data-testid={`missing-link-${i}-${j}`}>{typeof bl === "string" ? bl : bl.url || bl.domain || "—"}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {competitors.length > 0 && (
        <div className="bg-muted rounded-lg p-3 mt-4">
          <p className="text-sm text-gray-700" data-testid="backlinks-assessment">
            <strong>Assessment:</strong> {competitors[0]?.domainRating && competitors[0].domainRating > 30
              ? `Your top competitor (${competitors[0]?.businessName || competitors[0]?.domain}) has a DR of ${competitors[0]?.domainRating}, indicating a strong backlink profile. Building quality links should be a priority.`
              : "Competitor backlink profiles are moderate, presenting an opportunity to establish authority quickly with targeted link building."}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function ReviewsSection({ data }: { data: ReviewsData }) {
  const client = data.client;
  const competitors = data.competitors || [];

  const platformData = client?.platformBreakdown
    ? Object.entries(client.platformBreakdown).map(([name, val]) => ({
        name,
        count: typeof val === "number" ? val : val?.count ?? 0,
        rating: typeof val === "number" ? 0 : val?.rating ?? 0,
      }))
    : [];

  const recencyLabel = client?.reviewVelocity ? (client.reviewVelocity >= 5 ? "Active" : client.reviewVelocity >= 2 ? "Moderate" : "Slow") : "Unknown";
  const recencyColor = recencyLabel === "Active" ? "text-green-600" : recencyLabel === "Moderate" ? "text-yellow-600" : "text-red-600";

  return (
    <SectionCard icon={Star} title="Review Health" impact="Reviews are the #1 factor in local pack rankings and the first thing potential customers check.">
      {client ? (
        <div className="mb-6">
          <h4 className="font-medium text-sm mb-3">Your Review Scorecard</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatBadge label="Total Reviews" value={client.totalReviews ?? 0} testId="stat-total-reviews" />
            <StatBadge label="Avg Rating" value={client.averageRating?.toFixed(1) ?? "—"} color={client.averageRating >= 4 ? "text-green-600" : "text-yellow-600"} testId="stat-avg-rating" />
            <StatBadge label="Review Velocity" value={`${client.reviewVelocity ?? 0}/mo`} testId="stat-velocity" />
            <StatBadge label="Recency" value={recencyLabel} color={recencyColor} testId="stat-recency" />
            <StatBadge label="Platforms" value={platformData.length || "—"} testId="stat-platforms" />
          </div>

          {platformData.length > 0 && (
            <div className="mt-4">
              <h5 className="text-xs font-semibold text-gray-500 mb-2">Platform Breakdown</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {platformData.map(p => (
                  <div key={p.name} className="bg-muted rounded p-2 text-center" data-testid={`platform-${p.name}`}>
                    <p className="text-xs font-medium capitalize">{p.name}</p>
                    <p className="text-lg font-bold">{p.count}</p>
                    {p.rating > 0 && <p className="text-xs text-gray-400 flex items-center justify-center gap-1"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{p.rating.toFixed(1)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {client.sentimentSummary && (
            <div className="mt-4">
              <h5 className="text-xs font-semibold text-gray-500 mb-2">Sentiment Themes</h5>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded" data-testid="sentiment-summary">{client.sentimentSummary}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-4">No review data available for your business.</p>
      )}

      {competitors.length > 0 && (
        <>
          <h4 className="font-medium text-sm mb-3">Competitor Reviews</h4>
          <div className="space-y-2">
            {competitors.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-muted rounded text-sm" data-testid={`competitor-review-${i}`}>
                <span className="font-medium">{c.businessName || `Competitor ${i + 1}`}</span>
                <div className="flex items-center gap-4">
                  <span data-testid={`comp-review-count-${i}`}>{c.totalReviews ?? 0} reviews</span>
                  <span className="flex items-center gap-1" data-testid={`comp-review-rating-${i}`}><Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />{c.averageRating?.toFixed(1) ?? "—"}</span>
                  {c.reviewVelocity !== undefined && <span className="text-xs text-gray-400" data-testid={`comp-review-velocity-${i}`}>{c.reviewVelocity}/mo</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function ActionPlanSection({ data }: { data: ActionPlanData }) {
  const phases = data.phases || {};
  const deliverables = data.deliverables || [];
  const phaseLabels: Record<number, string> = { 1: "Phase 1: Foundation (Months 1-3)", 2: "Phase 2: Growth (Months 4-6)", 3: "Phase 3: Dominance (Months 7-12)" };
  const priorityColor: Record<string, string> = { critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", medium: "bg-yellow-100 text-yellow-700", low: "bg-muted text-muted-foreground" };

  const monthlyInvestment = data.estimatedMonthlyInvestment ?? 0;
  const totalHours = data.estimatedTotalHours ?? 0;
  const roiTimelineData = [
    { month: "Month 1", investment: monthlyInvestment, returns: 0 },
    { month: "Month 3", investment: monthlyInvestment * 3, returns: monthlyInvestment * 0.5 },
    { month: "Month 6", investment: monthlyInvestment * 6, returns: monthlyInvestment * 2 },
    { month: "Month 12", investment: monthlyInvestment * 12, returns: monthlyInvestment * 5 },
  ];

  return (
    <SectionCard icon={Zap} title="Investment & Action Plan" impact="This plan is your roadmap to market dominance — prioritized by impact and designed for measurable ROI.">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatBadge label="Total Deliverables" value={data.totalDeliverables ?? deliverables.length} testId="stat-total-deliverables" />
        <StatBadge label="Est. Total Hours" value={totalHours || "—"} testId="stat-total-hours" />
        <StatBadge label="Monthly Investment" value={monthlyInvestment ? `$${monthlyInvestment.toLocaleString()}` : "—"} color="text-[#ff5800]" testId="stat-monthly-investment" />
      </div>

      {data.executiveNarrative && (
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-4 mb-6" data-testid="executive-narrative">
          <h4 className="text-sm font-semibold text-[#ff5800] mb-2 flex items-center gap-1"><Award className="w-4 h-4" /> Executive Summary</h4>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{data.executiveNarrative}</p>
        </div>
      )}

      {Object.entries(phases).sort(([a], [b]) => Number(a) - Number(b)).map(([phase, items]) => (
        <div key={phase} className="mb-6" data-testid={`phase-${phase}`}>
          <h4 className="font-semibold text-sm mb-3 text-gray-800">{phaseLabels[Number(phase)] || `Phase ${phase}`}</h4>
          <div className="space-y-2">
            {items.map((d, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors" data-testid={`deliverable-${phase}-${i}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{d.title}</span>
                    {d.priority && <Badge className={`text-[10px] ${priorityColor[d.priority] || ""}`} data-testid={`priority-${phase}-${i}`}>{d.priority}</Badge>}
                  </div>
                  {d.description && <p className="text-xs text-gray-500">{d.description}</p>}
                </div>
                {d.estimatedHours && <span className="text-xs text-gray-400 flex items-center gap-1 whitespace-nowrap" data-testid={`hours-${phase}-${i}`}><Clock className="w-3 h-3" />{d.estimatedHours}h</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {monthlyInvestment > 0 && (
        <>
          <h4 className="text-sm font-semibold mb-2">ROI Timeline (Projected)</h4>
          <div className="h-48" data-testid="roi-timeline-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roiTimelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <RTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="investment" name="Cumulative Investment" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returns" name="Projected Returns" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function PresentModeOverlay({ audit, sectionDataMap, currentSlide, setCurrentSlide, onClose, auditId, authParam, isClientView }: {
  audit: AuditRecord; sectionDataMap: SectionDataMap; currentSlide: number;
  setCurrentSlide: (fn: (s: number) => number) => void; onClose: () => void;
  auditId: number; authParam: string; isClientView: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 to-gray-950" style={{ height: "100dvh" }} data-testid="present-mode">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#ff5800] to-[#ffb41c]" />
      <button onClick={onClose} className="absolute top-4 right-6 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-background hover:bg-muted shadow-md transition-colors" aria-label="Close presentation" data-testid="button-close-present"><X className="w-5 h-5 text-muted-foreground" /></button>
      {currentSlide > 0 && (<button onClick={() => setCurrentSlide(s => Math.max(s - 1, 0))} className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-background hover:bg-muted shadow-md transition-colors" aria-label="Previous slide" data-testid="button-prev-slide"><ChevronLeft className="w-6 h-6 text-muted-foreground" /></button>)}
      {currentSlide < SECTIONS.length - 1 && (<button onClick={() => setCurrentSlide(s => Math.min(s + 1, SECTIONS.length - 1))} className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-background hover:bg-muted shadow-md transition-colors" aria-label="Next slide" data-testid="button-next-slide"><ChevronRight className="w-6 h-6 text-muted-foreground" /></button>)}
      <div className="h-full flex flex-col pt-2">
        <div className="flex-1 min-h-0 mx-16 mt-4 mb-14 bg-background rounded-2xl shadow-sm border border-gray-200 overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between px-8 pt-4 pb-0">
            <img src={logoIcon} alt="Building Brands Marketing" className="h-5 opacity-60" />
            <span className="text-xs text-gray-400" data-testid="slide-counter">{currentSlide + 1} / {SECTIONS.length}</span>
          </div>
          <div className="text-center px-12 pt-3 pb-4">
            <h2 className="text-3xl font-bold text-gray-900" data-testid="slide-title">{SECTIONS[currentSlide].label}</h2>
            <p className="text-sm text-gray-500 mt-1">{audit.businessName}</p>
          </div>
          <div className="flex-1 min-h-0 px-8 pb-8 overflow-y-auto">
            <SectionRenderer sectionId={SECTIONS[currentSlide].id} sectionDataMap={sectionDataMap} audit={audit} auditId={auditId} authParam={authParam} isClientView={isClientView} />
          </div>
        </div>
      </div>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2" data-testid="slide-dots">
        {SECTIONS.map((s, i) => (
          <TooltipProvider key={s.id}><Tooltip><TooltipTrigger asChild>
            <button onClick={() => setCurrentSlide(() => i)} className={`h-2 rounded-full transition-all duration-300 ${i === currentSlide ? "bg-[#ff5800] w-6" : "bg-gray-400 w-2 hover:bg-gray-300"}`} data-testid={`slide-dot-${i}`} />
          </TooltipTrigger><TooltipContent side="top">{s.label}</TooltipContent></Tooltip></TooltipProvider>
        ))}
      </div>
      {currentSlide === 0 && (<div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 text-xs text-gray-500 animate-pulse" data-testid="keyboard-hint">Arrow keys to navigate &middot; Esc to close</div>)}
    </div>
  );
}
