import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAdminToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Save, Plus, Trash2, Pencil, X, Tag, Building2,
  Globe, MapPin, Clock, Loader2, FolderOpen, MessageSquare, Crown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getSessionAwareQueryFn, queryClient } from "@/lib/queryClient";
import logoIcon from "@assets/images_1765741951084.png";
import type { MonitoringClient, MonitoringGroup, MonitoringPrompt } from "@shared/schema";

interface GroupWithPrompts extends MonitoringGroup {
  prompts: MonitoringPrompt[];
}

interface SettingsData {
  client: MonitoringClient;
  groups: GroupWithPrompts[];
}

export default function MonitorSettings() {
  const [, params] = useRoute("/monitor/settings/:id");
  const [, setLocation] = useLocation();
  const clientId = params?.id ? parseInt(params.id) : null;
  const { toast } = useToast();

  const [businessName, setBusinessName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [scope, setScope] = useState<"local" | "national">("local");
  const [cities, setCities] = useState<string[]>([]);
  const [newCity, setNewCity] = useState("");
  const [checkFrequencyDays, setCheckFrequencyDays] = useState(14);
  const [isActive, setIsActive] = useState(true);
  const [brandAliases, setBrandAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");

  const [editGroupDialog, setEditGroupDialog] = useState<{ open: boolean; group: MonitoringGroup | null }>({ open: false, group: null });
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupIsHighLevel, setEditGroupIsHighLevel] = useState(false);

  const [addGroupDialog, setAddGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupIsHighLevel, setNewGroupIsHighLevel] = useState(false);

  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<MonitoringGroup | null>(null);

  const [editPromptDialog, setEditPromptDialog] = useState<{ open: boolean; prompt: MonitoringPrompt | null; groupId: number | null }>({ open: false, prompt: null, groupId: null });
  const [editPromptText, setEditPromptText] = useState("");

  const [addPromptDialog, setAddPromptDialog] = useState<{ open: boolean; groupId: number | null }>({ open: false, groupId: null });
  const [newPromptText, setNewPromptText] = useState("");

  const [deletePromptConfirm, setDeletePromptConfirm] = useState<MonitoringPrompt | null>(null);

  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: authSession, isLoading: isAuthLoading } = useQuery<{ authenticated: boolean; isAdmin: boolean }>({
    queryKey: ["/api/monitoring/client-session"],
    queryFn: getSessionAwareQueryFn({ on401: "returnNull" }),
    staleTime: 30 * 1000,
  });
  const isAdmin = authSession?.isAdmin === true;

  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/monitoring/settings", clientId],
    queryFn: async () => {
      if (!clientId) throw new Error("No client ID");
      
      const token = getAdminToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const clientRes = await fetch(`/api/monitoring/dashboard/${clientId}`, { headers });
      if (!clientRes.ok) throw new Error("Failed to fetch client");
      const dashboardData = await clientRes.json();
      
      const groupsRes = await fetch(`/api/monitoring/clients/${clientId}/groups`, { headers });
      if (!groupsRes.ok) throw new Error("Failed to fetch groups");
      const groups: MonitoringGroup[] = await groupsRes.json();
      
      const groupsWithPrompts: GroupWithPrompts[] = await Promise.all(
        groups.map(async (group) => {
          const promptsRes = await fetch(`/api/monitoring/groups/${group.id}/prompts`, { headers });
          const prompts: MonitoringPrompt[] = promptsRes.ok ? await promptsRes.json() : [];
          return { ...group, prompts };
        })
      );
      
      return {
        client: dashboardData.client,
        groups: groupsWithPrompts,
      };
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (data?.client) {
      setBusinessName(data.client.businessName);
      setDomain(data.client.domain);
      setIndustry(data.client.industry);
      setScope(data.client.scope as "local" | "national");
      const loadedCities = data.client.cities && data.client.cities.length > 0
        ? data.client.cities
        : data.client.city ? [data.client.city] : [];
      setCities(loadedCities);
      setCheckFrequencyDays(data.client.checkFrequencyDays);
      setIsActive(data.client.isActive);
      setBrandAliases(data.client.brandAliases || []);
    }
  }, [data]);

  const updateClientMutation = useMutation({
    mutationFn: async (updates: Partial<MonitoringClient>) => {
      const res = await apiRequest("PATCH", `/api/monitoring/clients/${clientId}`, updates, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/dashboard", clientId] });
      toast({ title: "Settings saved", description: "Your changes have been saved successfully." });
      setHasChanges(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (groupData: { name: string; description: string; isHighLevelCategory: boolean }) => {
      const res = await apiRequest("POST", `/api/monitoring/clients/${clientId}/groups`, groupData, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      setAddGroupDialog(false);
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupIsHighLevel(false);
      toast({ title: "Group added", description: "New service group has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create group", variant: "destructive" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string; isHighLevelCategory?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/monitoring/groups/${id}`, data, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      setEditGroupDialog({ open: false, group: null });
      toast({ title: "Group updated", description: "Service group has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update group", variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await apiRequest("DELETE", `/api/monitoring/groups/${groupId}`, undefined, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      setDeleteGroupConfirm(null);
      toast({ title: "Group deleted", description: "Service group and its prompts have been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete group", variant: "destructive" });
    },
  });

  const createPromptMutation = useMutation({
    mutationFn: async ({ groupId, promptText }: { groupId: number; promptText: string }) => {
      const res = await apiRequest("POST", `/api/monitoring/groups/${groupId}/prompts`, { promptText }, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      setAddPromptDialog({ open: false, groupId: null });
      setNewPromptText("");
      toast({ title: "Prompt added", description: "New prompt has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create prompt", variant: "destructive" });
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: async ({ id, promptText }: { id: number; promptText: string }) => {
      const res = await apiRequest("PATCH", `/api/monitoring/prompts/${id}`, { promptText }, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      setEditPromptDialog({ open: false, prompt: null, groupId: null });
      toast({ title: "Prompt updated", description: "Prompt has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update prompt", variant: "destructive" });
    },
  });

  const deletePromptMutation = useMutation({
    mutationFn: async (promptId: number) => {
      const res = await apiRequest("DELETE", `/api/monitoring/prompts/${promptId}`, undefined, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/settings", clientId] });
      setDeletePromptConfirm(null);
      toast({ title: "Prompt deleted", description: "Prompt has been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete prompt", variant: "destructive" });
    },
  });

  const handleSaveClientSettings = async () => {
    setIsSaving(true);
    try {
      await updateClientMutation.mutateAsync({
        businessName,
        domain,
        industry,
        scope,
        city: scope === "national" ? null : (cities.length > 0 ? cities[0] : null),
        cities: scope === "national" ? null : (cities.length > 0 ? cities : null),
        checkFrequencyDays,
        isActive,
        brandAliases,
      } as any);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAlias = () => {
    const trimmed = newAlias.trim();
    if (trimmed && !brandAliases.includes(trimmed)) {
      setBrandAliases([...brandAliases, trimmed]);
      setNewAlias("");
      setHasChanges(true);
    }
  };

  const handleRemoveAlias = (alias: string) => {
    setBrandAliases(brandAliases.filter(a => a !== alias));
    setHasChanges(true);
  };

  const handleAddCity = () => {
    const trimmed = newCity.trim();
    if (trimmed && !cities.includes(trimmed)) {
      setCities([...cities, trimmed]);
      setNewCity("");
      setHasChanges(true);
    }
  };

  const handleRemoveCity = (cityToRemove: string) => {
    setCities(cities.filter(c => c !== cityToRemove));
    setHasChanges(true);
  };

  const openEditGroup = (group: MonitoringGroup) => {
    setEditGroupName(group.name);
    setEditGroupDescription(group.description || "");
    setEditGroupIsHighLevel(group.isHighLevelCategory);
    setEditGroupDialog({ open: true, group });
  };

  const handleSaveGroup = () => {
    if (editGroupDialog.group) {
      updateGroupMutation.mutate({
        id: editGroupDialog.group.id,
        name: editGroupName,
        description: editGroupDescription,
        isHighLevelCategory: editGroupIsHighLevel,
      });
    }
  };

  const openEditPrompt = (prompt: MonitoringPrompt, groupId: number) => {
    setEditPromptText(prompt.promptText);
    setEditPromptDialog({ open: true, prompt, groupId });
  };

  const handleSavePrompt = () => {
    if (editPromptDialog.prompt) {
      updatePromptMutation.mutate({
        id: editPromptDialog.prompt.id,
        promptText: editPromptText,
      });
    }
  };

  if (!clientId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-6">
          <p className="text-muted-foreground">Invalid client ID</p>
        </Card>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5599f9] animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <CardTitle className="text-xl mb-3">Access denied</CardTitle>
          <p className="text-muted-foreground mb-4">Only admins can edit monitoring settings.</p>
          <Button onClick={() => setLocation(`/monitor/dashboard/${clientId}`)} data-testid="button-back-dashboard">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  const client = data?.client;
  const groups = data?.groups || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={logoIcon} alt="Rossman Media" className="h-8 w-auto" />
              <div className="flex flex-col">
                <h1 className="text-lg font-bold tracking-tight">{client?.businessName || "Settings"}</h1>
                <p className="text-sm text-muted-foreground">Monitoring Settings</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/monitor/dashboard/${clientId}`)}
                className="flex items-center gap-2"
                data-testid="button-back-to-dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={handleSaveClientSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2"
                  data-testid="button-save-settings"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-primary" />
                Brand Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => { setBusinessName(e.target.value); setHasChanges(true); }}
                  placeholder="Your Business Name"
                  data-testid="input-business-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Website</Label>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <Input
                    id="domain"
                    value={domain}
                    onChange={(e) => { setDomain(e.target.value); setHasChanges(true); }}
                    placeholder="example.com"
                    data-testid="input-domain"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={industry}
                  onChange={(e) => { setIndustry(e.target.value); setHasChanges(true); }}
                  placeholder="e.g., Handyman Services"
                  data-testid="input-industry"
                />
              </div>

              <div className="space-y-2">
                <Label>Service Scope</Label>
                <Select value={scope} onValueChange={(v) => { setScope(v as "local" | "national"); setHasChanges(true); }}>
                  <SelectTrigger data-testid="select-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scope === "local" && (
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    Service Cities
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {cities.map((c, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="flex items-center gap-1 px-3 py-1"
                        data-testid={`badge-city-${index}`}
                      >
                        {c}
                        <button
                          onClick={() => handleRemoveCity(c)}
                          className="ml-1 hover:text-destructive"
                          data-testid={`button-remove-city-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                    {cities.length === 0 && (
                      <p className="text-sm text-muted-foreground italic" data-testid="text-no-cities">No cities added yet</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      placeholder="Add a city (e.g., Fort Worth, TX)"
                      onKeyDown={(e) => e.key === "Enter" && handleAddCity()}
                      data-testid="input-new-city"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleAddCity}
                      disabled={!newCity.trim()}
                      data-testid="button-add-city"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add all cities where this business provides services. Use the format "City, ST" (e.g., Dallas, TX).
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Check Frequency</Label>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <Select value={String(checkFrequencyDays)} onValueChange={(v) => { setCheckFrequencyDays(parseInt(v)); setHasChanges(true); }}>
                    <SelectTrigger data-testid="select-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Weekly (7 days)</SelectItem>
                      <SelectItem value="14">Bi-weekly (14 days)</SelectItem>
                      <SelectItem value="30">Monthly (30 days)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="monitoring-active" className="text-base">Automated Monitoring</Label>
                  <p className="text-sm text-muted-foreground">
                    {isActive 
                      ? "Visibility checks will run automatically on schedule." 
                      : "Automated checks are paused. Manual scans still work."}
                  </p>
                </div>
                <Switch
                  id="monitoring-active"
                  checked={isActive}
                  onCheckedChange={(checked) => { setIsActive(checked); setHasChanges(true); }}
                  data-testid="switch-monitoring-active"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="w-5 h-5 text-primary" />
                Brand Aliases
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Alternative names or variations of your brand that AI platforms might use when mentioning you.
              </p>

              <div className="flex flex-wrap gap-2">
                {brandAliases.map((alias, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="flex items-center gap-1 px-3 py-1"
                    data-testid={`badge-alias-${index}`}
                  >
                    {alias}
                    <button
                      onClick={() => handleRemoveAlias(alias)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-alias-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                {brandAliases.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No aliases added yet</p>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  placeholder="Add an alias (e.g., SmartFix)"
                  onKeyDown={(e) => e.key === "Enter" && handleAddAlias()}
                  data-testid="input-new-alias"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddAlias}
                  disabled={!newAlias.trim()}
                  data-testid="button-add-alias"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
                <strong>Tip:</strong> Add common variations like abbreviations (BBM), alternative spellings (SmartFix vs Smart Fix), 
                and full names (The Smart Fix Handyman Services).
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="w-5 h-5 text-primary" />
              Service Groups & Prompts
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setAddGroupDialog(true)}
              className="flex items-center gap-2"
              data-testid="button-add-group"
            >
              <Plus className="w-4 h-4" />
              Add Group
            </Button>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No service groups yet</p>
                <p className="text-sm">Add groups to organize your visibility prompts</p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {groups.map((group) => (
                  <AccordionItem
                    key={group.id}
                    value={String(group.id)}
                    className="border rounded-md px-4"
                    data-testid={`accordion-group-${group.id}`}
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="font-medium">{group.name}</span>
                        {group.isHighLevelCategory && (
                          <Badge variant="default" className="flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            Primary
                          </Badge>
                        )}
                        <Badge variant="outline" className="ml-auto mr-2">
                          {group.prompts.length} prompts
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-muted-foreground">{group.description || "No description"}</p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditGroup(group)}
                            data-testid={`button-edit-group-${group.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteGroupConfirm(group)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-group-${group.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.prompts.map((prompt) => (
                          <div
                            key={prompt.id}
                            className="flex items-start gap-3 p-3 bg-muted/50 rounded-md group"
                            data-testid={`prompt-item-${prompt.id}`}
                          >
                            <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <p className="text-sm flex-1">{prompt.promptText}</p>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditPrompt(prompt, group.id)}
                                data-testid={`button-edit-prompt-${prompt.id}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeletePromptConfirm(prompt)}
                                data-testid={`button-delete-prompt-${prompt.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {group.prompts.length === 0 && (
                          <p className="text-sm text-muted-foreground italic py-2">No prompts in this group</p>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 flex items-center gap-2"
                        onClick={() => setAddPromptDialog({ open: true, groupId: group.id })}
                        data-testid={`button-add-prompt-${group.id}`}
                      >
                        <Plus className="w-4 h-4" />
                        Add Prompt
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={addGroupDialog} onOpenChange={setAddGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service Group</DialogTitle>
            <DialogDescription>
              Create a new service group to organize your visibility prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-group-name">Group Name</Label>
              <Input
                id="new-group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Plumbing Services"
                data-testid="input-new-group-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-group-description">Description (optional)</Label>
              <Textarea
                id="new-group-description"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Brief description of this service category"
                data-testid="input-new-group-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="new-group-primary"
                checked={newGroupIsHighLevel}
                onChange={(e) => setNewGroupIsHighLevel(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="new-group-primary" className="text-sm font-normal">
                Mark as Primary Category (umbrella term)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate({
                name: newGroupName,
                description: newGroupDescription,
                isHighLevelCategory: newGroupIsHighLevel,
              })}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
              data-testid="button-confirm-add-group"
            >
              {createGroupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editGroupDialog.open} onOpenChange={(open) => setEditGroupDialog({ open, group: editGroupDialog.group })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Service Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">Group Name</Label>
              <Input
                id="edit-group-name"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                data-testid="input-edit-group-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-description">Description</Label>
              <Textarea
                id="edit-group-description"
                value={editGroupDescription}
                onChange={(e) => setEditGroupDescription(e.target.value)}
                data-testid="input-edit-group-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-group-primary"
                checked={editGroupIsHighLevel}
                onChange={(e) => setEditGroupIsHighLevel(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="edit-group-primary" className="text-sm font-normal">
                Mark as Primary Category (umbrella term)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroupDialog({ open: false, group: null })}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveGroup}
              disabled={!editGroupName.trim() || updateGroupMutation.isPending}
              data-testid="button-confirm-edit-group"
            >
              {updateGroupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGroupConfirm} onOpenChange={(open) => !open && setDeleteGroupConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteGroupConfirm?.name}" and all its prompts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteGroupConfirm && deleteGroupMutation.mutate(deleteGroupConfirm.id)}
              data-testid="button-confirm-delete-group"
            >
              {deleteGroupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addPromptDialog.open} onOpenChange={(open) => setAddPromptDialog({ open, groupId: addPromptDialog.groupId })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Prompt</DialogTitle>
            <DialogDescription>
              Create a new visibility prompt for this service group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-prompt-text">Prompt Text</Label>
              <Textarea
                id="new-prompt-text"
                value={newPromptText}
                onChange={(e) => setNewPromptText(e.target.value)}
                placeholder="e.g., Who are the best plumbers in Fort Worth?"
                rows={3}
                data-testid="input-new-prompt-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPromptDialog({ open: false, groupId: null })}>
              Cancel
            </Button>
            <Button
              onClick={() => addPromptDialog.groupId && createPromptMutation.mutate({
                groupId: addPromptDialog.groupId,
                promptText: newPromptText,
              })}
              disabled={!newPromptText.trim() || createPromptMutation.isPending}
              data-testid="button-confirm-add-prompt"
            >
              {createPromptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Prompt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editPromptDialog.open} onOpenChange={(open) => setEditPromptDialog({ open, prompt: editPromptDialog.prompt, groupId: editPromptDialog.groupId })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-prompt-text">Prompt Text</Label>
              <Textarea
                id="edit-prompt-text"
                value={editPromptText}
                onChange={(e) => setEditPromptText(e.target.value)}
                rows={3}
                data-testid="input-edit-prompt-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPromptDialog({ open: false, prompt: null, groupId: null })}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePrompt}
              disabled={!editPromptText.trim() || updatePromptMutation.isPending}
              data-testid="button-confirm-edit-prompt"
            >
              {updatePromptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePromptConfirm} onOpenChange={(open) => !open && setDeletePromptConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this prompt. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePromptConfirm && deletePromptMutation.mutate(deletePromptConfirm.id)}
              data-testid="button-confirm-delete-prompt"
            >
              {deletePromptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
