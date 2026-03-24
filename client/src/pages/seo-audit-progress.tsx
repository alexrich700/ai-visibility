import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getAdminQueryFn, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft, Check, X, Loader2, AlertCircle,
  BarChart3, Globe, Search, MapPin, Shield, Brain,
  Star, FileText, Zap, Calculator, FileCheck, Clock
} from "lucide-react";

interface SeoAudit {
  id: number;
  businessName: string;
  businessUrl: string;
  status: string;
  currentStage: string | null;
}

interface StageInfo {
  name: string;
  label: string;
  shortLabel: string;
  icon: typeof Check;
  status: "pending" | "running" | "complete" | "error";
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

const STAGE_CONFIG: Array<{ name: string; label: string; shortLabel: string; icon: typeof Check }> = [
  { name: "intake", label: "Site Crawl & Intake", shortLabel: "Intake", icon: Globe },
  { name: "technical_audit", label: "Technical Audit", shortLabel: "Technical", icon: Shield },
  { name: "keyword_research", label: "Keyword Research", shortLabel: "Keywords", icon: Search },
  { name: "serp_rankings", label: "SERP Rankings", shortLabel: "SERPs", icon: BarChart3 },
  { name: "geo_grid", label: "Geo Grid Analysis", shortLabel: "Grid", icon: MapPin },
  { name: "competitive_intel", label: "Competitive Intel", shortLabel: "Compete", icon: Zap },
  { name: "geo_visibility", label: "AI/GEO Visibility", shortLabel: "AI/GEO", icon: Brain },
  { name: "review_health", label: "Review Health", shortLabel: "Reviews", icon: Star },
  { name: "gap_analysis", label: "Gap Analysis", shortLabel: "Gaps", icon: FileText },
  { name: "content_scoring", label: "Content Scoring", shortLabel: "Scoring", icon: Calculator },
  { name: "scoping_engine", label: "Scoping Engine", shortLabel: "Scope", icon: FileCheck },
  { name: "report_generation", label: "Report Generation", shortLabel: "Report", icon: Clock },
];

export default function SeoAuditProgress() {
  const [, params] = useRoute("/admin/seo-audits/:id/progress");
  const [, navigate] = useLocation();
  const auditId = params?.id ? parseInt(params.id, 10) : null;
  const eventSourceRef = useRef<EventSource | null>(null);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [hadErrors, setHadErrors] = useState(false);
  const [activeStageDetail, setActiveStageDetail] = useState<StageInfo | null>(null);

  const [stages, setStages] = useState<StageInfo[]>(
    STAGE_CONFIG.map(s => ({ ...s, status: "pending" as const }))
  );

  const { data: audit } = useQuery<SeoAudit>({
    queryKey: ["/api/seo-audits", auditId],
    queryFn: getAdminQueryFn({ on401: "throw" }),
    enabled: !!auditId,
    refetchInterval: pipelineComplete ? false : 5000,
  });

  useEffect(() => {
    if (!auditId) return;

    if (audit?.status === "completed" || audit?.status === "completed_with_errors") {
      setStages(prev => prev.map(s => ({ ...s, status: s.status === "pending" ? "complete" : s.status })));
      setPipelineComplete(true);
      setHadErrors(audit.status === "completed_with_errors");
      return;
    }
    if (audit?.status === "failed") {
      setPipelineComplete(true);
      setHadErrors(true);
      return;
    }

    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const connectSSE = async () => {
      if (cancelled) return;

      let sseUrl = `/api/seo-audits/${auditId}/status`;
      try {
        const tokenRes = await apiRequest("POST", `/api/seo-audits/${auditId}/stream-token`, undefined, { useAdminAuth: true });
        const { streamToken } = await tokenRes.json();
        sseUrl = `/api/seo-audits/${auditId}/status?streamToken=${streamToken}`;
      } catch {
        // fall through
      }

      if (cancelled) return;

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        retryCount = 0;
        try {
          const data = JSON.parse(event.data);

          if (data.type === "stage_start" && data.stage) {
            setStages(prev => prev.map(s =>
              s.name === data.stage ? { ...s, status: "running", startedAt: data.timestamp } : s
            ));
          }

          if (data.type === "stage_complete" && data.stage) {
            setStages(prev => prev.map(s =>
              s.name === data.stage ? { ...s, status: "complete", completedAt: data.timestamp } : s
            ));
          }

          if (data.type === "stage_error" && data.stage) {
            setStages(prev => prev.map(s =>
              s.name === data.stage ? { ...s, status: "error", error: data.error, completedAt: data.timestamp } : s
            ));
            setHadErrors(true);
          }

          if (data.type === "pipeline_complete" || data.type === "pipeline_error") {
            setPipelineComplete(true);
            if (data.type === "pipeline_error") setHadErrors(true);
            es.close();
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (!cancelled && retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(() => connectSSE(), 2000 * retryCount);
        }
      };
    };

    connectSSE();

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [auditId, audit?.status]);

  const completedCount = stages.filter(s => s.status === "complete").length;
  const errorCount = stages.filter(s => s.status === "error").length;
  const progress = Math.round(((completedCount + errorCount) / stages.length) * 100);
  const runningStage = stages.find(s => s.status === "running");

  if (!auditId) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Invalid audit ID</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-to-list">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Audits
        </Button>
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl" data-testid="text-audit-name">
                {audit?.businessName || "Loading..."}
              </CardTitle>
              {audit && (
                <p className="text-sm text-gray-500 mt-1">{audit.businessUrl}</p>
              )}
            </div>
            {pipelineComplete && !hadErrors && (
              <Button
                onClick={() => navigate(`/admin/seo-audits/${auditId}/dashboard`)}
                className="bg-[#ff5800] hover:bg-[#e04f00]"
                data-testid="button-view-dashboard"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Dashboard
              </Button>
            )}
            {pipelineComplete && hadErrors && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                <AlertCircle className="w-4 h-4 mr-1" />
                Completed with errors
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {pipelineComplete
                  ? hadErrors ? "Pipeline finished with errors" : "Pipeline complete"
                  : runningStage
                    ? `Running: ${runningStage.label}`
                    : `Waiting... ${progress}%`
                }
              </span>
              <span className="text-sm text-gray-500">
                {completedCount}/{stages.length} stages
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  hadErrors ? "bg-orange-500" : pipelineComplete ? "bg-green-500" : "bg-[#ff5800]"
                }`}
                style={{ width: `${progress}%` }}
                data-testid="progress-bar"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-0 mb-8 overflow-x-auto py-4">
            {stages.map((stage, i) => {
              const Icon = stage.icon;
              const isActive = stage.status === "running";
              return (
                <div key={stage.name} className="flex items-center flex-shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex flex-col items-center gap-1.5 min-w-[60px]"
                        onClick={() => setActiveStageDetail(stage)}
                        data-testid={`stage-indicator-${stage.name}`}
                      >
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                          isActive
                            ? "border-[#ff5800] bg-[#ff5800] text-white shadow-lg shadow-orange-200 scale-110"
                            : stage.status === "complete"
                            ? "border-green-500 bg-green-500 text-white"
                            : stage.status === "error"
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-gray-300 bg-white text-gray-400"
                        }`}>
                          {isActive ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : stage.status === "complete" ? (
                            <Check className="w-4 h-4" />
                          ) : stage.status === "error" ? (
                            <X className="w-4 h-4" />
                          ) : (
                            <Icon className="w-4 h-4" />
                          )}
                        </div>
                        <span className={`text-[10px] font-medium text-center leading-tight ${
                          isActive ? "text-[#ff5800]" :
                          stage.status === "complete" ? "text-green-600" :
                          stage.status === "error" ? "text-red-600" :
                          "text-gray-400"
                        }`}>
                          {stage.shortLabel}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">{stage.label}</p>
                      {stage.error && <p className="text-red-300 text-xs mt-1">{stage.error}</p>}
                      {stage.status === "complete" && stage.startedAt && stage.completedAt && (
                        <p className="text-gray-300 text-xs mt-1">
                          Duration: {Math.round((stage.completedAt - stage.startedAt) / 1000)}s
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                  {i < stages.length - 1 && (
                    <div className={`h-0.5 w-4 mx-0.5 flex-shrink-0 ${
                      stage.status === "complete" ? "bg-green-400" :
                      stage.status === "error" ? "bg-red-300" :
                      "bg-gray-200"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            {stages.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.name}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    stage.status === "running"
                      ? "bg-blue-50 border border-blue-200"
                      : stage.status === "complete"
                      ? "bg-green-50"
                      : stage.status === "error"
                      ? "bg-red-50"
                      : "bg-gray-50"
                  }`}
                  data-testid={`stage-${stage.name}`}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    stage.status === "running"
                      ? "bg-blue-500 text-white"
                      : stage.status === "complete"
                      ? "bg-green-500 text-white"
                      : stage.status === "error"
                      ? "bg-red-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}>
                    {stage.status === "running" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : stage.status === "complete" ? (
                      <Check className="w-4 h-4" />
                    ) : stage.status === "error" ? (
                      <X className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-medium">{i + 1}</span>
                    )}
                  </div>

                  <Icon className={`w-4 h-4 ${
                    stage.status === "running" ? "text-blue-600" :
                    stage.status === "complete" ? "text-green-600" :
                    stage.status === "error" ? "text-red-600" :
                    "text-gray-400"
                  }`} />

                  <div className="flex-1">
                    <span className={`text-sm font-medium ${
                      stage.status === "running" ? "text-blue-700" :
                      stage.status === "complete" ? "text-green-700" :
                      stage.status === "error" ? "text-red-700" :
                      "text-gray-500"
                    }`}>
                      {stage.label}
                    </span>
                    {stage.error && (
                      <p className="text-xs text-red-500 mt-0.5 truncate max-w-md">{stage.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {stage.startedAt && (
                      <span className="text-[10px] text-gray-400 tabular-nums" data-testid={`stage-start-time-${stage.name}`}>
                        {new Date(stage.startedAt).toLocaleTimeString()}
                      </span>
                    )}
                    {stage.status === "running" && (
                      <Badge variant="outline" className="text-xs border-blue-200 text-blue-600">Running</Badge>
                    )}
                    {stage.status === "complete" && stage.startedAt && stage.completedAt && (
                      <span className="text-xs text-gray-400 tabular-nums" data-testid={`stage-duration-${stage.name}`}>
                        {Math.round((stage.completedAt - stage.startedAt) / 1000)}s
                      </span>
                    )}
                    {stage.status === "error" && (
                      <Badge variant="outline" className="text-xs border-red-200 text-red-600">Failed</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {pipelineComplete && (
            <div className="mt-6 pt-4 border-t flex justify-between">
              <Button variant="outline" onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-after-complete">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to List
              </Button>
              {(audit?.status === "completed" || audit?.status === "completed_with_errors") && (
                <Button
                  onClick={() => navigate(`/admin/seo-audits/${auditId}/dashboard`)}
                  className="bg-[#ff5800] hover:bg-[#e04f00]"
                  data-testid="button-goto-dashboard"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Dashboard
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
