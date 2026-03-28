import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest, getAdminQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, MoreVertical, Eye, Trash2, Play, Loader2,
  Building2, Globe, MapPin, Calendar, BarChart3, Search
} from "lucide-react";
import { format } from "date-fns";

interface SeoAudit {
  id: number;
  businessName: string;
  businessUrl: string;
  businessType: string;
  industry: string | null;
  status: string;
  currentStage: string | null;
  siteHealthGrade: string | null;
  marketPositionScore: number | null;
  shareOfLocalVoice: number | null;
  totalContentGaps: number | null;
  magicLinkToken: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  draft: { label: "Draft", variant: "outline" },
  configuring: { label: "Configuring", variant: "outline", className: "border-blue-200 text-blue-700 bg-blue-50" },
  queued: { label: "Queued", variant: "secondary", className: "bg-yellow-50 text-yellow-700" },
  running: { label: "Running", variant: "default", className: "bg-blue-500" },
  completed: { label: "Completed", variant: "default", className: "bg-green-600" },
  completed_with_errors: { label: "Partial", variant: "default", className: "bg-orange-500" },
  failed: { label: "Failed", variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, variant: "outline" as const };
  return (
    <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>
      {status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {config.label}
    </Badge>
  );
}

export default function SeoAuditList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [auditToDelete, setAuditToDelete] = useState<SeoAudit | null>(null);

  const { data: audits = [], isLoading } = useQuery<SeoAudit[]>({
    queryKey: ["/api/seo-audits"],
    queryFn: getAdminQueryFn({ on401: "throw" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/seo-audits/${id}`, undefined, { useAdminAuth: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seo-audits"] });
      toast({ title: "Audit deleted", description: "The SEO audit has been removed." });
      setDeleteDialogOpen(false);
      setAuditToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/seo-audits/${id}/run`, undefined, { useAdminAuth: true });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/seo-audits"] });
      toast({ title: "Audit re-queued", description: "The pipeline has been re-started." });
      navigate(`/admin/seo-audits/${id}/progress`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to re-run", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">SEO Audits</h1>
          <p className="text-sm text-muted-foreground">Create and manage comprehensive SEO audits</p>
        </div>
        <Button
          onClick={() => navigate("/admin/seo-audits/new")}
          className="bg-[#ff5800] hover:bg-[#e04f00]"
          data-testid="button-new-audit"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Audit
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#ff5800]" />
        </div>
      ) : audits.length === 0 ? (
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No SEO audits yet</h3>
            <p className="text-gray-500 text-center max-w-md mb-6">
              Create your first SEO audit to analyze a client's search presence, local rankings, and content gaps.
            </p>
            <Button
              onClick={() => navigate("/admin/seo-audits/new")}
              className="bg-[#ff5800] hover:bg-[#e04f00]"
              data-testid="button-create-first-audit"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Audit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <Card
              key={audit.id}
              className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              data-testid={`card-audit-${audit.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{audit.businessName}</h3>
                      <StatusBadge status={audit.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Globe className="w-4 h-4" />
                        <span>{audit.businessUrl}</span>
                      </div>
                      {audit.industry && (
                        <div className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          <span>{audit.industry}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{audit.businessType === "local" ? "Local" : "National"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{format(new Date(audit.createdAt), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                    {audit.status === "running" && audit.currentStage && (
                      <div className="mt-2 text-sm text-blue-600 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Stage: {audit.currentStage.replace(/_/g, " ")}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {audit.siteHealthGrade && (
                      <div className="text-center">
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg font-bold text-lg ${
                          audit.siteHealthGrade === "A" ? "bg-green-100 text-green-700" :
                          audit.siteHealthGrade === "B" ? "bg-lime-100 text-lime-700" :
                          audit.siteHealthGrade === "C" ? "bg-yellow-100 text-yellow-700" :
                          audit.siteHealthGrade === "D" ? "bg-orange-100 text-orange-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {audit.siteHealthGrade}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Health</div>
                      </div>
                    )}

                    {audit.marketPositionScore !== null && (
                      <div className="text-center">
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg font-bold text-sm ${
                          audit.marketPositionScore >= 80 ? "bg-green-100 text-green-700" :
                          audit.marketPositionScore >= 60 ? "bg-lime-100 text-lime-700" :
                          audit.marketPositionScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {audit.marketPositionScore}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Position</div>
                      </div>
                    )}

                    {audit.shareOfLocalVoice !== null && (
                      <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm">
                          {audit.shareOfLocalVoice}%
                        </div>
                        <div className="text-xs text-gray-400 mt-1">SoLV</div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {(audit.status === "completed" || audit.status === "completed_with_errors") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/seo-audits/${audit.id}/dashboard`)}
                          data-testid={`button-dashboard-${audit.id}`}
                        >
                          <BarChart3 className="w-4 h-4 mr-1" />
                          Dashboard
                        </Button>
                      )}
                      {audit.status === "running" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/seo-audits/${audit.id}/progress`)}
                          data-testid={`button-progress-${audit.id}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Progress
                        </Button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-menu-${audit.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(audit.status === "completed" || audit.status === "completed_with_errors") && (
                            <DropdownMenuItem onClick={() => navigate(`/admin/seo-audits/${audit.id}/dashboard`)}>
                              <BarChart3 className="w-4 h-4 mr-2" />
                              View Dashboard
                            </DropdownMenuItem>
                          )}
                          {audit.status === "running" && (
                            <DropdownMenuItem onClick={() => navigate(`/admin/seo-audits/${audit.id}/progress`)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Progress
                            </DropdownMenuItem>
                          )}
                          {(audit.status === "completed" || audit.status === "completed_with_errors" || audit.status === "failed") && (
                            <DropdownMenuItem
                              onClick={() => rerunMutation.mutate(audit.id)}
                              disabled={rerunMutation.isPending}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Re-run Audit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => {
                              setAuditToDelete(audit);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete SEO Audit</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the audit for <strong>{auditToDelete?.businessName}</strong>? This will permanently remove all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => auditToDelete && deleteMutation.mutate(auditToDelete.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
