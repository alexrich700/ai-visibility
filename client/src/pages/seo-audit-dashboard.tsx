import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useRoute, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getAdminQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  ArrowLeft, Share2, Presentation, ChevronLeft, ChevronRight,
  X, Loader2, MapPin, Target, Shield, FileText, Link2,
  Star, DollarSign, AlertTriangle, CheckCircle, XCircle, Search, Eye,
  ChevronDown, ChevronUp, Zap, Award, Check,
  Cpu, Clock,
} from "lucide-react";
import { format } from "date-fns";
import logoIcon from "@assets/Motivent_Logo_-_Tertiary_1774297439930.png";

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
  if (rank === null) return "bg-gray-100 text-gray-400";
  if (rank <= 3) return "bg-green-100 text-green-700";
  if (rank <= 7) return "bg-yellow-100 text-yellow-700";
  if (rank <= 10) return "bg-orange-100 text-orange-700";
  if (rank <= 20) return "bg-red-100 text-red-600";
  return "bg-gray-100 text-gray-500";
};

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-600 bg-green-50 border-green-200",
  B: "text-blue-600 bg-blue-50 border-blue-200",
  C: "text-yellow-600 bg-yellow-50 border-yellow-200",
  D: "text-orange-600 bg-orange-50 border-orange-200",
  F: "text-red-600 bg-red-50 border-red-200",
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

  const { data: audit, isLoading: auditLoading } = useQuery<any>({
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

  const fetchSection = (section: string) => async () => {
    const headers: Record<string, string> = {};
    if (!isClientView) {
      const t = sessionStorage.getItem("adminToken");
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }
    const res = await fetch(
      `/api/seo-audits/${effectiveId}/sections/${section}${authParam}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Failed to load ${section}`);
    return res.json();
  };

  const { data: snapshotData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "snapshot"], queryFn: fetchSection("snapshot"), enabled: !!effectiveId });
  const { data: geogridData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "geogrid"], queryFn: fetchSection("geogrid"), enabled: !!effectiveId });
  const { data: geoVisData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "geo_visibility"], queryFn: fetchSection("geo_visibility"), enabled: !!effectiveId });
  const { data: rankingsData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "rankings"], queryFn: fetchSection("rankings"), enabled: !!effectiveId });
  const { data: revenueData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "revenue"], queryFn: fetchSection("revenue"), enabled: !!effectiveId });
  const { data: technicalData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "technical"], queryFn: fetchSection("technical"), enabled: !!effectiveId });
  const { data: contentData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "content_gaps"], queryFn: fetchSection("content_gaps"), enabled: !!effectiveId });
  const { data: backlinksData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "backlinks"], queryFn: fetchSection("backlinks"), enabled: !!effectiveId });
  const { data: reviewsData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "reviews"], queryFn: fetchSection("reviews"), enabled: !!effectiveId });
  const { data: actionData } = useQuery({ queryKey: ["/api/seo-audits", effectiveId, "sections", "action_plan"], queryFn: fetchSection("action_plan"), enabled: !!effectiveId });

  const sectionDataMap: Record<SectionId, any> = {
    snapshot: snapshotData,
    geogrid: geogridData,
    geo_visibility: geoVisData,
    rankings: rankingsData,
    revenue: revenueData,
    technical: technicalData,
    content_gaps: contentData,
    backlinks: backlinksData,
    reviews: reviewsData,
    action_plan: actionData,
  };

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleShare = async () => {
    if (!effectiveId) return;
    try {
      const res = await apiRequest("POST", `/api/seo-audits/${effectiveId}/share`, undefined, { useAdminAuth: true });
      const data = await res.json();
      const shareUrl = `${window.location.origin}/seo-audit/view/${data.token}`;
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
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurrentSlide(s => Math.min(s + 1, SECTIONS.length - 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentSlide(s => Math.max(s - 1, 0));
      } else if (e.key === "Escape") {
        setPresentMode(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [presentMode]);

  if (auditLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#ff5800]" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <h1 className="text-xl font-bold">Audit Not Found</h1>
        <Button onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-list">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Audits
        </Button>
      </div>
    );
  }

  const marketScore = audit.marketPositionScore ?? 0;

  return (
    <>
      <div className="flex h-[calc(100vh-64px)]" data-testid="seo-dashboard">
        {!isClientView && (
          <aside className="w-60 border-r bg-white flex-shrink-0 overflow-y-auto" data-testid="dashboard-sidebar">
            <div className="p-4 border-b">
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-list" className="mb-2 -ml-2">
                <ArrowLeft className="w-4 h-4 mr-1" /> Audits
              </Button>
              <h2 className="font-semibold text-sm truncate">{audit.businessName}</h2>
              <p className="text-xs text-gray-500">{format(new Date(audit.createdAt), "MMM d, yyyy")}</p>
            </div>
            <nav className="py-2">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                const hasData = !!sectionDataMap[s.id];
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollToSection(s.id)}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                      activeSection === s.id ? "bg-orange-50 text-[#ff5800] font-medium border-r-2 border-[#ff5800]" : "text-gray-600"
                    }`}
                    data-testid={`nav-${s.id}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{s.label}</span>
                    {hasData && <CheckCircle className="w-3 h-3 text-green-500 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <main className="flex-1 overflow-y-auto bg-gray-50">
          <header className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between" data-testid="dashboard-header">
            <div className="flex items-center gap-4">
              {isClientView && <img src={logoIcon} alt="Motivent" className="h-6" />}
              <div>
                <h1 className="text-lg font-bold">{audit.businessName}</h1>
                <p className="text-xs text-gray-500">SEO Audit &middot; {format(new Date(audit.createdAt), "MMMM d, yyyy")}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                marketScore >= 70 ? "bg-green-100 text-green-700" :
                marketScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              }`} data-testid="market-score-badge">
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
              <div
                key={s.id}
                ref={el => { sectionRefs.current[s.id] = el; }}
                id={`section-${s.id}`}
                data-testid={`section-${s.id}`}
              >
                <SectionRenderer sectionId={s.id} data={sectionDataMap[s.id]} audit={audit} auditId={effectiveId} authParam={authParam} isClientView={isClientView} />
              </div>
            ))}
          </div>
        </main>
      </div>

      {presentMode && (
        <PresentModeOverlay
          audit={audit}
          sectionDataMap={sectionDataMap}
          currentSlide={currentSlide}
          setCurrentSlide={setCurrentSlide}
          onClose={() => setPresentMode(false)}
          auditId={effectiveId}
          authParam={authParam}
          isClientView={isClientView}
        />
      )}
    </>
  );
}

function SectionRenderer({ sectionId, data, audit, auditId, authParam, isClientView }: {
  sectionId: SectionId; data: any; audit: any; auditId: number; authParam: string; isClientView: boolean;
}) {
  const section = SECTIONS.find(s => s.id === sectionId)!;
  const Icon = section.icon;

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-[#ff5800]" /> {section.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  switch (sectionId) {
    case "snapshot": return <SnapshotSection data={data} />;
    case "geogrid": return <GeoGridSection data={data} auditId={auditId} authParam={authParam} isClientView={isClientView} />;
    case "geo_visibility": return <GeoVisibilitySection data={data} />;
    case "rankings": return <RankingsSection data={data} />;
    case "revenue": return <RevenueSection data={data} />;
    case "technical": return <TechnicalSection data={data} />;
    case "content_gaps": return <ContentGapsSection data={data} />;
    case "backlinks": return <BacklinksSection data={data} />;
    case "reviews": return <ReviewsSection data={data} />;
    case "action_plan": return <ActionPlanSection data={data} />;
    default: return null;
  }
}

function SectionCard({ icon: Icon, title, impact, children }: { icon: any; title: string; impact?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 bg-[#ff5800]/10 rounded-lg">
            <Icon className="w-5 h-5 text-[#ff5800]" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        {impact && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-sm text-gray-600 italic flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#ff5800]" /> {impact}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBadge({ label, value, color = "text-gray-900" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center px-4 py-3 bg-gray-50 rounded-lg">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function SnapshotSection({ data }: { data: any }) {
  const chartData = [
    { name: "Market Score", value: data.marketPositionScore ?? 0 },
    { name: "Site Health", value: data.siteHealthGrade === "A" ? 90 : data.siteHealthGrade === "B" ? 75 : data.siteHealthGrade === "C" ? 60 : data.siteHealthGrade === "D" ? 40 : 20 },
    { name: "SoLV", value: Math.round((data.shareOfLocalVoice ?? 0) * 100) },
  ];

  return (
    <SectionCard icon={Target} title="Competitive Snapshot" impact="Your competitors are winning in key areas. Here's exactly how to catch them.">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatBadge label="Market Position" value={`${data.marketPositionScore ?? 0}/100`} color={data.marketPositionScore >= 70 ? "text-green-600" : data.marketPositionScore >= 40 ? "text-yellow-600" : "text-red-600"} />
        <StatBadge label="Site Health" value={data.siteHealthGrade || "—"} color={GRADE_COLOR[data.siteHealthGrade]?.split(" ")[0] || "text-gray-600"} />
        <StatBadge label="Share of Local Voice" value={`${Math.round((data.shareOfLocalVoice ?? 0) * 100)}%`} />
        <StatBadge label="Keyword Gaps" value={data.totalKeywordGaps ?? 0} color="text-red-600" />
        <StatBadge label="Content Gaps" value={data.totalContentGaps ?? 0} color="text-red-600" />
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} />
            <RTooltip />
            <Bar dataKey="value" fill="#ff5800" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={i === 0 ? "#ff5800" : i === 1 ? "#ffb41c" : "#22c55e"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function GeoGridSection({ data, auditId, authParam, isClientView }: { data: any; auditId: number; authParam: string; isClientView: boolean }) {
  const [activeKw, setActiveKw] = useState<string>(data.grids?.[0]?.keyword || "");

  const activeGrid = data.grids?.find((g: any) => g.keyword === activeKw);

  return (
    <SectionCard icon={MapPin} title="Geo Grid" impact="Your local search visibility determines how many nearby customers find you vs. your competitors.">
      {data.grids?.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {data.grids.map((g: any) => (
              <Button
                key={g.keyword}
                variant={activeKw === g.keyword ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveKw(g.keyword)}
                className={activeKw === g.keyword ? "bg-[#ff5800]" : ""}
                data-testid={`geogrid-tab-${g.keyword}`}
              >
                {g.keyword}
              </Button>
            ))}
          </div>
          {activeGrid && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBadge label="Your SoLV" value={`${Math.round((activeGrid.clientSolv ?? 0) * 100)}%`} color="text-[#ff5800]" />
              <StatBadge label="Avg Rank" value={activeGrid.clientAvgRank?.toFixed(1) || "—"} />
              {activeGrid.competitorName && (
                <>
                  <StatBadge label={`${activeGrid.competitorName} SoLV`} value={`${Math.round((activeGrid.competitorSolv ?? 0) * 100)}%`} color="text-gray-600" />
                </>
              )}
            </div>
          )}
          <GeoGridMap auditId={auditId} keyword={activeKw} authParam={authParam} isClientView={isClientView} />
        </>
      ) : (
        <p className="text-gray-500 text-sm py-4">No geo grid data available.</p>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> #1-3</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> #4-7</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> #8-10</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> #11-20</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> Not Found</span>
      </div>
    </SectionCard>
  );
}

function GeoGridMap({ auditId, keyword, authParam, isClientView }: { auditId: number; keyword: string; authParam: string; isClientView: boolean }) {
  const { data: gridData } = useQuery({
    queryKey: ["/api/seo-audits", auditId, "geogrid", keyword],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (!isClientView) {
        const t = sessionStorage.getItem("adminToken");
        if (t) headers["Authorization"] = `Bearer ${t}`;
      }
      const res = await fetch(`/api/seo-audits/${auditId}/geogrid/${encodeURIComponent(keyword)}${authParam}`, { headers });
      if (!res.ok) throw new Error("Failed to load grid");
      return res.json();
    },
    enabled: !!keyword,
  });

  if (!gridData?.points?.length) {
    return <div className="h-40 flex items-center justify-center bg-gray-50 rounded text-gray-400 text-sm">No grid points available</div>;
  }

  const points = gridData.points;
  const rankColor = (r: number | null) => {
    if (r === null) return "#9ca3af";
    if (r <= 3) return "#22c55e";
    if (r <= 7) return "#eab308";
    if (r <= 10) return "#f97316";
    if (r <= 20) return "#ef4444";
    return "#9ca3af";
  };

  const minLat = Math.min(...points.map((p: any) => p.lat));
  const maxLat = Math.max(...points.map((p: any) => p.lat));
  const minLng = Math.min(...points.map((p: any) => p.lng));
  const maxLng = Math.max(...points.map((p: any) => p.lng));
  const padLat = (maxLat - minLat) * 0.15 || 0.01;
  const padLng = (maxLng - minLng) * 0.15 || 0.01;

  const svgW = 500;
  const svgH = 350;
  const toX = (lng: number) => ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * svgW;
  const toY = (lat: number) => svgH - ((lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * svgH;

  return (
    <div className="bg-gray-100 rounded-lg p-4 overflow-x-auto" data-testid="geogrid-map">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-xl mx-auto" style={{ minHeight: 250 }}>
        {points.map((pt: any, i: number) => (
          <g key={i}>
            <circle
              cx={toX(pt.lng)}
              cy={toY(pt.lat)}
              r={14}
              fill={rankColor(pt.clientRank)}
              opacity={0.85}
              stroke="white"
              strokeWidth={2}
            />
            <text
              x={toX(pt.lng)}
              y={toY(pt.lat)}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={10}
              fontWeight="bold"
            >
              {pt.clientRank ?? "—"}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function GeoVisibilitySection({ data }: { data: any }) {
  const platforms = [
    { name: "ChatGPT", found: data.foundInChatGpt ?? 0, cited: data.citedInChatGpt ?? 0, visibility: data.chatGptVisibility ?? 0 },
    { name: "Gemini", found: data.foundInGemini ?? 0, cited: data.citedInGemini ?? 0, visibility: data.geminiVisibility ?? 0 },
  ];

  return (
    <SectionCard icon={Eye} title="AI/GEO Visibility" impact="AI search engines are reshaping how customers discover businesses. Your visibility in these channels directly impacts future lead volume.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBadge label="AI Visibility Score" value={`${data.aiVisibilityScore ?? 0}%`} color={data.aiVisibilityScore >= 50 ? "text-green-600" : "text-red-600"} />
        <StatBadge label="Total Checked" value={data.totalChecked ?? 0} />
        <StatBadge label="Overall Visibility" value={`${Math.round(data.overallVisibility ?? 0)}%`} />
        <StatBadge label="ChatGPT vs Gemini" value={`${Math.round(data.chatGptVisibility ?? 0)}% / ${Math.round(data.geminiVisibility ?? 0)}%`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map(p => (
          <Card key={p.name} className="border">
            <CardContent className="pt-4">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Cpu className="w-4 h-4" /> {p.name}
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Mentioned</span>
                  <span className="font-medium">{p.found} times</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Cited (URL)</span>
                  <span className="font-medium">{p.cited} times</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Visibility</span>
                  <span className="font-medium">{Math.round(p.visibility)}%</span>
                </div>
                <Progress value={p.visibility} className="h-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionCard>
  );
}

function RankingsSection({ data }: { data: any }) {
  const [filter, setFilter] = useState<"all" | "page1" | "page2" | "notFound">("all");
  const [colPage, setColPage] = useState(0);

  const keywords = data.keywords || [];

  const cities = useMemo(() => {
    const set = new Set<string>();
    keywords.forEach((k: any) => { if (k.targetCity) set.add(k.targetCity); });
    return Array.from(set);
  }, [keywords]);

  const maxCols = 6;
  const visibleCities = cities.slice(colPage * maxCols, (colPage + 1) * maxCols);

  const services = useMemo(() => {
    const set = new Set<string>();
    keywords.forEach((k: any) => { if (k.targetService) set.add(k.targetService); });
    return Array.from(set);
  }, [keywords]);

  const filtered = useMemo(() => {
    return keywords.filter((k: any) => {
      if (filter === "page1") return k.currentOrganicRank !== null && k.currentOrganicRank <= 10;
      if (filter === "page2") return k.currentOrganicRank !== null && k.currentOrganicRank > 10 && k.currentOrganicRank <= 20;
      if (filter === "notFound") return k.currentOrganicRank === null;
      return true;
    });
  }, [keywords, filter]);

  return (
    <SectionCard icon={Search} title="Keyword Rankings" impact="Every keyword where you don't rank on page 1 is revenue going to your competitors.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatBadge label="Total Tracked" value={data.totalTracked ?? 0} />
        <StatBadge label="Page 1 (Top 10)" value={data.page1Count ?? 0} color="text-green-600" />
        <StatBadge label="Page 2 (11-20)" value={data.page2Count ?? 0} color="text-yellow-600" />
        <StatBadge label="In AI Overview" value={data.aiOverviewCount ?? 0} color="text-blue-600" />
      </div>

      <div className="flex gap-2 mb-3">
        {(["all", "page1", "page2", "notFound"] as const).map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}
            className={filter === f ? "bg-[#ff5800]" : ""} data-testid={`filter-${f}`}>
            {f === "all" ? "All" : f === "page1" ? "Top 10" : f === "page2" ? "11-20" : "Not Found"}
          </Button>
        ))}
      </div>

      {cities.length > 0 && (
        <div className="overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{filtered.length} keywords</span>
            {cities.length > maxCols && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setColPage(p => Math.max(0, p - 1))} disabled={colPage === 0} data-testid="btn-prev-cols">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-gray-500">{colPage + 1}/{Math.ceil(cities.length / maxCols)}</span>
                <Button variant="ghost" size="sm" onClick={() => setColPage(p => Math.min(Math.ceil(cities.length / maxCols) - 1, p + 1))} disabled={(colPage + 1) * maxCols >= cities.length} data-testid="btn-next-cols">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium text-gray-600">Keyword</th>
                <th className="text-center py-2 px-2 font-medium text-gray-600">Vol</th>
                {visibleCities.map(c => (
                  <th key={c} className="text-center py-2 px-2 font-medium text-gray-600 whitespace-nowrap">{c}</th>
                ))}
                {visibleCities.length === 0 && <th className="text-center py-2 px-2 font-medium text-gray-600">Rank</th>}
              </tr>
            </thead>
            <tbody>
              {services.map(svc => {
                const svcKws = filtered.filter((k: any) => k.targetService === svc);
                if (svcKws.length === 0) return null;
                return (
                  <Fragment key={svc}>
                    <tr>
                      <td colSpan={2 + Math.max(visibleCities.length, 1)} className="pt-3 pb-1 px-2 font-semibold text-[#ff5800] text-xs uppercase tracking-wide">
                        {svc}
                      </td>
                    </tr>
                    {svcKws.map((kw: any, i: number) => (
                      <tr key={`${kw.keyword}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-2 max-w-[200px] truncate">{kw.keyword}</td>
                        <td className="py-1.5 px-2 text-center text-gray-400">{kw.searchVolume ?? "—"}</td>
                        {visibleCities.length > 0 ? visibleCities.map(city => {
                          const rank = kw.targetCity === city ? kw.currentOrganicRank : null;
                          return (
                            <td key={city} className="py-1.5 px-2 text-center">
                              <span className={`inline-block w-8 py-0.5 rounded text-xs font-bold ${RANK_COLOR(rank)}`}>
                                {rank ?? "—"}
                              </span>
                            </td>
                          );
                        }) : (
                          <td className="py-1.5 px-2 text-center">
                            <span className={`inline-block w-8 py-0.5 rounded text-xs font-bold ${RANK_COLOR(kw.currentOrganicRank)}`}>
                              {kw.currentOrganicRank ?? "—"}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cities.length === 0 && filtered.length > 0 && (
        <div className="space-y-1">
          {filtered.slice(0, 25).map((kw: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded text-sm">
              <span className="truncate max-w-xs">{kw.keyword}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{kw.searchVolume ? `${kw.searchVolume}/mo` : ""}</span>
                <span className={`inline-block w-10 text-center py-0.5 rounded text-xs font-bold ${RANK_COLOR(kw.currentOrganicRank)}`}>
                  {kw.currentOrganicRank ?? "N/F"}
                </span>
              </div>
            </div>
          ))}
          {filtered.length > 25 && <p className="text-xs text-gray-400 text-center pt-2">+ {filtered.length - 25} more keywords</p>}
        </div>
      )}
    </SectionCard>
  );
}


function RevenueSection({ data }: { data: any }) {
  const summary = data.summary || {};
  const forecasts = data.forecasts || [];

  const funnelData = [
    { name: "Addressable Volume", value: forecasts.reduce((s: number, f: any) => s + (f.searchVolume || 0), 0), fill: "#ff5800" },
    { name: "Est. Clicks", value: summary.totalClicks || 0, fill: "#ffb41c" },
    { name: "Est. Conversions", value: summary.totalConversions || 0, fill: "#22c55e" },
  ];

  return (
    <SectionCard icon={DollarSign} title="Revenue Opportunity" impact="Every month without SEO investment, you're leaving revenue on the table for competitors to capture.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBadge label="Est. Monthly Clicks" value={summary.totalClicks?.toLocaleString() || "0"} />
        <StatBadge label="Est. Monthly Cost (PPC)" value={`$${summary.totalCost?.toLocaleString() || "0"}`} color="text-red-600" />
        <StatBadge label="Avg CPC" value={`$${summary.avgCpc || "0"}`} />
        <StatBadge label="Est. Conversions" value={summary.totalConversions || "0"} color="text-green-600" />
      </div>

      <div className="h-56 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={funnelData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
            <RTooltip />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {funnelData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {forecasts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="text-left py-2 px-2">Keyword</th>
                <th className="text-right py-2 px-2">Volume</th>
                <th className="text-right py-2 px-2">Clicks</th>
                <th className="text-right py-2 px-2">CPC</th>
                <th className="text-right py-2 px-2">Cost/mo</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.slice(0, 10).map((f: any, i: number) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
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
      )}
    </SectionCard>
  );
}

function TechnicalSection({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grade = data.grade || "—";
  const findings = data.findings || [];

  const categories = useMemo(() => {
    const cats: Record<string, { pass: number; fail: number; warn: number; items: any[] }> = {};
    const catNames: Record<string, string> = {
      speed: "Speed", mobile: "Mobile", crawlability: "Crawlability",
      schema: "Schema", onpage: "On-Page", security: "Security",
    };
    for (const f of findings) {
      const cat = f.category || "other";
      if (!cats[cat]) cats[cat] = { pass: 0, fail: 0, warn: 0, items: [] };
      cats[cat].items.push(f);
      if (f.status === "pass") cats[cat].pass++;
      else if (f.status === "fail") cats[cat].fail++;
      else cats[cat].warn++;
    }
    return Object.entries(cats).map(([key, val]) => ({
      key,
      name: catNames[key] || key,
      ...val,
      grade: val.fail === 0 ? "A" : val.fail <= 1 ? "B" : val.fail <= 3 ? "C" : val.fail <= 5 ? "D" : "F",
    }));
  }, [findings]);

  return (
    <SectionCard icon={Shield} title="Site Health" impact="Technical issues silently prevent search engines from finding and ranking your pages.">
      <div className="flex items-center gap-6 mb-6">
        <div className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center text-4xl font-bold ${GRADE_COLOR[grade] || "text-gray-600 bg-gray-50 border-gray-200"}`}>
          {grade}
        </div>
        <div>
          <p className="text-sm text-gray-500">{data.totalChecks || 0} checks performed</p>
          <p className="text-sm"><span className="text-green-600 font-medium">{data.passCount || 0} passed</span> &middot; <span className="text-red-600 font-medium">{data.failCount || 0} failed</span></p>
          <Progress value={data.passRate ?? 0} className="h-2 mt-2 w-48" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map(cat => (
          <Card key={cat.key} className="border cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setExpanded(e => ({ ...e, [cat.key]: !e[cat.key] }))}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">{cat.name}</h4>
                <span className={`text-lg font-bold px-2 rounded ${GRADE_COLOR[cat.grade] || ""}`}>{cat.grade}</span>
              </div>
              <p className="text-xs text-gray-500">{cat.pass} pass &middot; {cat.fail} fail &middot; {cat.warn} warn</p>
              {expanded[cat.key] && (
                <div className="mt-3 pt-3 border-t space-y-1.5">
                  {cat.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {item.status === "pass" ? <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" /> :
                       item.status === "fail" ? <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" /> :
                       <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />}
                      <div>
                        <p className="font-medium">{item.checkName}</p>
                        {item.detail && <p className="text-gray-500 mt-0.5">{item.detail}</p>}
                      </div>
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

function ContentGapsSection({ data }: { data: any }) {
  const gaps = data.gaps || [];
  const byType = data.byType || {};

  const typeLabels: Record<string, string> = {
    service_page: "Service Pages",
    city_page: "City Pages",
    subcity_page: "Sub-City Pages",
    comparison_page: "Comparison Pages",
    resource_page: "Resource Pages",
  };

  return (
    <SectionCard icon={FileText} title="Content Gap Analysis" impact={`You need ${data.totalGaps || 0} new pages to fully compete in your market.`}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(byType).map(([type, count]) => (
          <StatBadge key={type} label={typeLabels[type] || type} value={count as number} color="text-red-600" />
        ))}
        {Object.keys(byType).length === 0 && <StatBadge label="Total Gaps" value={data.totalGaps || 0} color="text-red-600" />}
      </div>

      {gaps.length > 0 && (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {gaps.slice(0, 30).map((g: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded text-sm">
              <div className="flex items-center gap-2">
                {g.exists ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                <span className={g.exists ? "text-gray-600" : "text-gray-900 font-medium"}>
                  {g.suggestedTitle || g.targetKeyword || `${g.service} — ${g.city || "General"}`}
                </span>
              </div>
              <Badge variant="outline" className="text-[10px]">{typeLabels[g.gapType] || g.gapType}</Badge>
            </div>
          ))}
          {gaps.length > 30 && <p className="text-xs text-gray-400 text-center pt-2">+ {gaps.length - 30} more gaps</p>}
        </div>
      )}
    </SectionCard>
  );
}

function BacklinksSection({ data }: { data: any }) {
  const competitors = data.competitors || [];

  const chartData = competitors.map((c: any) => ({
    name: c.businessName || c.domain,
    "Domain Rating": c.domainRating ?? 0,
    "Ref. Domains": c.referringDomains ?? 0,
  }));

  return (
    <SectionCard icon={Link2} title="Backlink Summary" impact="Backlinks are votes of trust from other websites. More high-quality links means higher rankings.">
      {chartData.length > 0 && (
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <RTooltip />
              <Legend />
              <Bar dataKey="Domain Rating" fill="#ff5800" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Ref. Domains" fill="#ffb41c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {competitors.length > 0 && (
        <div className="space-y-3">
          {competitors.map((c: any, i: number) => (
            <Card key={i} className="border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">{c.businessName || c.domain}</h4>
                  <Badge variant="outline">DR {c.domainRating ?? "—"}</Badge>
                </div>
                <p className="text-xs text-gray-500">
                  {c.referringDomains?.toLocaleString() || "—"} referring domains
                </p>
                {c.backlinkSummary && <p className="text-xs text-gray-600 mt-2">{c.backlinkSummary}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ReviewsSection({ data }: { data: any }) {
  const client = data.client;
  const competitors = data.competitors || [];

  return (
    <SectionCard icon={Star} title="Review Health" impact="Reviews are the #1 factor in local pack rankings and the first thing potential customers check.">
      {client ? (
        <div className="mb-6">
          <h4 className="font-medium text-sm mb-3">Your Review Profile</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBadge label="Total Reviews" value={client.totalReviews ?? 0} />
            <StatBadge label="Avg Rating" value={client.averageRating?.toFixed(1) ?? "—"} color={client.averageRating >= 4 ? "text-green-600" : "text-yellow-600"} />
            <StatBadge label="Review Velocity" value={`${client.reviewVelocity ?? 0}/mo`} />
            <StatBadge label="Platforms" value={
              (() => {
                const platforms = client.platformBreakdown as Record<string, any> | null;
                return platforms ? Object.keys(platforms).length : 0;
              })()
            } />
          </div>
          {client.sentimentSummary && (
            <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-3 rounded">{client.sentimentSummary}</p>
          )}
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-4">No review data available for your business.</p>
      )}

      {competitors.length > 0 && (
        <>
          <h4 className="font-medium text-sm mb-3">Competitor Reviews</h4>
          <div className="space-y-2">
            {competitors.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
                <span className="font-medium">{c.businessName || `Competitor ${i + 1}`}</span>
                <div className="flex items-center gap-4">
                  <span>{c.totalReviews ?? 0} reviews</span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" /> {c.averageRating?.toFixed(1) ?? "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function ActionPlanSection({ data }: { data: any }) {
  const phases = data.phases || {};
  const deliverables = data.deliverables || [];

  const phaseLabels: Record<number, string> = {
    1: "Phase 1: Foundation (Months 1-3)",
    2: "Phase 2: Growth (Months 4-6)",
    3: "Phase 3: Dominance (Months 7-12)",
  };

  const priorityColor: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-gray-100 text-gray-600",
  };

  return (
    <SectionCard icon={Zap} title="Investment & Action Plan" impact="This plan is your roadmap to market dominance — prioritized by impact and designed for measurable ROI.">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatBadge label="Total Deliverables" value={data.totalDeliverables ?? deliverables.length} />
        <StatBadge label="Est. Total Hours" value={data.estimatedTotalHours ?? "—"} />
        <StatBadge label="Monthly Investment" value={data.estimatedMonthlyInvestment ? `$${data.estimatedMonthlyInvestment.toLocaleString()}` : "—"} color="text-[#ff5800]" />
      </div>

      {data.executiveNarrative && (
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-[#ff5800] mb-2 flex items-center gap-1"><Award className="w-4 h-4" /> Executive Summary</h4>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{data.executiveNarrative}</p>
        </div>
      )}

      {Object.entries(phases).sort(([a], [b]) => Number(a) - Number(b)).map(([phase, items]: [string, any]) => (
        <div key={phase} className="mb-6">
          <h4 className="font-semibold text-sm mb-3 text-gray-800">{phaseLabels[Number(phase)] || `Phase ${phase}`}</h4>
          <div className="space-y-2">
            {items.map((d: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{d.title}</span>
                    {d.priority && <Badge className={`text-[10px] ${priorityColor[d.priority] || ""}`}>{d.priority}</Badge>}
                  </div>
                  {d.description && <p className="text-xs text-gray-500">{d.description}</p>}
                </div>
                {d.estimatedHours && (
                  <span className="text-xs text-gray-400 flex items-center gap-1 whitespace-nowrap">
                    <Clock className="w-3 h-3" /> {d.estimatedHours}h
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function PresentModeOverlay({ audit, sectionDataMap, currentSlide, setCurrentSlide, onClose, auditId, authParam, isClientView }: {
  audit: any; sectionDataMap: Record<SectionId, any>; currentSlide: number;
  setCurrentSlide: (fn: (s: number) => number) => void; onClose: () => void;
  auditId: number; authParam: string; isClientView: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 to-gray-950" data-testid="present-mode">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#ff5800] to-[#ffb41c]" />

      <button
        onClick={onClose}
        className="absolute top-4 right-6 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-md"
        data-testid="button-close-present"
      >
        <X className="w-5 h-5 text-gray-500" />
      </button>

      {currentSlide > 0 && (
        <button
          onClick={() => setCurrentSlide(s => Math.max(s - 1, 0))}
          className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-md"
          data-testid="button-prev-slide"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
      )}
      {currentSlide < SECTIONS.length - 1 && (
        <button
          onClick={() => setCurrentSlide(s => Math.min(s + 1, SECTIONS.length - 1))}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-md"
          data-testid="button-next-slide"
        >
          <ChevronRight className="w-6 h-6 text-gray-600" />
        </button>
      )}

      <div className="h-full flex flex-col pt-2">
        <div className="flex-1 min-h-0 mx-16 mt-4 mb-14 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between px-8 pt-4 pb-0">
            <img src={logoIcon} alt="Motivent" className="h-5 opacity-60" />
            <span className="text-xs text-gray-400">{currentSlide + 1} / {SECTIONS.length}</span>
          </div>
          <div className="text-center px-12 pt-3 pb-4">
            <h2 className="text-3xl font-bold text-gray-900">{SECTIONS[currentSlide].label}</h2>
            <p className="text-sm text-gray-500 mt-1">{audit.businessName}</p>
          </div>
          <div className="flex-1 min-h-0 px-8 pb-8 overflow-y-auto">
            <SectionRenderer
              sectionId={SECTIONS[currentSlide].id}
              data={sectionDataMap[SECTIONS[currentSlide].id]}
              audit={audit}
              auditId={auditId}
              authParam={authParam}
              isClientView={isClientView}
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        {SECTIONS.map((s, i) => (
          <TooltipProvider key={s.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCurrentSlide(() => i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === currentSlide ? "bg-[#ff5800] w-6" : "bg-gray-400 w-2 hover:bg-gray-300"
                  }`}
                  data-testid={`slide-dot-${i}`}
                />
              </TooltipTrigger>
              <TooltipContent side="top">{s.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {currentSlide === 0 && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 text-xs text-gray-500 animate-pulse">
          Arrow keys to navigate &middot; Esc to close
        </div>
      )}
    </div>
  );
}
