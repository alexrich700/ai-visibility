import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  CheckCircle,
  ArrowRight,
  MapPin,
  Layout,
  Building2,
  Globe,
  Users,
} from "lucide-react";
import type { AuditRequest, AuditResults } from "@shared/schema";
import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";
import logoIcon from "@assets/images_1765741951084.png";

type Step = "input" | "scanning";

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

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // Audit mutation
  const auditMutation = useMutation({
    mutationFn: async (data: AuditRequest) => {
      const response = await apiRequest("POST", "/api/audit", data);
      return await response.json() as AuditResults;
    },
    onSuccess: (data) => {
      if (data.auditId) {
        setLocation(`/audit/${data.auditId}`);
      }
    },
    onError: (error) => {
      console.error("Audit failed:", error);
      setStep("input");
    },
  });

  const startScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !keyword || !businessName) return;
    if (scope === "local" && !city) return;

    setStep("scanning");

    const locationString = scope === "local" ? `in ${city}` : "";
    const locationContext = scope === "local" ? city : "National";

    const stages = [
      { progress: 5, text: "Initializing Rossman Media AI Engine...", subtext: "Connecting to Knowledge Graph..." },
      { progress: 10, text: `Identifying Entity: ${businessName}`, subtext: "Verifying domain authority..." },
      { progress: 20, text: "Scraping website content...", subtext: `Analyzing ${url}...` },
      { progress: 30, text: "Generating 20 User Intent Prompts...", subtext: `Creating variations for "${keyword}"...` },
      { progress: 45, text: "Querying ChatGPT...", subtext: `PROMPT: "Who is the best ${keyword} ${locationString}?"` },
      { progress: 65, text: "Querying Google AI Overviews...", subtext: `PROMPT: "Top rated ${keyword} providers ${locationContext}..."` },
      { progress: 80, text: "Analyzing Competitor Share of Voice...", subtext: "Cross-referencing ChatGPT & Google AI..." },
      { progress: 90, text: "Compiling Prompt Log...", subtext: "Identifying missed opportunities..." },
      { progress: 95, text: "Calculating visibility score...", subtext: "Finalizing audit..." },
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage >= stages.length) {
        clearInterval(interval);
        return;
      }
      setScanProgress(stages[currentStage].progress);
      setScanStatus(stages[currentStage].text);
      setActivePrompt(stages[currentStage].subtext);
      currentStage++;
    }, 3000);

    try {
      await auditMutation.mutateAsync({
        businessName,
        url,
        keyword,
        scope,
        city: scope === "local" ? city : undefined,
      });
    } finally {
      clearInterval(interval);
      setScanProgress(100);
      setScanStatus("Audit Complete");
      setActivePrompt("Redirecting to your report...");
    }
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
        <header className="px-6 py-8 flex justify-between items-center max-w-7xl mx-auto w-full">
          <Branding />
          <Link href="/monitor/clients">
            <button 
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-[#5599f9] transition-colors"
              data-testid="link-monitoring-clients"
            >
              <Users className="w-4 h-4" />
              Monitoring Dashboard
            </button>
          </Link>
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
                    disabled={auditMutation.isPending}
                    className="w-full bg-[#5599f9] hover:bg-[#4a8ce8] text-white text-lg font-bold tracking-wide py-5 uppercase transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 mt-4 rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    data-testid="button-start-audit"
                  >
                    Start Visibility Audit <ArrowRight size={20} />
                  </button>

                  <div className="text-center pt-2">
                    <p className="text-xs text-gray-400 font-medium">
                      Generating 20 AI prompt variations - Checking ChatGPT & Google AI Overviews
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
      </div>
    </div>
  );
}
