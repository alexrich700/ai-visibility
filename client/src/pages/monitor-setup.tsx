import { useState, useRef, useEffect } from "react";
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
import logoIcon from "@assets/Motivent_Logo_-_Primary_1774297429560.png";

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
  const [industry, setIndustry] = useState(""); // Legacy single industry (for display)
  const [primaryCategories, setPrimaryCategories] = useState<string[]>([]); // Multiple service categories
  const [newCategoryInput, setNewCategoryInput] = useState(""); // Input for adding categories
  const [scope, setScope] = useState<"local" | "national">("local");
  const [city, setCity] = useState(""); // Legacy single city (for backward compat)
  const [cities, setCities] = useState<string[]>([]); // Multiple cities for multi-location
  const [newCityInput, setNewCityInput] = useState(""); // Input for adding cities
  const [checkFrequencyDays, setCheckFrequencyDays] = useState(14);
  
  // Helper functions for multi-select tag inputs
  const addCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (trimmed && !primaryCategories.includes(trimmed)) {
      setPrimaryCategories([...primaryCategories, trimmed]);
      // Also set industry for legacy compatibility
      if (primaryCategories.length === 0) {
        setIndustry(trimmed);
      } else {
        setIndustry(primaryCategories[0]);
      }
    }
    setNewCategoryInput("");
  };
  
  const removeCategory = (category: string) => {
    const updated = primaryCategories.filter(c => c !== category);
    setPrimaryCategories(updated);
    setIndustry(updated[0] || "");
  };
  
  const addCity = () => {
    const trimmed = newCityInput.trim();
    if (trimmed && !cities.includes(trimmed)) {
      setCities([...cities, trimmed]);
      // Set first city as legacy city
      if (cities.length === 0) {
        setCity(trimmed);
      }
    }
    setNewCityInput("");
  };
  
  const removeCity = (cityToRemove: string) => {
    const updated = cities.filter(c => c !== cityToRemove);
    setCities(updated);
    setCity(updated[0] || "");
  };
  
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
  const [scanSubStatus, setScanSubStatus] = useState("");
  const [currentGroupName, setCurrentGroupName] = useState("");
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [totalPrompts, setTotalPrompts] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<number | null>(null);
  
  // Multi-city scan tracking
  const [currentScanCityIndex, setCurrentScanCityIndex] = useState(0);
  const [totalScanCities, setTotalScanCities] = useState(0);
  const [currentScanCity, setCurrentScanCity] = useState<string | null>(null);
  
  // EventSource ref for cleanup on unmount
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Session tracking for auto-reconnect on disconnect
  const activeSessionIdRef = useRef<number | null>(null);
  const activeClientIdRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const isReconnectingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true); // Cancellation flag to prevent actions after unmount
  
  // Cleanup EventSource on unmount or navigation
  useEffect(() => {
    isMountedRef.current = true; // Mark as mounted
    return () => {
      isMountedRef.current = false; // Mark as unmounted to cancel pending reconnects
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Clear any pending reconnect timers
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Reset reconnect state
      activeSessionIdRef.current = null;
      activeClientIdRef.current = null;
      reconnectAttemptsRef.current = 0;
      isReconnectingRef.current = false;
    };
  }, []);
  
  // Auto-reconnect function using resume endpoint
  const attemptReconnect = async () => {
    const sessionId = activeSessionIdRef.current;
    
    if (!sessionId || isReconnectingRef.current) {
      console.log("[Reconnect] No session ID or already reconnecting, skipping");
      return false;
    }
    
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`[Reconnect] Max attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
      return false;
    }
    
    isReconnectingRef.current = true;
    reconnectAttemptsRef.current++;
    
    console.log(`[Reconnect] Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} for session ${sessionId}`);
    setScanStatus("Reconnecting...");
    setScanSubStatus(`Attempt ${reconnectAttemptsRef.current} of ${MAX_RECONNECT_ATTEMPTS}`);
    
    // Wait a bit before reconnecting (1-3 seconds with some randomness)
    const delay = 1000 + Math.random() * 2000;
    await new Promise<void>(resolve => {
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        resolve();
      }, delay);
    });
    
    // Check if component was unmounted during delay
    if (!isMountedRef.current) {
      console.log("[Reconnect] Component unmounted during delay, cancelling reconnect");
      isReconnectingRef.current = false;
      return false;
    }
    
    try {
      // Close existing EventSource if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Connect to resume endpoint
      const eventSource = new EventSource(`/api/monitoring/resume-stream/${sessionId}`);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Successful message means reconnection worked
          if (reconnectAttemptsRef.current > 0) {
            console.log("[Reconnect] Successfully reconnected!");
            reconnectAttemptsRef.current = 0;
            toast({
              title: "Reconnected",
              description: "Scan resumed successfully",
            });
          }
          isReconnectingRef.current = false;
          
          handleStreamEvent(data);
          
          // Close EventSource when scan is complete or errored
          if (data.type === "complete" || data.type === "error") {
            eventSource.close();
            eventSourceRef.current = null;
            activeSessionIdRef.current = null;
          }
        } catch (e) {
          console.error("Failed to parse SSE event:", e);
        }
      };
      
      eventSource.onerror = async () => {
        console.error("[Reconnect] EventSource error during reconnection");
        eventSource.close();
        eventSourceRef.current = null;
        isReconnectingRef.current = false;
        
        // Check if component was unmounted
        if (!isMountedRef.current) {
          console.log("[Reconnect] Component unmounted, cancelling retry");
          return;
        }
        
        // Try again if we have attempts left
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          await attemptReconnect();
        } else {
          // All reconnection attempts failed
          toast({
            title: "Connection lost",
            description: "Unable to reconnect after multiple attempts. Your progress has been saved - you can resume from the dashboard.",
            variant: "destructive",
          });
          setScanStatus("Disconnected");
          setScanSubStatus("Progress saved. Resume from dashboard.");
          setIsScanning(false);
        }
      };
      
      return true;
    } catch (error) {
      console.error("[Reconnect] Error during reconnection:", error);
      isReconnectingRef.current = false;
      return false;
    }
  };

  // Generate groups mutation
  const generateGroupsMutation = useMutation({
    mutationFn: async () => {
      // Use primaryCategories if available, otherwise fall back to industry
      const categoriesToUse = primaryCategories.length > 0 ? primaryCategories : (industry ? [industry] : []);
      const response = await apiRequest("POST", "/api/monitoring/generate-groups", {
        businessName,
        domain,
        industry: categoriesToUse[0] || industry, // Legacy support
        primaryCategories: categoriesToUse.length > 1 ? categoriesToUse : undefined,
        scope,
        city: cities.length > 0 ? cities[0] : city // Use first city for group generation
      });
      return await response.json() as { 
        groups: { name: string; description: string; isHighLevelCategory?: boolean }[];
        isMultiCategory?: boolean;
        highLevelCategories?: { name: string; description: string }[];
      };
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
      
      // Generate prompts for all groups in a single request
      // High-level category groups get fewer prompts (5 vs 20) - handled by backend
      const response = await apiRequest("POST", "/api/monitoring/generate-prompts", { 
        businessName, 
        domain,
        industry, 
        scope, 
        city,
        groups: activeGroups.map(g => ({ 
          name: g.name, 
          description: g.description,
          isHighLevelCategory: g.isHighLevelCategory || false
        }))
      });
      const data = await response.json() as { prompts: { groupName: string; prompts: string[] }[] };
      
      return { prompts: data.prompts, activeGroups };
    },
    onSuccess: (data) => {
      const allPrompts: PromptItem[] = [];
      
      data.prompts.forEach((groupData) => {
        const group = data.activeGroups.find(g => g.name === groupData.groupName);
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
      if (data.activeGroups.length > 0) {
        setActiveGroupTab(data.activeGroups[0].id);
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

  // Run a single city scan as a background job and poll status.
  // This keeps scans browser-independent (safe across refresh/tab close).
  const runSingleCityScan = async (targetCity: string | undefined, cityIndex: number, totalCities: number): Promise<{ clientId: number; overallScore: number }> => {
    const activeGroups = groups.filter(g => g.isActive);
    const adminToken = sessionStorage.getItem("adminToken");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    }

    setCurrentScanCity(targetCity || null);
    setCurrentScanCityIndex(cityIndex);
    setTotalScanCities(totalCities);

    const configResponse = await fetch("/api/monitoring/client-config", {
      method: "POST",
      headers,
      body: JSON.stringify({
        client: {
          businessName,
          domain,
          industry: primaryCategories.length > 0 ? primaryCategories[0] : industry,
          scope,
          city: targetCity,
          cities: scope === "local" && cities.length > 0 ? cities : undefined,
          primaryCategories: primaryCategories.length > 0 ? primaryCategories : undefined,
          checkFrequencyDays,
        },
        groups: activeGroups.map(g => ({
          name: g.name,
          description: g.description,
          isHighLevelCategory: g.isHighLevelCategory || false,
        })),
        prompts: prompts
          .filter(p => activeGroups.some(g => g.id === p.groupId))
          .map(p => ({
            groupName: activeGroups.find(g => g.id === p.groupId)?.name,
            text: p.text,
          })),
      }),
    });

    if (!configResponse.ok) {
      throw new Error("Failed to save client configuration");
    }

    const { clientId } = await configResponse.json();
    setCreatedClientId(clientId);

    const queueResponse = await fetch(`/api/monitoring/scan-job/${clientId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ targetCity }),
    });

    const queueData = await queueResponse.json().catch(() => ({}));
    if (!queueResponse.ok) {
      throw new Error(queueData.error || "Failed to queue scan job");
    }

    const { jobId } = queueData;

    // Poll for scan completion, respecting unmount and tab visibility
    while (isMountedRef.current) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 2000);
        // If the component unmounts while waiting, clean up the timer
        if (!isMountedRef.current) { clearTimeout(timer); resolve(); }
      });
      if (!isMountedRef.current) break;

      // Skip polling if tab is hidden — will catch up when visible
      if (document.hidden) continue;

      const statusResponse = await fetch(`/api/monitoring/scan-job/${jobId}`, { headers });
      if (!statusResponse.ok) {
        throw new Error("Lost connection to scan status endpoint");
      }

      const job = await statusResponse.json();
      if (!isMountedRef.current) break;

      const cityProgress = job.progress || 0;
      const overallProgress = Math.round(((cityIndex - 1) / totalCities) * 100 + (cityProgress / totalCities));
      setScanProgress(overallProgress);
      setScanStatus(job.progressMessage || "Scan in progress...");
      setScanSubStatus(targetCity ? `City: ${targetCity}` : "National scan");
      setCurrentPromptIndex(job.completedPrompts || 0);
      setTotalPrompts(job.totalPrompts || 0);

      if (job.status === "complete") {
        return {
          clientId,
          overallScore: job.resultScore || 0,
        };
      }

      if (job.status === "failed") {
        throw new Error(job.errorMessage || "Scan job failed");
      }
    }

    // Component unmounted during polling — return gracefully
    return { clientId, overallScore: 0 };
  };

  // Run scan for all cities with streaming progress updates
  const runScanWithStreaming = async () => {
    setIsScanning(true);
    setScanProgress(0);
    
    try {
      // Determine which cities to scan
      const citiesToScan = scope === "local" && cities.length > 0 
        ? cities 
        : [city || undefined]; // Single city or no city for national scope
      
      const totalCities = citiesToScan.length;
      let lastClientId: number | null = null;
      let totalScore = 0;
      
      // Scan each city sequentially with individual error handling
      const cityResults: { city: string | undefined; success: boolean; clientId: number | null; score: number }[] = [];
      
      for (let i = 0; i < citiesToScan.length; i++) {
        const targetCity = citiesToScan[i];
        const cityIndex = i + 1;
        
        // Update status to show which city we're scanning
        if (totalCities > 1) {
          setScanStatus(`Scanning ${targetCity} (${cityIndex}/${totalCities})`);
        }
        
        try {
          const result = await runSingleCityScan(targetCity, cityIndex, totalCities);
          lastClientId = result.clientId;
          totalScore += result.overallScore;
          cityResults.push({ city: targetCity, success: true, clientId: result.clientId, score: result.overallScore });
        } catch (cityError) {
          // Log error but continue to next city
          console.error(`Scan failed for city ${targetCity}:`, cityError);
          cityResults.push({ city: targetCity, success: false, clientId: null, score: 0 });
          // Brief pause before next city to avoid rapid reconnection
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Check if any cities failed
      const failedCities = cityResults.filter(r => !r.success);
      const successCities = cityResults.filter(r => r.success);
      
      if (failedCities.length === totalCities) {
        // All cities failed - throw error to trigger the catch block
        throw new Error("All city scans failed. Please check your connection and try again.");
      }
      
      // Get a valid clientId from successful scans
      if (successCities.length > 0 && !lastClientId) {
        lastClientId = successCities[0].clientId;
      }
      
      // Show partial success message if some cities failed
      if (failedCities.length > 0 && failedCities.length < totalCities) {
        toast({
          title: "Partial Scan Complete",
          description: `${successCities.length}/${totalCities} cities scanned. Failed: ${failedCities.map(c => c.city || 'National').join(', ')}. You can rescan failed cities from the dashboard.`,
          variant: "default",
        });
      }
      
      // All cities scanned (or at least some succeeded)
      setScanProgress(100);
      setScanStatus(failedCities.length > 0 ? "Scan Partially Complete" : "All Scans Complete!");
      // Calculate average score only from successful cities
      const avgScore = successCities.length > 0 ? Math.round(totalScore / successCities.length) : 0;
      setScanSubStatus(successCities.length > 1 
        ? `Scanned ${successCities.length} cities. Average Score: ${avgScore}%`
        : `Overall Score: ${avgScore}%`
      );
      setIsScanning(false);
      setCurrentScanCity(null);
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        if (lastClientId) {
          setLocation(`/monitor/dashboard/${lastClientId}`);
        }
      }, 2000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("Connection lost") || errorMessage.includes("reconnect");
      
      toast({
        title: isConnectionError ? "Scan Interrupted" : "Error running scan",
        description: errorMessage,
        variant: "destructive",
      });
      
      // For connection errors, don't reset progress - the scan may still be running on the server
      if (isConnectionError) {
        setScanStatus("Disconnected");
        setScanSubStatus("Your scan may still be running. Check dashboard for results.");
      } else {
        setScanProgress(0);
        setScanStatus("Failed");
      }
      setIsScanning(false);
      setCurrentScanCity(null);
    }
  };

  // Handle individual stream events
  const handleStreamEvent = (event: {
    type: string;
    message?: string;
    progress?: number;
    groupName?: string;
    promptIndex?: number;
    totalPrompts?: number;
    promptText?: string;
    chatgptFound?: boolean;
    googleAIFound?: boolean;
    clientId?: number;
    sessionId?: number;
    overallScore?: number;
  }) => {
    switch (event.type) {
      case "heartbeat":
        // Stream confirmed active
        console.log("SSE heartbeat received");
        break;
      case "session_created":
        // Store session ID for potential reconnection
        if (event.sessionId) {
          activeSessionIdRef.current = event.sessionId;
          console.log(`[Session] Tracking session ${event.sessionId} for reconnection`);
        }
        if (event.clientId) {
          activeClientIdRef.current = event.clientId;
        }
        // Reset reconnect counter on new session
        reconnectAttemptsRef.current = 0;
        break;
      case "status":
        setScanStatus(event.message || "");
        setScanSubStatus("");
        if (event.progress !== undefined) setScanProgress(event.progress);
        break;
      case "testing":
        setCurrentGroupName(event.groupName || "");
        setCurrentPromptIndex(event.promptIndex || 0);
        setTotalPrompts(event.totalPrompts || 0);
        setScanStatus(`Testing ${event.groupName}`);
        setScanSubStatus(event.promptText || "");
        if (event.progress !== undefined) setScanProgress(event.progress);
        break;
      case "prompt_complete":
        // Could show checkmark indicators here
        if (event.progress !== undefined) setScanProgress(event.progress);
        break;
      case "group_complete":
        // Could show group completion animation
        break;
      case "complete":
        setCreatedClientId(event.clientId || null);
        setScanProgress(100);
        setScanStatus("Scan Complete!");
        setScanSubStatus(`Overall Score: ${event.overallScore}%`);
        setIsScanning(false);
        // Clear session tracking on successful completion
        activeSessionIdRef.current = null;
        activeClientIdRef.current = null;
        reconnectAttemptsRef.current = 0;
        setTimeout(() => {
          if (event.clientId) {
            setLocation(`/monitor/dashboard/${event.clientId}`);
          }
        }, 2000);
        break;
      case "error":
        toast({
          title: "Scan Error",
          description: event.message || "Unknown error occurred",
          variant: "destructive",
        });
        setIsScanning(false);
        // Clear session tracking on error
        activeSessionIdRef.current = null;
        activeClientIdRef.current = null;
        reconnectAttemptsRef.current = 0;
        break;
    }
  };

  const handleNextStep = () => {
    if (currentStep === "business") {
      if (!businessName || !domain) {
        toast({
          title: "Missing required fields",
          description: "Please fill in business name and domain",
          variant: "destructive",
        });
        return;
      }
      // Check for categories (either primaryCategories or legacy industry)
      if (primaryCategories.length === 0 && !industry) {
        toast({
          title: "Service categories required",
          description: "Please add at least one service category",
          variant: "destructive",
        });
        return;
      }
      // Check for cities in local scope
      if (scope === "local" && cities.length === 0 && !city) {
        toast({
          title: "City required",
          description: "Please enter at least one city for local scope",
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
      setScanProgress(5);
      setScanStatus("Initializing scan...");
      runScanWithStreaming();
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
    <div className="bg-gray-50 selection:bg-[#ff5800] selection:text-white h-full">
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
                    ? "bg-[#ff5800] text-white" 
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
          <Card className="shadow-2xl shadow-orange-900/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Building2 className="w-6 h-6 text-[#ff5800]" />
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
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#ff5800] transition-colors" />
                    <Input
                      id="businessName"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Acme HVAC Services"
                      className="pl-12 bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                      data-testid="input-business-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                    Website Domain *
                  </Label>
                  <div className="relative group">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#ff5800] transition-colors" />
                    <Input
                      id="domain"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="acmehvac.com"
                      className="pl-12 bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                      data-testid="input-domain"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryCategories" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                  Service Categories * <span className="font-normal text-gray-400">(Add multiple for multi-service businesses)</span>
                </Label>
                <div className="space-y-2">
                  {/* Display added categories as tags */}
                  {primaryCategories.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {primaryCategories.map((category) => (
                        <Badge 
                          key={category} 
                          variant="secondary" 
                          className="bg-[#ff5800] text-white hover:bg-[#e04f00] px-3 py-1"
                        >
                          {category}
                          <button 
                            onClick={() => removeCategory(category)}
                            className="ml-2 hover:text-red-200"
                            data-testid={`button-remove-category-${category}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Input for adding new categories */}
                  <div className="flex gap-2">
                    <div className="relative group flex-1">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#ff5800] transition-colors" />
                      <Input
                        id="primaryCategories"
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                        placeholder={primaryCategories.length > 0 ? "Add another category..." : "Plumbing, HVAC, Electrical, etc."}
                        className="pl-12 bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                        data-testid="input-primary-categories"
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="icon"
                      onClick={addCategory}
                      disabled={!newCategoryInput.trim()}
                      data-testid="button-add-category"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Examples: Plumbing, HVAC, Electrical. For multi-service businesses like "MSP Right" that do plumbing AND HVAC, add both.
                  </p>
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
                        ? "border-[#ff5800] bg-orange-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid="button-scope-local"
                  >
                    <MapPin className={`w-6 h-6 mx-auto mb-2 ${scope === "local" ? "text-[#ff5800]" : "text-gray-400"}`} />
                    <div className="font-bold">Local</div>
                    <div className="text-sm text-gray-500">Specific city or region</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("national")}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                      scope === "national"
                        ? "border-[#ff5800] bg-orange-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid="button-scope-national"
                  >
                    <Globe className={`w-6 h-6 mx-auto mb-2 ${scope === "national" ? "text-[#ff5800]" : "text-gray-400"}`} />
                    <div className="font-bold">National</div>
                    <div className="text-sm text-gray-500">Serve entire country</div>
                  </button>
                </div>
              </div>

              {scope === "local" && (
                <div className="space-y-2">
                  <Label htmlFor="cities" className="text-xs uppercase font-bold tracking-wider text-gray-500">
                    Cities / Regions * <span className="font-normal text-gray-400">(Add multiple for multi-location businesses)</span>
                  </Label>
                  <div className="space-y-2">
                    {/* Display added cities as tags */}
                    {cities.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {cities.map((cityItem) => (
                          <Badge 
                            key={cityItem} 
                            variant="secondary" 
                            className="bg-green-500 text-white hover:bg-green-600 px-3 py-1"
                          >
                            <MapPin className="w-3 h-3 mr-1" />
                            {cityItem}
                            <button 
                              onClick={() => removeCity(cityItem)}
                              className="ml-2 hover:text-red-200"
                              data-testid={`button-remove-city-${cityItem}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {/* Input for adding new cities */}
                    <div className="flex gap-2">
                      <div className="relative group flex-1">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#ff5800] transition-colors" />
                        <Input
                          id="cities"
                          value={newCityInput}
                          onChange={(e) => setNewCityInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCity())}
                          placeholder={cities.length > 0 ? "Add another city..." : "Minneapolis, MN"}
                          className="pl-12 bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                          data-testid="input-cities"
                        />
                      </div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={addCity}
                        disabled={!newCityInput.trim()}
                        data-testid="button-add-city"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400">
                      For businesses serving multiple cities (like "MSP Right" in Minneapolis, St. Paul, Rochester), add each city separately.
                    </p>
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
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#ff5800] focus:ring-[#ff5800] focus:outline-none"
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
          <Card className="shadow-2xl shadow-orange-900/5">
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
                  <Loader2 className="w-8 h-8 text-[#ff5800] animate-spin mb-4" />
                  <p className="text-gray-500">Generating service groups with AI...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        group.isActive
                          ? "border-[#ff5800] bg-orange-50"
                          : "border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <button
                        onClick={() => toggleGroupActive(group.id)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          group.isActive
                            ? "bg-[#ff5800] border-[#ff5800] text-white"
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
          <Card className="shadow-2xl shadow-orange-900/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <FileText className="w-6 h-6 text-[#ff5800]" />
                Review Prompts
              </CardTitle>
              <p className="text-gray-500">
                We've generated 5 prompts per group. Review, edit, or add prompts to track.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingPrompts ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-[#ff5800] animate-spin mb-4" />
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
                                className="w-full p-2 border border-gray-200 rounded-lg focus:border-[#ff5800] focus:ring-[#ff5800] focus:outline-none"
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
          <Card className="shadow-2xl shadow-orange-900/5">
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
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#ff5800] to-[#ffb41c] transition-all duration-500"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <div className="text-center space-y-2">
                  <div className="text-4xl font-bold text-[#ff5800]" data-testid="text-scan-progress">{scanProgress}%</div>
                  <div className="text-lg font-medium text-gray-700" data-testid="text-scan-status">{scanStatus}</div>
                  {scanSubStatus && (
                    <div className="text-sm text-gray-500 truncate max-w-full" data-testid="text-scan-substatus">
                      {scanSubStatus}
                    </div>
                  )}
                  {currentPromptIndex > 0 && totalPrompts > 0 && (
                    <div className="text-xs text-gray-400 mt-1" data-testid="text-scan-counter">
                      Prompt {currentPromptIndex} of {totalPrompts}
                    </div>
                  )}
                </div>
                {isScanning && (
                  <div className="flex justify-center">
                    <Loader2 className="w-8 h-8 text-[#ff5800] animate-spin" />
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
              className="flex items-center gap-2 bg-[#ff5800] hover:bg-[#e04f00] text-white"
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
