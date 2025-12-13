import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  CheckCircle,
  AlertTriangle,
  Cpu,
  Globe,
  ArrowRight,
  MapPin,
  Layout,
  Building2,
  FileText,
  X,
  Phone,
  Mail,
  User,
  BarChart2,
  Loader2,
  Download,
  Lock,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Zap,
  Calendar,
  Printer,
} from "lucide-react";
import type { AuditRequest, AuditResults, PromptResult, SentimentResult } from "@shared/schema";

type Step = "input" | "scanning" | "results" | "fullReport";

interface ScanProgress {
  progress: number;
  status: string;
  subtext: string;
}

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [showLeadForm, setShowLeadForm] = useState(false);

  // Input State
  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [scope, setScope] = useState<"local" | "national">("local");
  const [city, setCity] = useState("");

  // Lead Form State
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");

  // Scanning State
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [activePrompt, setActivePrompt] = useState("");

  // Results State
  const [auditResults, setAuditResults] = useState<AuditResults | null>(null);

  // Audit mutation
  const auditMutation = useMutation({
    mutationFn: async (data: AuditRequest) => {
      const response = await apiRequest("POST", "/api/audit", data);
      return await response.json() as AuditResults;
    },
    onSuccess: (data) => {
      setAuditResults(data);
      setStep("results");
    },
    onError: (error) => {
      console.error("Audit failed:", error);
      setStep("input");
    },
  });

  // Lead capture mutation
  const leadMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; businessName: string; auditScore: number }) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return await response.json();
    },
    onSuccess: () => {
      setShowLeadForm(false);
      setStep("fullReport");
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
      setActivePrompt("Redirecting...");
    }
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadEmail || !leadPhone) return;

    leadMutation.mutate({
      name: leadName,
      email: leadEmail,
      phone: leadPhone,
      businessName,
      auditScore: auditResults?.overallScore || 0,
    });
  };

  const Branding = () => (
    <div className="flex items-center gap-3 font-bold text-2xl tracking-tighter text-[#010400]">
      <div className="flex h-8 w-8 relative overflow-hidden rounded-md bg-[#5599f9]">
        <div className="absolute top-0 right-0 w-4 h-8 bg-[#ffb41c] skew-x-12 transform translate-x-1"></div>
      </div>
      <span>ROSSMAN<span className="font-light">MEDIA</span></span>
    </div>
  );

  const getPromptResultText = (result: PromptResult): string => {
    const foundCount = [result.chatgpt.found, result.googleAI.found].filter(Boolean).length;
    if (foundCount === 0) {
      const competitorCount = (result.chatgpt.competitors?.length || 0) + (result.googleAI.competitors?.length || 0);
      if (competitorCount > 0) {
        return `Result: ${Math.min(competitorCount, 3)} Competitors cited. Your brand was not mentioned.`;
      }
      return "Result: AI recommended competitors. Your brand was not mentioned.";
    }
    if (foundCount === 2) {
      return "Result: Brand found across all platforms.";
    }
    return "Result: Brand found, but sentiment was neutral/mixed.";
  };

  const PromptResultRow = ({ result, index }: { result: PromptResult; index: number }) => {
    const foundCount = [result.chatgpt.found, result.googleAI.found].filter(Boolean).length;
    const isFound = foundCount > 0;
    const resultText = getPromptResultText(result);

    return (
      <div 
        className="flex items-start gap-4 p-4 border-b border-gray-100 last:border-0"
        data-testid={`prompt-result-${index}`}
      >
        <div className="mt-1">
          {isFound ? (
            <CheckCircle className="text-[#5599f9]" size={20} />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-red-200 flex items-center justify-center">
              <X className="w-3 h-3 text-red-500" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-1">Simulated Prompt</div>
          <p className="font-medium text-[#010400] text-lg">"{result.prompt}"</p>
          <p className={`text-sm mt-1 ${isFound ? 'text-green-600' : 'text-red-500 font-medium'}`}>
            {resultText}
          </p>
        </div>
      </div>
    );
  };

  // --- View: Input ---
  if (step === "input") {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans text-[#010400] selection:bg-[#5599f9] selection:text-white">
        <header className="px-6 py-8 flex justify-between items-center max-w-7xl mx-auto w-full">
          <Branding />
          <button className="text-sm font-semibold tracking-wide text-gray-500 hover:text-[#5599f9] transition-colors uppercase">
            Client Login
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-10">
          <div className="max-w-3xl w-full text-center space-y-10">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-7xl font-bold text-[#010400] tracking-tighter leading-none">
                Are you invisible to AI?
              </h1>
              <p className="text-xl md:text-2xl text-gray-500 max-w-2xl mx-auto leading-relaxed font-light">
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
  if (step === "scanning") {
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

  // --- View: Full Report (After Lead Submission) ---
  if (step === "fullReport") {
    // Guard: redirect to results if no audit data
    if (!auditResults) {
      setStep("results");
      return null;
    }

    const handlePrintReport = () => {
      window.print();
    };

    const getScoreColorFull = (score: number) => {
      if (score >= 70) return "text-green-600";
      if (score >= 40) return "text-[#ffb41c]";
      return "text-red-500";
    };

    const getScoreLabelFull = (score: number) => {
      if (score >= 70) return "Strong";
      if (score >= 40) return "Moderate";
      return "Critical";
    };

    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const SectionHeader = ({ title, icon: Icon }: { title: string; icon: any }) => (
      <div className="flex items-center gap-3 border-b border-gray-200 pb-4 mb-6">
        <div className="p-2 bg-[#5599f9]/10 rounded-lg">
          <Icon className="text-[#5599f9]" size={24} />
        </div>
        <h2 className="text-2xl font-bold text-[#010400] tracking-tight">{title}</h2>
      </div>
    );

    return (
      <div className="min-h-screen bg-gray-100 py-10 font-sans text-[#010400] print:py-0 print:bg-white" id="full-report">
        {/* Print Styles */}
        <style>{`
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .print-break { page-break-before: always; }
          }
        `}</style>

        {/* Floating Action Bar */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#010400] text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-6 no-print">
          <span className="text-sm font-bold hidden md:inline">Your Report is Ready</span>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrintReport}
              className="flex items-center gap-2 hover:text-[#5599f9] transition-colors text-sm font-medium"
              data-testid="button-print-report"
            >
              <Printer size={16} /> Print
            </button>
            <div className="w-px h-4 bg-gray-700"></div>
            <button 
              onClick={handlePrintReport}
              className="flex items-center gap-2 hover:text-[#5599f9] transition-colors text-sm font-bold"
              data-testid="button-download-pdf"
            >
              <Download size={16} /> Download PDF
            </button>
            <div className="w-px h-4 bg-gray-700"></div>
            <button 
              onClick={() => setStep("input")}
              className="flex items-center gap-2 hover:text-[#5599f9] transition-colors text-sm font-medium"
              data-testid="button-new-audit-full"
            >
              New Audit
            </button>
          </div>
        </div>

        {/* Main Report Container */}
        <div className="max-w-5xl mx-auto bg-white shadow-xl min-h-[1200px] overflow-hidden print:shadow-none">
          
          {/* 1. Header / Cover - Black with decorative shapes */}
          <header className="bg-[#010400] text-white p-12 relative overflow-hidden">
            {/* Abstract Brand Shapes */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#5599f9] rounded-full mix-blend-multiply opacity-20 transform translate-x-1/2 -translate-y-1/2 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#ffb41c] rounded-full mix-blend-multiply opacity-20 transform -translate-x-1/2 translate-y-1/2 blur-3xl"></div>

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
              <div className="space-y-6">
                <div className="flex items-center gap-3 font-bold text-3xl tracking-tighter">
                  <div className="flex h-10 w-10 relative overflow-hidden rounded-md bg-[#5599f9]">
                    <div className="absolute top-0 right-0 w-5 h-10 bg-[#ffb41c] skew-x-12 transform translate-x-1"></div>
                  </div>
                  <span>ROSSMAN<span className="font-light">MEDIA</span></span>
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2" data-testid="full-report-title">AI Visibility Audit</h1>
                  <p className="text-gray-400 text-lg">Comprehensive Analysis & Strategic Roadmap</p>
                </div>
              </div>
              
              <div className="text-right space-y-2">
                <div className="inline-block bg-[#5599f9] text-white text-xs font-bold px-3 py-1 rounded uppercase tracking-wider mb-2">
                  Confidential Report
                </div>
                <p className="text-sm text-gray-400 font-mono">
                  {auditResults.businessName} | {auditResults.keyword}
                  {auditResults.scope === "local" && auditResults.city && ` | ${auditResults.city}`}
                </p>
                <p className="text-lg font-bold">{currentDate}</p>
              </div>
            </div>
          </header>

          {/* 2. Executive Summary */}
          <section className="p-12 border-b border-gray-200">
            <SectionHeader title="Executive Summary" icon={Zap} />
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
              <div className="md:col-span-8 space-y-6">
                <p className="text-lg text-gray-600 leading-relaxed" data-testid="full-executive-summary">
                  {auditResults.executiveSummary || `We analyzed ${auditResults.businessName} across 20 high-intent AI prompts on ChatGPT and Google AI. The results indicate a visibility score of ${auditResults.overallScore}/100.`}
                </p>
                
                {auditResults.overallScore < 40 && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg space-y-2">
                    <h4 className="font-bold text-red-900 flex items-center gap-2">
                      <AlertTriangle size={18} /> Primary Issue Detected
                    </h4>
                    <p className="text-red-800">
                      AI models lack sufficient data about your brand. When users ask recommendation queries, AI cannot find structured comparisons to validate your authority, defaulting to competitors who have this content.
                    </p>
                  </div>
                )}
                {auditResults.overallScore >= 40 && auditResults.overallScore < 70 && (
                  <div className="bg-yellow-50 border-l-4 border-[#ffb41c] p-6 rounded-r-lg space-y-2">
                    <h4 className="font-bold text-yellow-900 flex items-center gap-2">
                      <AlertTriangle size={18} /> Improvement Opportunities
                    </h4>
                    <p className="text-yellow-800">
                      Your brand has moderate visibility but there are opportunities to improve. Focus on building more authoritative content and increasing brand mentions across the web.
                    </p>
                  </div>
                )}
                {auditResults.overallScore >= 70 && (
                  <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg space-y-2">
                    <h4 className="font-bold text-green-900 flex items-center gap-2">
                      <CheckCircle size={18} /> Strong AI Presence
                    </h4>
                    <p className="text-green-800">
                      Your brand has excellent visibility across AI platforms. Continue maintaining your content strategy and monitor for any changes in AI recommendations.
                    </p>
                  </div>
                )}
              </div>

              <div className="md:col-span-4 flex flex-col gap-4">
                <div className={`p-6 rounded-xl border flex flex-col justify-between h-full ${
                  auditResults.overallScore >= 70 ? "bg-green-50 border-green-100" :
                  auditResults.overallScore >= 40 ? "bg-yellow-50 border-yellow-100" :
                  "bg-red-50 border-red-100"
                }`}>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-500">Overall Visibility Score</p>
                    <p className={`text-4xl font-bold mb-1 ${getScoreColorFull(auditResults.overallScore)}`} data-testid="full-report-overall-score">
                      {auditResults.overallScore}/100
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{getScoreLabelFull(auditResults.overallScore)} Visibility</p>
                </div>
                <div className="p-6 rounded-xl border bg-[#010400] text-white border-[#010400] flex flex-col justify-between h-full">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-400">Platforms Analyzed</p>
                    <p className="text-3xl font-bold mb-1">2</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">ChatGPT & Google AI</p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Simulated Prompt Log - Table Format */}
          <section className="p-12 border-b border-gray-200 bg-gray-50">
            <SectionHeader title="Simulated Prompt Log" icon={Cpu} />
            <p className="mb-6 text-gray-600">We simulated the following user queries to test brand presence across AI platforms.</p>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                    <th className="p-4 w-16 text-center">Status</th>
                    <th className="p-4">Simulated User Query</th>
                    <th className="p-4 hidden md:table-cell">AI Response Summary</th>
                    <th className="p-4 w-32">Platform</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditResults.promptResults?.map((result, idx) => {
                    const foundCount = [result.chatgpt.found, result.googleAI.found].filter(Boolean).length;
                    const status = foundCount === 2 ? "found" : foundCount === 1 ? "warning" : "lost";
                    const platforms = [];
                    if (result.chatgpt.found) platforms.push("ChatGPT");
                    if (result.googleAI.found) platforms.push("Google AI");
                    const platformText = platforms.length > 0 ? platforms.join(", ") : "None";
                    
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors" data-testid={`full-prompt-result-${idx}`}>
                        <td className="p-4 text-center">
                          {status === 'found' && <CheckCircle className="text-green-500 mx-auto" size={20} />}
                          {status === 'lost' && <div className="w-5 h-5 mx-auto rounded-full border-2 border-red-200 flex items-center justify-center"><X className="w-3 h-3 text-red-500" /></div>}
                          {status === 'warning' && <AlertTriangle className="text-[#ffb41c] mx-auto" size={20} />}
                        </td>
                        <td className="p-4 font-medium text-[#010400]">"{result.prompt}"</td>
                        <td className="p-4 text-gray-500 text-sm hidden md:table-cell">
                          {result.summary || getPromptResultText(result)}
                        </td>
                        <td className="p-4">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${
                            status === 'found' ? 'bg-green-100 text-green-700' :
                            status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{platformText}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-4 bg-gray-50 text-center border-t border-gray-200 text-sm text-gray-500 font-medium">
                {auditResults.promptResults?.length || 20} prompts analyzed across ChatGPT and Google AI
              </div>
            </div>
          </section>

          {/* 4. Brand Sentiment & Platform Breakdown */}
          <section className="grid grid-cols-1 md:grid-cols-2">
            {/* Sentiment */}
            <div className="p-12 border-b md:border-b-0 md:border-r border-gray-200">
              <SectionHeader title="Brand Sentiment" icon={BarChart2} />
              
              {auditResults.sentimentAnalysis && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase">Dominant Sentiment</p>
                      <p className="text-xl font-bold text-[#010400]" data-testid="full-sentiment-overall">
                        {auditResults.sentimentAnalysis.overall.charAt(0).toUpperCase() + auditResults.sentimentAnalysis.overall.slice(1)}
                      </p>
                    </div>
                    {auditResults.sentimentAnalysis.overall === "positive" && <ThumbsUp size={32} className="text-green-500" />}
                    {auditResults.sentimentAnalysis.overall === "negative" && <ThumbsDown size={32} className="text-red-500" />}
                    {auditResults.sentimentAnalysis.overall === "neutral" && <Minus size={32} className="text-gray-400" />}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><ThumbsUp size={16} className="text-green-500" /> Positive Signals</span>
                      <span className="font-bold" data-testid="full-sentiment-positive">{auditResults.sentimentAnalysis.positiveCount}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full" style={{ width: `${(auditResults.sentimentAnalysis.positiveCount / 10) * 100}%` }}></div>
                    </div>

                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="flex items-center gap-2"><Minus size={16} className="text-gray-400" /> Neutral/Unknown</span>
                      <span className="font-bold" data-testid="full-sentiment-neutral">{auditResults.sentimentAnalysis.neutralCount}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-gray-400 h-full" style={{ width: `${(auditResults.sentimentAnalysis.neutralCount / 10) * 100}%` }}></div>
                    </div>

                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="flex items-center gap-2"><ThumbsDown size={16} className="text-red-500" /> Negative Signals</span>
                      <span className="font-bold" data-testid="full-sentiment-negative">{auditResults.sentimentAnalysis.negativeCount}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full" style={{ width: `${(auditResults.sentimentAnalysis.negativeCount / 10) * 100}%` }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Platform Scores */}
            <div className="p-12 border-b border-gray-200">
              <SectionHeader title="Platform Breakdown" icon={Globe} />
              <div className="space-y-4">
                <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <Cpu size={24} className="text-green-600 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[#010400]">ChatGPT</h4>
                      <span className={`text-2xl font-bold ${getScoreColorFull(auditResults.chatgptScore)}`} data-testid="full-report-chatgpt-score">
                        {auditResults.chatgptScore}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Visibility across ChatGPT responses</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <Globe size={24} className="text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[#010400]">Google AI</h4>
                      <span className={`text-2xl font-bold ${getScoreColorFull(auditResults.googleAIScore)}`} data-testid="full-report-google-score">
                        {auditResults.googleAIScore}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Visibility across Google AI Overviews</p>
                  </div>
                </div>

                {/* Competitors */}
                {auditResults.competitors && auditResults.competitors.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Top Competitors Cited</p>
                    <div className="space-y-2">
                      {auditResults.competitors.slice(0, 3).map((competitor, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg" data-testid={`full-competitor-${idx}`}>
                          <span className="font-medium text-[#010400]">{competitor.name}</span>
                          <span className="text-xs text-gray-500">{competitor.mentions} mentions</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 5. 90-Day Roadmap */}
          <section className="p-12 bg-[#010400] text-white">
            <div className="flex items-center gap-3 border-b border-gray-800 pb-4 mb-8">
              <div className="p-2 bg-[#5599f9] rounded-lg text-white">
                <MapPin size={24} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Proposed 90-Day Remediation Plan</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#5599f9] font-bold uppercase tracking-widest text-xs">
                  <Calendar size={14} /> Month 1
                </div>
                <h3 className="text-xl font-bold">Foundation & Fixes</h3>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#5599f9] shrink-0" /> Install llms.txt & Schema</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#5599f9] shrink-0" /> Fix Citation Gaps (Directories)</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#5599f9] shrink-0" /> Publish 2 Comparison Articles</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#5599f9] shrink-0" /> Optimize 5 Service FAQs</li>
                </ul>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#ffb41c] font-bold uppercase tracking-widest text-xs">
                  <Calendar size={14} /> Month 2
                </div>
                <h3 className="text-xl font-bold">Scale Content</h3>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#ffb41c] shrink-0" /> 2 Additional 'Best Of' Lists</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#ffb41c] shrink-0" /> Press Release Distribution</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#ffb41c] shrink-0" /> Expand FAQ Coverage</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-[#ffb41c] shrink-0" /> Mid-Campaign Visibility Check</li>
                </ul>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white font-bold uppercase tracking-widest text-xs">
                  <Calendar size={14} /> Month 3
                </div>
                <h3 className="text-xl font-bold">Measure & Dominate</h3>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li className="flex gap-2"><CheckCircle size={16} className="text-white shrink-0" /> Final 2 Comparison Assets</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-white shrink-0" /> Content Freshness Updates</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-white shrink-0" /> Final Scorecard Analysis</li>
                  <li className="flex gap-2"><CheckCircle size={16} className="text-white shrink-0" /> Phase 2 Strategy Roadmap</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 6. Footer / CTA */}
          <footer className="p-12 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-8 no-print">
            <div>
              <h3 className="font-bold text-xl mb-2">Ready to fix this?</h3>
              <p className="text-gray-500 max-w-sm">
                We can implement this entire roadmap for a flat fee. Schedule a strategy call to discuss the details.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="mailto:contact@rossmanmedia.com"
                className="flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-[#010400] text-[#010400] font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Mail size={18} /> Email Strategy Team
              </a>
              <a 
                href="mailto:contact@rossmanmedia.com"
                className="flex items-center justify-center gap-2 px-8 py-4 bg-[#5599f9] text-white font-bold rounded-xl hover:bg-[#4a8ce8] transition-colors shadow-lg shadow-blue-500/20"
                data-testid="button-contact-us"
              >
                Book Consultation <ArrowRight size={18} />
              </a>
            </div>
          </footer>

        </div>
        
        <div className="text-center mt-12 text-gray-400 text-sm no-print">
          <p>&copy; {new Date().getFullYear()} Rossman Media. All Rights Reserved.</p>
        </div>
      </div>
    );
  }

  // --- View: Results ---
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-[#ffb41c]";
    return "text-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return "Strong";
    if (score >= 40) return "Moderate";
    return "Critical";
  };

  return (
    <div className="min-h-screen bg-white text-[#010400] pb-20 font-sans relative">
      {showLeadForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010400]/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setShowLeadForm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors z-10"
              data-testid="button-close-modal"
            >
              <X size={24} />
            </button>

            <div className="bg-[#5599f9] p-8 text-center">
              <FileText className="text-white mx-auto mb-4" size={48} />
              <h2 className="text-2xl font-bold text-white tracking-tight">Unlock Your 90-Day Roadmap</h2>
              <p className="text-blue-100 mt-2">
                See exactly how to fix your technical errors and turn this score from {auditResults?.overallScore || 0} to 80+.
              </p>
            </div>

            <div className="p-8 space-y-6">
              <form className="space-y-4" onSubmit={handleLeadSubmit}>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none"
                      placeholder="John Doe"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      data-testid="input-lead-name"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Work Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="email"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none"
                      placeholder="john@company.com"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      data-testid="input-lead-email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="tel"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5599f9] focus:ring-1 focus:ring-[#5599f9] outline-none"
                      placeholder="(555) 123-4567"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      data-testid="input-lead-phone"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={leadMutation.isPending}
                  className="w-full bg-[#5599f9] hover:bg-[#4a8ce8] text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                  data-testid="button-submit-lead"
                >
                  {leadMutation.isPending ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>Get My Full Report <ArrowRight size={20} /></>
                  )}
                </button>
              </form>

              <div className="text-center">
                <p className="text-xs text-gray-400">
                  Your detailed report will be emailed to you immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center gap-4">
          <Branding />
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Target</span>
              <span className="text-sm font-bold">
                {auditResults?.keyword}{" "}
                <span className="text-gray-400 font-normal">
                  ({auditResults?.scope === "local" ? auditResults?.city : "National"})
                </span>
              </span>
            </div>
            <button
              onClick={() => setStep("input")}
              className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-[#5599f9] border border-gray-200 hover:border-[#5599f9] px-4 py-2 transition-all rounded-md"
              data-testid="button-new-audit"
            >
              New Audit
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {/* Score Hero */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center border-b border-gray-100 pb-12">
          <div className="md:col-span-7 space-y-6">
            <span className="px-3 py-1 text-xs uppercase tracking-wider font-bold rounded-md bg-[#ffb41c] text-[#010400] border border-[#ffb41c]">
              Audit Complete
            </span>
            <h1 className="text-4xl md:text-6xl font-bold text-[#010400] tracking-tighter leading-none">
              Your AI Visibility is{" "}
              <span className="underline decoration-4 decoration-[#ffb41c] underline-offset-4">
                {getScoreLabel(auditResults?.overallScore || 0)}
              </span>
              .
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed font-light">
              We simulated 20 user intent scenarios for{" "}
              <span className="font-medium text-[#010400]">"{auditResults?.keyword}"</span>
              {auditResults?.scope === "local" && ` in ${auditResults?.city}`}. While you may rank on Google, AI models
              are recommending your competitors.
            </p>
          </div>
          <div className="md:col-span-5 flex justify-center md:justify-end">
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full border-[12px] border-gray-50 flex items-center justify-center relative">
              <div className="text-center">
                <span className={`block text-6xl md:text-7xl font-bold tracking-tighter ${getScoreColor(auditResults?.overallScore || 0)}`} data-testid="text-overall-score">
                  {auditResults?.overallScore || 0}
                </span>
                <span className="block text-sm font-bold uppercase tracking-widest text-gray-400 mt-1">Score / 100</span>
              </div>
              <div className="absolute top-0 right-0 bg-[#ffb41c] text-[#010400] p-3 rounded-full border-4 border-white shadow-lg">
                <AlertTriangle size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Platform Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Cpu className="text-green-600" size={20} />
              </div>
              <span className="font-bold text-[#010400]">ChatGPT</span>
            </div>
            <div className={`text-4xl font-bold ${getScoreColor(auditResults?.chatgptScore || 0)}`} data-testid="text-chatgpt-score">
              {auditResults?.chatgptScore || 0}%
            </div>
            <p className="text-sm text-gray-500 mt-1">Visibility Score</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Globe className="text-blue-600" size={20} />
              </div>
              <span className="font-bold text-[#010400]">Google AI Overviews</span>
            </div>
            <div className={`text-4xl font-bold ${getScoreColor(auditResults?.googleAIScore || 0)}`} data-testid="text-google-ai-score">
              {auditResults?.googleAIScore || 0}%
            </div>
            <p className="text-sm text-gray-500 mt-1">Visibility Score</p>
          </div>
        </div>

        {/* Sentiment Analysis Section */}
        {auditResults?.sentimentAnalysis && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h3 className="text-xl font-bold text-[#010400] tracking-tight flex items-center gap-3">
                <BarChart2 size={24} className="text-[#ffb41c]" />
                Brand Sentiment Analysis
              </h3>
              <span className={`text-xs font-bold px-3 py-1 rounded ${
                auditResults.sentimentAnalysis.overall === "positive" 
                  ? "bg-green-100 text-green-700" 
                  : auditResults.sentimentAnalysis.overall === "negative"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`} data-testid="sentiment-overall">
                {auditResults.sentimentAnalysis.overall.toUpperCase()} SENTIMENT
              </span>
            </div>
            
            <p className="text-gray-500">
              We asked AI assistants directly about <span className="font-medium text-[#010400]">{auditResults.businessName}</span> to understand how they perceive your brand.
            </p>

            {/* Sentiment Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
                <div className="text-2xl font-bold text-green-600" data-testid="sentiment-positive-count">
                  {auditResults.sentimentAnalysis.positiveCount}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-green-600">Positive</div>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-2xl font-bold text-gray-600" data-testid="sentiment-neutral-count">
                  {auditResults.sentimentAnalysis.neutralCount}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Neutral</div>
              </div>
              <div className="bg-red-50 rounded-xl border border-red-100 p-4 text-center">
                <div className="text-2xl font-bold text-red-600" data-testid="sentiment-negative-count">
                  {auditResults.sentimentAnalysis.negativeCount}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-red-600">Negative</div>
              </div>
            </div>

            {/* Sentiment Prompts - Table Layout */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-gray-50 border-b border-gray-200">
                <div className="md:col-span-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Brand Query</span>
                </div>
                <div className="md:col-span-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">ChatGPT</span>
                </div>
                <div className="md:col-span-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Google AI</span>
                </div>
              </div>
              
              {/* Table Rows */}
              {auditResults.sentimentAnalysis.results.map((result, index) => (
                <div 
                  key={index} 
                  className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5 border-b border-gray-100 last:border-0 items-center"
                  data-testid={`sentiment-result-${index}`}
                >
                  <div className="md:col-span-6">
                    <p className="font-medium text-[#010400] text-base">"{result.prompt}"</p>
                  </div>
                  <div className="md:col-span-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded ${
                      result.chatgpt.sentiment === "positive" ? "bg-green-100 text-green-700" :
                      result.chatgpt.sentiment === "negative" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {result.chatgpt.sentiment === "positive" && <ThumbsUp size={14} />}
                      {result.chatgpt.sentiment === "negative" && <ThumbsDown size={14} />}
                      {result.chatgpt.sentiment === "neutral" && <Minus size={14} />}
                      {result.chatgpt.sentiment.charAt(0).toUpperCase() + result.chatgpt.sentiment.slice(1)}
                    </span>
                  </div>
                  <div className="md:col-span-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded ${
                      result.googleAI.sentiment === "positive" ? "bg-green-100 text-green-700" :
                      result.googleAI.sentiment === "negative" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {result.googleAI.sentiment === "positive" && <ThumbsUp size={14} />}
                      {result.googleAI.sentiment === "negative" && <ThumbsDown size={14} />}
                      {result.googleAI.sentiment === "neutral" && <Minus size={14} />}
                      {result.googleAI.sentiment.charAt(0).toUpperCase() + result.googleAI.sentiment.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prompt Log - Two Column Layout */}
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-xl font-bold text-[#010400] tracking-tight flex items-center gap-3">
              <Cpu size={24} className="text-[#5599f9]" />
              Live Prompt Simulation Log
            </h3>
            <span className="text-xs font-bold bg-[#010400] px-3 py-1 rounded text-white">
              {auditResults?.promptResults?.length || 0} PROMPTS TESTED
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - First 5 Prompts */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {auditResults?.promptResults?.slice(0, 5).map((result, index) => (
                <PromptResultRow key={index} result={result} index={index} />
              ))}
            </div>

            {/* Right Column - Stats */}
            <div className="space-y-4">
              {/* Conversion Loss Card */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Est. Conversion Loss</div>
                <div className="text-5xl font-bold text-[#5599f9] tracking-tight">23X</div>
                <p className="text-sm text-gray-500 mt-2">AI traffic converts 23x higher than standard search.</p>
              </div>

              {/* Top Competitors Found */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Top Competitors Found</div>
                <div className="space-y-3">
                  {(auditResults?.competitors || []).slice(0, 3).map((competitor, index) => (
                    <div key={index} className="flex items-center gap-3" data-testid={`competitor-${index}`}>
                      <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span className="font-medium text-[#010400]">{competitor.name}</span>
                    </div>
                  ))}
                  {(!auditResults?.competitors || auditResults.competitors.length === 0) && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">A</div>
                        <span className="font-medium text-gray-400">Competitor A</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">B</div>
                        <span className="font-medium text-gray-400">Competitor B</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">C</div>
                        <span className="font-medium text-gray-400">Competitor C</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer text */}
          <p className="text-center text-sm text-gray-400 italic">
            + {Math.max((auditResults?.promptResults?.length || 20) - 5, 15)} other prompt variations analyzed in full report.
          </p>
        </div>

        {/* CTA - Gray Design */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 md:p-12 text-center">
          <h3 className="text-2xl md:text-3xl font-bold text-[#010400] tracking-tight mb-4">
            Turn this score from{" "}
            <span className="inline-block bg-[#010400] text-white px-3 py-1 rounded-lg mx-1">
              {auditResults?.overallScore || 0}
            </span>
            {" "}to{" "}
            <span className="inline-block bg-[#5599f9] text-white px-3 py-1 rounded-lg mx-1">
              80+
            </span>
          </h3>
          <p className="text-gray-500 mb-8 max-w-xl mx-auto">
            We have generated a 90-day roadmap to fix your technical errors and build the content AI is looking for.
          </p>
          <button
            onClick={() => setShowLeadForm(true)}
            className="bg-[#5599f9] hover:bg-[#4a8ce8] text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all inline-flex items-center gap-2"
            data-testid="button-get-report"
          >
            <Download size={20} /> DOWNLOAD FULL REPORT
          </button>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs font-medium text-gray-400 uppercase tracking-wider flex-wrap">
            <span className="flex items-center gap-2">
              <Lock size={14} /> Secure 256-bit Encryption
            </span>
            <span>No Credit Card Required</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 pt-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-400 tracking-wide">
            <div className="flex h-5 w-5 relative overflow-hidden rounded bg-[#5599f9]">
              <div className="absolute top-0 right-0 w-2.5 h-5 bg-[#ffb41c] skew-x-12 transform translate-x-0.5"></div>
            </div>
            ROSSMAN MEDIA
          </div>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            *This audit is a simulation based on public LLM behavior patterns and typical industry prompts.
          </p>
        </div>
      </main>
    </div>
  );
}
