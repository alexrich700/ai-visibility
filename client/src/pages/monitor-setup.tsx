import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, Globe, MapPin, Briefcase, Clock, ArrowRight, ArrowLeft,
  Plus, Trash2, Edit2, Check, X, Loader2, Sparkles, FileText, Zap
} from "lucide-react";
import logoIcon from "@assets/images_1765741951084.png";

interface GroupItem {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isEditing: boolean;
  isHighLevelCategory?: boolean; // True for the umbrella category (e.g., "Plumber", "HVAC Contractor")
}

interface PromptItem {
  id: string;
  groupId: string;
  text: string;
  isEditing: boolean;
}

type Step = "business" | "groups" | "prompts" | "scanning";

export default function MonitorSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<Step>("business");
  
  // Business info state
  const [businessName, setBusinessName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [scope, setScope] = useState<"local" | "national">("local");
  const [city, setCity] = useState("");
  const [checkFrequencyDays, setCheckFrequencyDays] = useState(14);
  
  // Groups state
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  
  // Prompts state
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [activeGroupTab, setActiveGroupTab] = useState<string>("");
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  
  // Scanning state
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [createdClientId, setCreatedClientId] = useState<number | null>(null);

  // Generate groups mutation
  const generateGroupsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/monitoring/generate-groups", { businessName, industry, scope, city });
      return await response.json() as { groups: { name: string; description: string; isHighLevelCategory?: boolean }[] };
    },
    onSuccess: (data) => {
      const newGroups = data.groups.map((g, i) => ({
        id: `temp-${i}`,
        name: g.name,
        description: g.description,
        isActive: true,
        isEditing: false,
        isHighLevelCategory: g.isHighLevelCategory || false,
      }));
      setGroups(newGroups);
      if (newGroups.length > 0) {
        setActiveGroupTab(newGroups[0].id);
      }
      setIsLoadingGroups(false);
    },
    onError: (error) => {
      toast({
        title: "Error generating groups",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setIsLoadingGroups(false);
    },
  });

  // Generate prompts mutation
  const generatePromptsMutation = useMutation({
    mutationFn: async () => {
      const activeGroups = groups.filter(g => g.isActive);
      const response = await apiRequest("POST", "/api/monitoring/generate-prompts", { 
        businessName, 
        domain,
        industry, 
        scope, 
        city,
        groups: activeGroups.map(g => ({ name: g.name, description: g.description }))
      });
      return await response.json() as { prompts: { groupName: string; prompts: string[] }[] };
    },
    onSuccess: (data) => {
      const activeGroups = groups.filter(g => g.isActive);
      const allPrompts: PromptItem[] = [];
      
      data.prompts.forEach((groupData) => {
        const group = activeGroups.find(g => g.name === groupData.groupName);
        if (group) {
          groupData.prompts.forEach((promptText, i) => {
            allPrompts.push({
              id: `prompt-${group.id}-${i}`,
              groupId: group.id,
              text: promptText,
              isEditing: false,
            });
          });
        }
      });
      
      setPrompts(allPrompts);
      if (activeGroups.length > 0) {
        setActiveGroupTab(activeGroups[0].id);
      }
      setIsLoadingPrompts(false);
    },
    onError: (error) => {
      toast({
        title: "Error generating prompts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setIsLoadingPrompts(false);
    },
  });

  // Create client and run initial scan
  const runScanMutation = useMutation({
    mutationFn: async () => {
      const activeGroups = groups.filter(g => g.isActive);
      const response = await apiRequest("POST", "/api/monitoring/create-and-scan", {
        client: {
          businessName,
          domain,
          industry,
          scope,
          city: scope === "local" ? city : undefined,
          checkFrequencyDays,
        },
        groups: activeGroups.map(g => ({
          name: g.name,
          description: g.description,
        })),
        prompts: prompts.filter(p => activeGroups.some(g => g.id === p.groupId)).map(p => ({
          groupName: activeGroups.find(g => g.id === p.groupId)?.name,
          text: p.text,
        })),
      });
      return await response.json() as { clientId: number; sessionId: number };
    },
    onSuccess: (data) => {
      setCreatedClientId(data.clientId);
      setScanProgress(100);
      setScanStatus("Complete!");
      setTimeout(() => {
        setLocation(`/monitor/dashboard/${data.clientId}`);
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Error running scan",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setScanProgress(0);
      setScanStatus("Failed");
    },
  });

  const handleNextStep = () => {
    if (currentStep === "business") {
      if (!businessName || !domain || !industry) {
        toast({
          title: "Missing required fields",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }
      if (scope === "local" && !city) {
        toast({
          title: "City required",
          description: "Please enter a city for local scope",
          variant: "destructive",
        });
        return;
      }
      setCurrentStep("groups");
      setIsLoadingGroups(true);
      generateGroupsMutation.mutate();
    } else if (currentStep === "groups") {
      const activeGroups = groups.filter(g => g.isActive);
      if (activeGroups.length === 0) {
        toast({
          title: "No groups selected",
          description: "Please select at least one group",
          variant: "destructive",
        });
        return;
      }
      setCurrentStep("prompts");
      setIsLoadingPrompts(true);
      generatePromptsMutation.mutate();
    } else if (currentStep === "prompts") {
      setCurrentStep("scanning");
      setScanProgress(10);
      setScanStatus("Creating client profile...");
      runScanMutation.mutate();
    }
  };

  const handlePrevStep = () => {
    if (currentStep === "groups") setCurrentStep("business");
    else if (currentStep === "prompts") setCurrentStep("groups");
    else if (currentStep === "scanning") setCurrentStep("prompts");
  };

  // Group management functions
  const toggleGroupActive = (id: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, isActive: !g.isActive } : g));
  };

  const startEditingGroup = (id: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, isEditing: true } : g));
  };

  const saveGroupEdit = (id: string, newName: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name: newName, isEditing: false } : g));
  };

  const cancelGroupEdit = (id: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, isEditing: false } : g));
  };

  const deleteGroup = (id: string) => {
    setGroups(groups.filter(g => g.id !== id));
    setPrompts(prompts.filter(p => p.groupId !== id));
  };

  const addNewGroup = () => {
    if (!newGroupName.trim()) return;
    const newId = `temp-${Date.now()}`;
    setGroups([...groups, {
      id: newId,
      name: newGroupName,
      description: "",
      isActive: true,
      isEditing: false,
    }]);
    setNewGroupName("");
  };

  // Prompt management functions
  const startEditingPrompt = (id: string) => {
    setPrompts(prompts.map(p => p.id === id ? { ...p, isEditing: true } : p));
  };

  const savePromptEdit = (id: string, newText: string) => {
    setPrompts(prompts.map(p => p.id === id ? { ...p, text: newText, isEditing: false } : p));
  };

  const cancelPromptEdit = (id: string) => {
    setPrompts(prompts.map(p => p.id === id ? { ...p, isEditing: false } : p));
  };

  const deletePrompt = (id: string) => {
    setPrompts(prompts.filter(p => p.id !== id));
  };

  const addNewPrompt = () => {
    if (!newPromptText.trim() || !activeGroupTab) return;
    setPrompts([...prompts, {
      id: `prompt-${Date.now()}`,
      groupId: activeGroupTab,
      text: newPromptText,
      isEditing: false,
    }]);
    setNewPromptText("");
  };

  const activeGroups = groups.filter(g => g.isActive);
  const currentGroupPrompts = prompts.filter(p => p.groupId === activeGroupTab);

  return (
    <div className="min-h-screen bg-gray-50 selection:bg-[#5599f9] selection:text-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2" data-testid="link-home">
            <img src={logoIcon} alt="Rossman Media" className="w-8 h-8 rounded" />
            <span className="text-xl font-bold tracking-tight">
              <span className="text-gray-900">ROSSMAN</span>
              <span className="font-light text-gray-500">MEDIA</span>
            </span>
          </button>
          <Badge variant="outline" className="text-xs uppercase font-bold tracking-wider">
            AI Visibility Monitor
          </Badge>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {[
              { key: "business", label: "Business Info", icon: Building2 },
              { key: "groups", label: "Service Groups", icon: Briefcase },
              { key: "prompts", label: "Review Prompts", icon: FileText },
              { key: "scanning", label: "Run Scan", icon: Zap },
            ].map((step, index, arr) => (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentStep === step.key 
                    ? "bg-[#5599f9] text-white" 
                    : arr.findIndex(s => s.key === currentStep) > index
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                }`}>
                  <step.icon className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
                </div>
                {index < arr.length - 1 && (
                  <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                    arr.findIndex(s => s.key === currentStep) > index
                      ? "bg-green-300"
                      : "bg-gray-200"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Step 1: Business Info */}
        {currentStep === "business" && (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Building2 className="w-6 h-6 text-[#5599f9]" />
                Business Information
              </CardTitle>
              <p className="text-gray-500">Tell us about your business so we can monitor its AI visibility</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                    Business Name *
                  </Label>
                  <div className="relative group">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#5599f9] transition-colors" />
                    <Input
                      id="businessName"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Acme HVAC Services"
                      className="pl-12 bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                      data-testid="input-business-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                    Website Domain *
                  </Label>
                  <div className="relative group">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#5599f9] transition-colors" />
                    <Input
                      id="domain"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="acmehvac.com"
                      className="pl-12 bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                      data-testid="input-domain"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                  Industry / Business Type *
                </Label>
                <div className="relative group">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#5599f9] transition-colors" />
                  <Input
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="HVAC, Plumbing, Electrical, etc."
                    className="pl-12 bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                    data-testid="input-industry"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold tracking-wider text-gray-500">Service Area *</Label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setScope("local")}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                      scope === "local"
                        ? "border-[#5599f9] bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid="button-scope-local"
                  >
                    <MapPin className={`w-6 h-6 mx-auto mb-2 ${scope === "local" ? "text-[#5599f9]" : "text-gray-400"}`} />
                    <div className="font-bold">Local</div>
                    <div className="text-sm text-gray-500">Specific city or region</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("national")}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                      scope === "national"
                        ? "border-[#5599f9] bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid="button-scope-national"
                  >
                    <Globe className={`w-6 h-6 mx-auto mb-2 ${scope === "national" ? "text-[#5599f9]" : "text-gray-400"}`} />
                    <div className="font-bold">National</div>
                    <div className="text-sm text-gray-500">Serve entire country</div>
                  </button>
                </div>
              </div>

              {scope === "local" && (
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                    City / Region *
                  </Label>
                  <div className="relative group">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#5599f9] transition-colors" />
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="San Francisco, CA"
                      className="pl-12 bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
                      data-testid="input-city"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold tracking-wider text-gray-500">
                  Check Frequency
                </Label>
                <div className="flex items-center gap-4">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <select
                    value={checkFrequencyDays}
                    onChange={(e) => setCheckFrequencyDays(Number(e.target.value))}
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5599f9] focus:ring-[#5599f9] focus:outline-none"
                    data-testid="select-frequency"
                  >
                    <option value={7}>Every 7 days</option>
                    <option value={14}>Every 14 days (recommended)</option>
                    <option value={30}>Every 30 days</option>
                    <option value={60}>Every 60 days</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Groups */}
        {currentStep === "groups" && (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Sparkles className="w-6 h-6 text-[#ffb41c]" />
                Service Groups
              </CardTitle>
              <p className="text-gray-500">
                We've suggested service groups based on your industry. Toggle, edit, or add groups to track.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingGroups ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-[#5599f9] animate-spin mb-4" />
                  <p className="text-gray-500">Generating service groups with AI...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        group.isActive
                          ? "border-[#5599f9] bg-blue-50"
                          : "border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <button
                        onClick={() => toggleGroupActive(group.id)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          group.isActive
                            ? "bg-[#5599f9] border-[#5599f9] text-white"
                            : "border-gray-300 bg-white"
                        }`}
                        data-testid={`toggle-group-${group.id}`}
                      >
                        {group.isActive && <Check className="w-4 h-4" />}
                      </button>
                      
                      <div className="flex-1">
                        {group.isEditing ? (
                          <Input
                            autoFocus
                            defaultValue={group.name}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveGroupEdit(group.id, (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") cancelGroupEdit(group.id);
                            }}
                            onBlur={(e) => saveGroupEdit(group.id, e.target.value)}
                            className="bg-white"
                            data-testid={`input-edit-group-${group.id}`}
                          />
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900">{group.name}</span>
                              {group.isHighLevelCategory && (
                                <Badge variant="secondary" className="text-xs bg-[#ffb41c]/20 text-[#b07800] border-[#ffb41c]/30">
                                  Primary Category
                                </Badge>
                              )}
                            </div>
                            {group.description && (
                              <div className="text-sm text-gray-500">{group.description}</div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!group.isEditing && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEditingGroup(group.id)}
                            data-testid={`button-edit-group-${group.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteGroup(group.id)}
                          className="text-red-500 hover:text-red-700"
                          data-testid={`button-delete-group-${group.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add new group */}
                  <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-300">
                    <Plus className="w-6 h-6 text-gray-400" />
                    <Input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Add a new service group..."
                      className="flex-1 bg-transparent border-0 focus:ring-0"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addNewGroup();
                      }}
                      data-testid="input-new-group"
                    />
                    <Button onClick={addNewGroup} size="sm" disabled={!newGroupName.trim()} data-testid="button-add-group">
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Prompts */}
        {currentStep === "prompts" && (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <FileText className="w-6 h-6 text-[#5599f9]" />
                Review Prompts
              </CardTitle>
              <p className="text-gray-500">
                We've generated 20 prompts per group. Review, edit, or add prompts to track.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingPrompts ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-[#5599f9] animate-spin mb-4" />
                  <p className="text-gray-500">Generating prompts with AI...</p>
                </div>
              ) : (
                <Tabs value={activeGroupTab} onValueChange={setActiveGroupTab}>
                  <TabsList className="mb-4 flex-wrap h-auto gap-2">
                    {activeGroups.map((group) => (
                      <TabsTrigger key={group.id} value={group.id} className="flex items-center gap-2">
                        {group.name}
                        <Badge variant="secondary" className="ml-1">
                          {prompts.filter(p => p.groupId === group.id).length}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {activeGroups.map((group) => (
                    <TabsContent key={group.id} value={group.id} className="space-y-3">
                      {prompts.filter(p => p.groupId === group.id).map((prompt, index) => (
                        <div
                          key={prompt.id}
                          className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-white"
                        >
                          <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">
                            {index + 1}
                          </span>
                          
                          <div className="flex-1">
                            {prompt.isEditing ? (
                              <textarea
                                autoFocus
                                defaultValue={prompt.text}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:border-[#5599f9] focus:ring-[#5599f9] focus:outline-none"
                                rows={3}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") cancelPromptEdit(prompt.id);
                                }}
                                onBlur={(e) => savePromptEdit(prompt.id, e.target.value)}
                                data-testid={`textarea-edit-prompt-${prompt.id}`}
                              />
                            ) : (
                              <p className="text-gray-900">{prompt.text}</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {!prompt.isEditing && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => startEditingPrompt(prompt.id)}
                                data-testid={`button-edit-prompt-${prompt.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deletePrompt(prompt.id)}
                              className="text-red-500 hover:text-red-700"
                              data-testid={`button-delete-prompt-${prompt.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Add new prompt */}
                      <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-dashed border-gray-300">
                        <Plus className="w-8 h-8 text-gray-400 flex-shrink-0" />
                        <textarea
                          value={newPromptText}
                          onChange={(e) => setNewPromptText(e.target.value)}
                          placeholder="Add a new prompt..."
                          className="flex-1 p-2 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none"
                          rows={2}
                          data-testid="textarea-new-prompt"
                        />
                        <Button 
                          onClick={addNewPrompt} 
                          size="sm" 
                          disabled={!newPromptText.trim()}
                          data-testid="button-add-prompt"
                        >
                          Add
                        </Button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Scanning */}
        {currentStep === "scanning" && (
          <Card className="shadow-2xl shadow-blue-900/5">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
                <Zap className="w-6 h-6 text-[#ffb41c]" />
                Running Initial Scan
              </CardTitle>
              <p className="text-gray-500">
                Checking your visibility across AI platforms...
              </p>
            </CardHeader>
            <CardContent className="py-12">
              <div className="max-w-md mx-auto space-y-6">
                <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#5599f9] to-[#ffb41c] transition-all duration-500"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-[#5599f9]">{scanProgress}%</div>
                  <div className="text-gray-500 mt-2">{scanStatus}</div>
                </div>
                {runScanMutation.isPending && (
                  <div className="flex justify-center">
                    <Loader2 className="w-8 h-8 text-[#5599f9] animate-spin" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        {currentStep !== "scanning" && (
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="outline"
              onClick={handlePrevStep}
              disabled={currentStep === "business"}
              className="flex items-center gap-2"
              data-testid="button-prev-step"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleNextStep}
              disabled={
                (currentStep === "groups" && isLoadingGroups) ||
                (currentStep === "prompts" && isLoadingPrompts)
              }
              className="flex items-center gap-2 bg-[#5599f9] hover:bg-[#4488e8] text-white"
              data-testid="button-next-step"
            >
              {currentStep === "prompts" ? "Start Monitoring" : "Next"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
