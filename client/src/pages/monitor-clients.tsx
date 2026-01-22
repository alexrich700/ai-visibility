import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAdminQueryFn } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Building2, Globe, MapPin, Calendar, TrendingUp, Settings, Trash2,
  MoreVertical, Plus, Eye, RefreshCw, Loader2, Users, ArrowLeft, BarChart3
} from "lucide-react";
import logoIcon from "@assets/images_1765741951084.png";
import type { MonitoringClient } from "@shared/schema";

interface ClientWithLatestSession extends MonitoringClient {
  latestSession?: {
    id: number;
    overallScore: number;
    chatgptScore: number;
    googleAIScore: number;
    createdAt: string;
  };
  groupCount?: number;
  promptCount?: number;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 70) return "bg-green-100";
  if (score >= 40) return "bg-yellow-100";
  return "bg-red-100";
}

export default function MonitorClients() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientWithLatestSession | null>(null);

  const { data: clients = [], isLoading } = useQuery<ClientWithLatestSession[]>({
    queryKey: ["/api/monitoring/clients-with-stats"],
    queryFn: getAdminQueryFn({ on401: "throw" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (clientId: number) => {
      await apiRequest("DELETE", `/api/monitoring/clients/${clientId}`, undefined, { useAdminAuth: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/clients-with-stats"] });
      toast({
        title: "Client deleted",
        description: "The client and all associated data have been removed.",
      });
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete client",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (client: ClientWithLatestSession) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (clientToDelete) {
      deleteMutation.mutate(clientToDelete.id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <img src={logoIcon} alt="Logo" className="w-10 h-10 rounded-lg" />
              <div>
                <h1 className="text-xl font-bold tracking-tight">Monitoring Clients</h1>
                <p className="text-sm text-gray-500">Manage your recurring visibility audits</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => navigate("/monitor/setup")}
            className="bg-[#5599f9] hover:bg-[#4488e8]"
            data-testid="button-add-client"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#5599f9]" />
          </div>
        ) : clients.length === 0 ? (
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No clients yet</h3>
              <p className="text-gray-500 text-center max-w-md mb-6">
                Get started by adding your first monitoring client. We'll track their AI visibility across ChatGPT and Google AI.
              </p>
              <Button
                onClick={() => navigate("/monitor/setup")}
                className="bg-[#5599f9] hover:bg-[#4488e8]"
                data-testid="button-add-first-client"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-600">
                <span className="font-semibold text-gray-900">{clients.length}</span> monitoring client{clients.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid gap-4">
              {clients.map((client) => (
                <Card
                  key={client.id}
                  className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  data-testid={`card-client-${client.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">{client.businessName}</h3>
                          <Badge
                            variant={client.isActive ? "default" : "secondary"}
                            className={client.isActive ? "bg-green-100 text-green-700" : ""}
                          >
                            {client.isActive ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          {client.domain && (
                            <div className="flex items-center gap-1">
                              <Globe className="w-4 h-4" />
                              <span>{client.domain}</span>
                            </div>
                          )}
                          {client.industry && (
                            <div className="flex items-center gap-1">
                              <Building2 className="w-4 h-4" />
                              <span>{client.industry}</span>
                            </div>
                          )}
                          {client.city && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{client.city}</span>
                            </div>
                          )}
                        </div>
                        {client.groupCount !== undefined && (
                          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                            <span>{client.groupCount} service group{client.groupCount !== 1 ? "s" : ""}</span>
                            <span className="text-gray-300">|</span>
                            <span>{client.promptCount || 0} prompts</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-6">
                        {client.latestSession ? (
                          <div className="text-center">
                            <div
                              className={`inline-flex items-center justify-center w-16 h-16 rounded-xl font-bold text-2xl ${getScoreBgColor(client.latestSession.overallScore)} ${getScoreColor(client.latestSession.overallScore)}`}
                            >
                              {client.latestSession.overallScore}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(client.latestSession.createdAt), "MMM d")}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gray-100 text-gray-400 font-bold text-lg">
                              --
                            </div>
                            <div className="text-xs text-gray-400 mt-1">No scans yet</div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/monitor/dashboard/${client.id}`)}
                            data-testid={`button-view-${client.id}`}
                          >
                            <BarChart3 className="w-4 h-4 mr-1" />
                            View Report
                          </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-menu-${client.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/monitor/dashboard/${client.id}`)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Dashboard
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/monitor/settings/${client.id}`)}>
                                <Settings className="w-4 h-4 mr-2" />
                                Edit Settings
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDelete(client)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Client
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
          </div>
        )}
      </main>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{clientToDelete?.businessName}</strong>? This will permanently remove all associated data including scan history, prompts, and analytics. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
