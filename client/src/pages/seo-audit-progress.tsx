import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getAdminQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  icon: typeof Check;
  status: "pending" | "running" | "complete" | "error";
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

const STAGE_CONFIG: Array<{ name: string; label: string; icon: typeof Check }> = [
  { name: "intake", label: "Site Crawl & Intake", icon: Globe },
  { name: "technical_audit", label: "Technical Audit", icon: Shield },
  { name: "keyword_research", label: "Keyword Research", icon: Search },
  { name: "serp_rankings", label: "SERP Rankings", icon: BarChart3 },
  { name: "geo_grid", label: "Geo Grid Analysis", icon: MapPin },
  { name: "competitive_intel", label: "Competitive Intel", icon: Zap },
  { name: "geo_visibility", label: "AI/GEO Visibility", icon: Brain },
  { name: "review_health", label: "Review Health", icon: Star },
  { name: "gap_analysis", label: "Gap Analysis", icon: FileText },
  { name: "content_scoring", label: "Content Scoring", icon: Calculator },
  { name: "scoping_engine", label: "Scoping Engine", icon: FileCheck },
  { name: "report_generation", label: "Report Generation", icon: Clock },
];

export default function SeoAuditProgress() {
  const [, params] = useRoute("/admin/seo-audits/:id/progress");
  const [, navigate] = useLocation();
  const auditId = params?.id ? parseInt(params.id, 10) : null;
  const eventSourceRef = useRef<EventSource | null>(null);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [hadErrors, setHadErrors] = useState(false);

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

    const token = sessionStorage.getItem("adminToken");
    const url = `/api/seo-audits/${auditId}/status${token ? `?token=${token}` : ""}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
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
      // SSE will auto-reconnect; no action needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [auditId, audit?.status]);

  const completedCount = stages.filter(s => s.status === "complete").length;
  const errorCount = stages.filter(s => s.status === "error").length;
  const progress = Math.round(((completedCount + errorCount) / stages.length) * 100);

  if (!auditId) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Invalid audit ID</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
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
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {pipelineComplete
                  ? hadErrors ? "Pipeline finished with errors" : "Pipeline complete"
                  : `Running... ${progress}%`
                }
              </span>
              <span className="text-sm text-gray-500">
                {completedCount}/{stages.length} stages
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  hadErrors ? "bg-orange-500" : pipelineComplete ? "bg-green-500" : "bg-[#ff5800]"
                }`}
                style={{ width: `${progress}%` }}
                data-testid="progress-bar"
              />
            </div>
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

                  {stage.status === "running" && (
                    <Badge variant="outline" className="text-xs border-blue-200 text-blue-600">Running</Badge>
                  )}
                  {stage.status === "complete" && stage.startedAt && stage.completedAt && (
                    <span className="text-xs text-gray-400">
                      {Math.round((stage.completedAt - stage.startedAt) / 1000)}s
                    </span>
                  )}
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
