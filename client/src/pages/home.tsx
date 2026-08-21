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
  Zap,
  BarChart3,
  FileText,
  ChevronDown,
  Shield,
  Eye,
  Target,
} from "lucide-react";
import type { AuditRequest, AuditResults } from "@shared/schema";
import { LEAD_GEN_TOTAL_PROMPTS } from "@shared/audit-constants";
import logoIcon from "@assets/Motivent_Logo_-_Tertiary_1781054476626.png";

type Step = "input" | "scanning";

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

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group transition-colors hover:bg-muted/50 px-1 rounded"
        aria-expanded={open}
        data-testid={`faq-toggle-${question.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`}
      >
        <span className="text-foreground font-semibold text-base pr-4">{question}</span>
        <ChevronDown
          size={20}
          className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-40 pb-5" : "max-h-0"}`}
      >
        <p className="text-gray-500 text-sm leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("input");

  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [scope, setScope] = useState<"local" | "national">("local");
  const [city, setCity] = useState("");

  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const auditSubmissionRef = useRef<{ fingerprint: string; requestId: string } | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

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

    abortControllerRef.current = new AbortController();

    try {
      const fingerprint = JSON.stringify({
        businessName,
        url,
        keyword,
        scope,
        city: scope === "local" ? city : null,
      });
      if (auditSubmissionRef.current?.fingerprint !== fingerprint) {
        auditSubmissionRef.current = {
          fingerprint,
          requestId: window.crypto.randomUUID(),
        };
      }

      const requestBody: AuditRequest = {
        businessName,
        url,
        keyword,
        scope,
        city: scope === "local" ? city : undefined,
        requestId: auditSubmissionRef.current.requestId,
      };

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
        
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          
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

      if (auditResult?.auditId) {
        setLocation(`/audit/${auditResult.auditId}`);
      } else {
        console.error("Audit stream ended without completion data");
        setErrorMessage("We couldn't finish your audit. Please try again.");
        setStep("input");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
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
    <div className="flex items-center">
      <img src={logoIcon} alt="Motivent Marketing Inc" className="h-12 object-contain" />
    </div>
  );

  const scrollToForm = () => {
    document.getElementById("audit-form")?.scrollIntoView({ behavior: "smooth" });
  };

  if (step === "input") {
    return (
      <div className="min-h-screen bg-background flex flex-col font-sans text-foreground selection:bg-[#ff5800] selection:text-white">
        <div className="bg-[#010400] text-white text-center py-2.5 px-4">
          <p className="text-sm font-medium tracking-wide" data-testid="text-urgency-banner">
            <Zap size={14} className="inline mr-1.5 text-[#ffb41c]" />
            Stop losing customers to competitors. Check your AI visibility today.
          </p>
        </div>

        <header className="px-6 py-5 flex justify-between items-center max-w-6xl mx-auto w-full">
          <Branding />
          <button
            type="button"
            onClick={scrollToForm}
            className="hidden sm:inline-flex items-center gap-2 bg-[#ff5800] hover:bg-[#e04f00] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            data-testid="button-header-cta"
          >
            Get My Free AI Audit <ArrowRight size={16} />
          </button>
        </header>

        <main className="flex-1 flex flex-col">
          <section className="px-4 pt-8 pb-16 md:pt-14 md:pb-24">
            <div className="max-w-3xl mx-auto">
              <div className="text-center space-y-6 mb-10">
                <h1
                  className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-[1.1]"
                  data-testid="text-headline"
                >
                  Is AI Recommending Your Business{" "}
                  <span className="text-[#ff5800]">Or Your Competitors?</span>
                </h1>
                <p className="text-lg md:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto" data-testid="text-subheadline">
                  If you aren't visible on ChatGPT and Google AI, you are losing customers every single day.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-5 pt-2">
                  <div className="flex items-center gap-3 bg-muted border border-gray-100 rounded-full px-4 py-2">
                    <Eye size={16} className="text-[#ff5800]" />
                    <span className="text-sm text-foreground font-medium" data-testid="text-benefit-1">See exactly what AI says about you</span>
                  </div>
                  <div className="flex items-center gap-3 bg-muted border border-gray-100 rounded-full px-4 py-2">
                    <Target size={16} className="text-[#ff5800]" />
                    <span className="text-sm text-foreground font-medium" data-testid="text-benefit-2">Uncover gaps in your AI strategy</span>
                  </div>
                  <div className="flex items-center gap-3 bg-muted border border-gray-100 rounded-full px-4 py-2">
                    <BarChart3 size={16} className="text-[#ff5800]" />
                    <span className="text-sm text-foreground font-medium" data-testid="text-benefit-3">Outrank competitors in AI search</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 text-sm text-gray-400 font-medium pt-1">
                  <span className="flex items-center gap-2"><CheckCircle size={15} className="text-emerald-600" /> ChatGPT</span>
                  <span className="flex items-center gap-2"><CheckCircle size={15} className="text-emerald-600" /> Google AI Overviews</span>
                </div>
              </div>

              <div id="audit-form" className="scroll-mt-8">
                  <div className="bg-background rounded-2xl border border-gray-200 overflow-hidden shadow-2xl shadow-black/[0.06]">
                    <div className="bg-muted border-b border-gray-200 px-6 py-4 text-center">
                      <h2 className="text-lg font-bold text-foreground" data-testid="text-form-title">Get Your Free AI Visibility Audit</h2>
                      <p className="text-sm text-gray-400 mt-0.5">Takes 30 seconds. No credit card required.</p>
                    </div>

                    <form onSubmit={startScan} className="flex flex-col">
                      <div className="flex border-b border-gray-200">
                        <button
                          type="button"
                          onClick={() => setScope("local")}
                          className={`flex-1 py-3.5 text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                            scope === "local"
                              ? "bg-background text-foreground border-b-2 border-[#ff5800]"
                              : "bg-muted text-gray-400 hover:text-gray-600"
                          }`}
                          data-testid="button-scope-local"
                        >
                          <MapPin size={15} className={scope === "local" ? "text-[#ff5800]" : ""} /> Local
                        </button>
                        <button
                          type="button"
                          onClick={() => setScope("national")}
                          className={`flex-1 py-3.5 text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                            scope === "national"
                              ? "bg-background text-foreground border-b-2 border-[#ff5800]"
                              : "bg-muted text-gray-400 hover:text-gray-600"
                          }`}
                          data-testid="button-scope-national"
                        >
                          <Globe size={15} className={scope === "national" ? "text-[#ff5800]" : ""} /> National
                        </button>
                      </div>

                      <div className="p-6 space-y-3.5">
                        {errorMessage && (
                          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-left flex items-start gap-2" data-testid="audit-error-message">
                            <AlertCircle size={16} className="text-destructive mt-0.5" />
                            <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
                          </div>
                        )}

                        <div className="group relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Building2 className="text-gray-400 group-focus-within:text-[#ff5800] transition-colors" size={18} />
                          </div>
                          <input
                            type="text"
                            placeholder="Business Name"
                            className="w-full pl-11 pr-4 py-3.5 bg-muted border border-gray-200 focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none transition-all font-medium rounded-lg text-sm"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            data-testid="input-business-name"
                            required
                          />
                        </div>

                        <div className="group relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Layout className="text-gray-400 group-focus-within:text-[#ff5800] transition-colors" size={18} />
                          </div>
                          <input
                            type="text"
                            placeholder="Website (e.g. motiventmarketing.com)"
                            className="w-full pl-11 pr-4 py-3.5 bg-muted border border-gray-200 focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none transition-all font-medium rounded-lg text-sm"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            data-testid="input-url"
                            required
                          />
                        </div>

                        <div className="group relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Search className="text-gray-400 group-focus-within:text-[#ff5800] transition-colors" size={18} />
                          </div>
                          <input
                            type="text"
                            placeholder="Main Service (e.g. Plumber, SEO Agency)"
                            className="w-full pl-11 pr-4 py-3.5 bg-muted border border-gray-200 focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none transition-all font-medium rounded-lg text-sm"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            data-testid="input-keyword"
                            required
                          />
                        </div>

                        {scope === "local" && (
                          <div className="group relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                              <MapPin className="text-gray-400 group-focus-within:text-[#ff5800] transition-colors" size={18} />
                            </div>
                            <input
                              type="text"
                              placeholder="Target City (e.g. Dallas, TX)"
                              className="w-full pl-11 pr-4 py-3.5 bg-muted border border-gray-200 focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none transition-all font-medium rounded-lg text-sm"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              data-testid="input-city"
                              required={scope === "local"}
                            />
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white text-base font-bold tracking-wide py-4 uppercase transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 mt-2 rounded-lg shadow-lg shadow-orange-500/20 disabled:opacity-50"
                          data-testid="button-start-audit"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "Starting Audit..." : "Get My Free AI Audit"} <ArrowRight size={18} />
                        </button>

                        <div className="flex items-center justify-center gap-4 pt-1">
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Shield size={12} /> No credit card
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Zap size={12} /> Results in 60 seconds
                          </span>
                        </div>
                      </div>
                    </form>
                  </div>

                  <p className="text-center text-xs text-gray-400 font-medium mt-4">
                    Generating {LEAD_GEN_TOTAL_PROMPTS} AI prompt variations across ChatGPT & Google AI
                  </p>
              </div>
            </div>
          </section>

          <section className="bg-muted border-t border-gray-100 py-16 md:py-20 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-sm font-bold text-[#ff5800] uppercase tracking-widest mb-3" data-testid="text-how-it-works-label">How It Works</p>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight" data-testid="text-how-it-works-title">
                  Your AI Visibility Report in 3 Steps
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#ff5800]/10 flex items-center justify-center mx-auto">
                    <Layout size={24} className="text-[#ff5800]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs font-bold text-[#ff5800] bg-[#ff5800]/10 px-2 py-0.5 rounded-full">1</span>
                      <h3 className="font-bold text-foreground" data-testid="text-step-1-title">Enter Your URL</h3>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed" data-testid="text-step-1-desc">
                      Drop your website link to begin the rapid AI discovery scan.
                    </p>
                  </div>
                </div>

                <div className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#ffb41c]/10 flex items-center justify-center mx-auto">
                    <BarChart3 size={24} className="text-[#ffb41c]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs font-bold text-[#ffb41c] bg-[#ffb41c]/10 px-2 py-0.5 rounded-full">2</span>
                      <h3 className="font-bold text-foreground" data-testid="text-step-2-title">AI Engines Scanned</h3>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed" data-testid="text-step-2-desc">
                      We analyze ChatGPT and Google AI Overviews for your brand.
                    </p>
                  </div>
                </div>

                <div className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 flex items-center justify-center mx-auto">
                    <FileText size={24} className="text-emerald-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-600/10 px-2 py-0.5 rounded-full">3</span>
                      <h3 className="font-bold text-foreground" data-testid="text-step-3-title">Get Your Report</h3>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed" data-testid="text-step-3-desc">
                      Receive a customized breakdown of your AI visibility and improvement steps.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="py-16 md:py-20 px-4 bg-background">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight" data-testid="text-faq-title">
                  Frequently Asked Questions
                </h2>
              </div>

              <div className="border-t border-gray-100" data-testid="faq-section">
                <FAQItem
                  question="Which AI platforms do you check?"
                  answer="Our audit comprehensively scans the top AI search engines, including ChatGPT and Google AI Overviews, to see if they actively recommend your business."
                />
                <FAQItem
                  question="Why does AI visibility matter now?"
                  answer="Millions of users now ask AI for recommendations instead of using traditional search. If AI doesn't know you exist, those potential customers go straight to your competitors."
                />
                <FAQItem
                  question="How long does the audit take?"
                  answer="The initial scan takes less than 60 seconds. You'll instantly receive a high-level overview of your brand's AI presence directly on your screen."
                />
              </div>
            </div>
          </section>

          <section className="bg-[#010400] py-14 px-4">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight" data-testid="text-bottom-cta-title">
                Ready to See Where You Stand in AI Search?
              </h2>
              <p className="text-gray-400 text-base">
                Discover exactly how ChatGPT and Google AI recommend (or ignore) your brand.
              </p>
              <button
                type="button"
                onClick={scrollToForm}
                className="inline-flex items-center gap-2 bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold text-base px-8 py-4 rounded-lg transition-colors shadow-lg shadow-orange-500/30"
                data-testid="button-bottom-cta"
              >
                Get My Free AI Audit <ArrowRight size={18} />
              </button>
              <p className="text-gray-500 text-xs">No credit card required. Results in 60 seconds.</p>
            </div>
          </section>

          <footer className="bg-background border-t border-gray-100 py-8 px-4">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <Branding />
              <p className="text-xs text-gray-400">Developed by Motivent Marketing Inc's growth team.</p>
            </div>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 font-mono">
      <div className="max-w-xl w-full space-y-12">
        <div className="text-center space-y-6">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 border-2 border-gray-100 rounded-full"></div>
            <div className="absolute inset-0 border-2 border-[#ff5800] rounded-full border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 bg-[#ffb41c] transform rotate-45 animate-pulse"></div>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-foreground tracking-tight" data-testid="text-scan-status">{scanStatus}</h2>
            <div className="h-8">
              <p className="text-gray-500 text-sm font-medium animate-pulse border border-gray-100 inline-block px-3 py-1 bg-muted rounded-md" data-testid="text-scan-prompt">
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
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-[#ff5800] h-full transition-all duration-300 ease-out rounded-full"
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
