import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  MapPin,
  Layout,
  Building2,
  Globe,
  Search,
  CheckCircle,
  AlertCircle,
  XCircle,
} from "lucide-react";
import type { AuditRequest, AuditResults } from "@shared/schema";
import { LEAD_GEN_TOTAL_PROMPTS } from "@shared/audit-constants";
import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";
import logoIcon from "@assets/images_1765741951084.png";

type Step = "input" | "scanning";

// Map backend stages to user-friendly messages
function getStageMessage(stage: string, progress?: number, total?: number, percentage?: number): { text: string; subtext: string; progress: number } {
  switch (stage) {
    case "generating_prompts":
      return { 
        text: "Generating Industry-Specific Prompts...", 
        subtext: "Tailoring queries for your business and location",
        progress: 10 
      };
    case "querying_ai":
      const completedResponses = typeof progress === "number" ? progress : 0;
      const totalResponses = typeof total === "number" && total > 0 ? total : 20;
      const remaining = totalResponses - completedResponses;
      const etaSeconds = Math.max(10, Math.round(remaining * 3));
      const pct = typeof percentage === "number" ? percentage : 10;
      return { 
        text: `Querying ChatGPT & Google AI...`, 
        subtext: `${completedResponses}/${totalResponses} AI responses received • ~${etaSeconds}s remaining`,
        progress: pct
      };
    case "analyzing_results":
      return { 
        text: "Analyzing Results...", 
        subtext: "Calculating visibility scores and sentiment",
        progress: 99 
      };
    case "generating_summary":
      return { 
        text: "Creating Executive Summary...", 
        subtext: "Generating personalized insights for your business",
        progress: 99 
      };
    case "complete":
      return { 
        text: "Audit Complete!", 
        subtext: "Redirecting to your report...",
        progress: 100 
      };
    default:
      return { 
        text: "Processing...", 
        subtext: "Please wait",
        progress: 5 
      };
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("input");

  // Input State
  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [scope, setScope] = useState<"local" | "national">("local");
  const [city, setCity] = useState("");

  // Scanning State
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const startScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !keyword || !businessName) return;
    if (scope === "local" && !city) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    setStep("scanning");
    setScanProgress(5);
    setScanStatus("Initializing Audit...");
    setActivePrompt("Connecting to AI platforms...");

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    try {
      const requestBody: AuditRequest = {
        businessName,
        url,
        keyword,
        scope,
        city: scope === "local" ? city : undefined,
      };

      // Use fetch with SSE to stream progress
      const response = await fetch("/api/audit/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Unable to start your audit right now. Please try again.");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let auditResult: AuditResults | null = null;

      let chunkCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[SSE] Stream ended after ${chunkCount} chunks`);
          break;
        }

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        console.log(`[SSE] Chunk #${chunkCount}: ${chunk.length} bytes`);
        
        // Parse SSE events from buffer - split on double newlines (event separator)
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          
          // Skip SSE comment lines (heartbeats)
          if (eventBlock.trim().startsWith(":")) continue;
          
          const lines = eventBlock.split("\n");
          let eventType = "";
          let eventData = "";
          
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            }
          }
          
          if (eventType && eventData) {
            try {
              const data = JSON.parse(eventData);
              console.log(`[SSE] Parsed event: ${eventType}`, eventType === "progress" ? data : "(data omitted)");
              
              if (eventType === "progress") {
                const { stage, progress, total } = data;
                const msg = getStageMessage(stage, progress, total, data.percentage);
                setScanProgress(msg.progress);
                setScanStatus(msg.text);
                setActivePrompt(msg.subtext);
              } else if (eventType === "warning") {
                console.warn("[Audit warning]", data.message);
                if (data.subtext) {
                  setActivePrompt(data.subtext);
                }
              } else if (eventType === "complete") {
                auditResult = data as AuditResults;
                setScanProgress(100);
                setScanStatus("Audit Complete!");
                setActivePrompt("Redirecting to your report...");
              } else if (eventType === "error") {
                throw new Error(data.error || "Audit failed");
              }
            } catch (parseError) {
              console.error("Failed to parse SSE event:", eventType, eventData?.substring(0, 200), parseError);
            }
          } else if (eventBlock.trim()) {
            console.warn(`[SSE] Unparseable event block (${eventBlock.length} chars):`, eventBlock.substring(0, 200));
          }
        }
      }

      // Navigate to results after stream ends
      if (auditResult?.auditId) {
        setLocation(`/audit/${auditResult.auditId}`);
      } else {
        // Stream ended without complete event - show error
        console.error("Audit stream ended without completion data");
        setErrorMessage("We couldn't finish your audit. Please try again.");
        setStep("input");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return; // User navigated away
      }
      console.error("Audit failed:", error);
      setErrorMessage((error as Error).message || "Audit failed. Please try again.");
      setStep("input");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelScan = () => {
    setErrorMessage("Live updates stopped. Your audit may still finish in the background.");
    setStep("input");
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const Branding = () => (
    <div className="flex items-center gap-3">
      <img src={logoIcon} alt="Rossman Media" className="h-8 w-8 rounded-md" />
      <img src={logoFull} alt="ROSSMAN MEDIA" className="h-6" />
    </div>
  );

  // --- View: Input ---
  if (step === "input") {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans text-[#010400] selection:bg-[#5599f9] selection:text-white">
        <header className="px-6 py-8 flex justify-center items-center max-w-7xl mx-auto w-full">
          <Branding />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-10">
          <div className="max-w-3xl w-full text-center space-y-12">
            <div className="space-y-4 pt-8">
              <h1 className="text-4xl md:text-5xl font-bold text-[#010400] tracking-tighter leading-tight">
                Your competitors are getting recommended.
              </h1>
              <p className="text-3xl md:text-4xl font-bold text-[#010400] tracking-tight italic">
                Are you?
              </p>
              <p className="text-lg md:text-xl text-gray-500 max-w-xl mx-auto leading-relaxed font-light pt-4">
                See exactly how ChatGPT and Google AI Overviews recommend (or ignore) your brand.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xl shadow-blue-900/5">
              <form onSubmit={startScan} className="flex flex-col">
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setScope("local")}
                    className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                      scope === "local"
                        ? "bg-gray-50 text-[#010400] border-b-2 border-[#5599f9]"
                        : "bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                    data-testid="button-scope-local"
                  >
                    <MapPin size={16} className={scope === "local" ? "text-[#5599f9]" : ""} /> Local Business
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("national")}
                    className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                      scope === "national"
                        ? "bg-gray-50 text-[#010400] border-b-2 border-[#5599f9]"
                        : "bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                    data-testid="button-scope-national"
                  >
                    <Globe size={16} className={scope === "national" ? "text-[#5599f9]" : ""} /> National Brand
                  </button>
                </div>

                <div className="p-8 space-y-4 bg-white">
                  {errorMessage && (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-left flex items-start gap-2" data-testid="audit-error-message">
                      <AlertCircle size={16} className="text-red-500 mt-0.5" />
                      <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Building2 className="text-gray-400 group-focus-within:text-[#5599f9] transition-colors" size={20} />
                      </div>
                      <input
                        type="text"
                        placeholder="Business Name"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none transition-all font-medium rounded-lg"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        data-testid="input-business-name"
                        required
                      />
                    </div>

                    <div className="group relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Layout className="text-gray-400 group-focus-within:text-[#5599f9] transition-colors" size={20} />
                      </div>
                      <input
                        type="text"
                        placeholder="Website (e.g. rossmanmedia.com)"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none transition-all font-medium rounded-lg"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        data-testid="input-url"
                        required
                      />
                    </div>
                  </div>

                  <div className={`grid gap-4 ${scope === "local" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                    <div className="group relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="text-gray-400 group-focus-within:text-[#5599f9] transition-colors" size={20} />
                      </div>
                      <input
                        type="text"
                        placeholder="Main Service (e.g. Plumber, SEO Agency)"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none transition-all font-medium rounded-lg"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        data-testid="input-keyword"
                        required
                      />
                    </div>

                    {scope === "local" && (
                      <div className="group relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <MapPin className="text-gray-400 group-focus-within:text-[#5599f9] transition-colors" size={20} />
                        </div>
                        <input
                          type="text"
                          placeholder="Target City (e.g. Dallas, TX)"
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none transition-all font-medium rounded-lg"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          data-testid="input-city"
                          required={scope === "local"}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#5599f9] hover:bg-[#4a8ce8] text-white text-lg font-bold tracking-wide py-5 uppercase transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 mt-4 rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    data-testid="button-start-audit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Starting Audit..." : "Start Visibility Audit"} <ArrowRight size={20} />
                  </button>

                  <div className="text-center pt-2">
                    <p className="text-xs text-gray-400 font-medium">
                      Generating {LEAD_GEN_TOTAL_PROMPTS} AI prompt variations - Checking ChatGPT & Google AI Overviews
                    </p>
                  </div>
                </div>
              </form>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-gray-400 uppercase tracking-widest">
              <span className="flex items-center gap-2"><CheckCircle size={14} className="text-[#5599f9]" /> ChatGPT</span>
              <span className="flex items-center gap-2"><CheckCircle size={14} className="text-[#5599f9]" /> Google AI Overviews</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- View: Scanning ---
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 font-mono">
      <div className="max-w-xl w-full space-y-12">
        <div className="text-center space-y-6">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 border-2 border-gray-100 rounded-full"></div>
            <div className="absolute inset-0 border-2 border-[#5599f9] rounded-full border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 bg-[#ffb41c] transform rotate-45 animate-pulse"></div>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-[#010400] tracking-tight" data-testid="text-scan-status">{scanStatus}</h2>
            <div className="h-8">
              <p className="text-gray-500 text-sm font-medium animate-pulse border border-gray-100 inline-block px-3 py-1 bg-gray-50 rounded-md" data-testid="text-scan-prompt">
                {activePrompt}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-gray-400">
            <span>Progress</span>
            <span data-testid="text-scan-progress">{scanProgress}%</span>
          </div>
          <div className="bg-gray-100 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-[#5599f9] h-full transition-all duration-300 ease-out rounded-full"
              style={{ width: `${scanProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="space-y-3 text-center">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            You can leave this page. We will keep processing your audit.
          </p>
          <button
            type="button"
            onClick={cancelScan}
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md px-3 py-2 transition-colors"
            data-testid="button-cancel-audit"
          >
            <XCircle size={14} /> Stop Live Updates
          </button>
        </div>
      </div>
    </div>
  );
}
