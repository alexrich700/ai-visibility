import { useState, useEffect } from "react";
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
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
} from "lucide-react";
import type { AuditRequest, AuditResults, PromptResult, SentimentResult } from "@shared/schema";
import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";
import logoIcon from "@assets/images_1765741951084.png";

type Step = "input" | "scanning" | "results";

interface ScanProgress {
  progress: number;
  status: string;
  subtext: string;
}

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [isReportUnlocked, setIsReportUnlocked] = useState(false);

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
  
  // Expanded rows state for viewing full AI responses (keyed by "idx-platform")
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isPrinting, setIsPrinting] = useState(false);
  const [promptLogTab, setPromptLogTab] = useState<"chatgpt" | "google">("chatgpt");

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  
  const toggleRowExpansion = (key: string) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  const renderMarkdown = (text: string): JSX.Element => {
    if (!text) return <span className="text-gray-400 italic">No response captured.</span>;
    
    const lines = text.split(/\n+/).filter(line => line.trim());
    
    return (
      <div className="space-y-2">
        {lines.map((line, i) => {
          let content = line;
          
          if (content.startsWith('### ')) {
            const headerText = content.replace(/^### /, '').replace(/\*\*/g, '');
            return <h4 key={i} className="font-bold text-[#010400] text-base mt-3 first:mt-0">{headerText}</h4>;
          }
          
          if (content.startsWith('## ')) {
            const headerText = content.replace(/^## /, '').replace(/\*\*/g, '');
            return <h3 key={i} className="font-bold text-[#010400] text-lg mt-3 first:mt-0">{headerText}</h3>;
          }
          
          if (/^\d+\.\s/.test(content)) {
            const numberMatch = content.match(/^(\d+)\.\s/);
            const number = numberMatch ? numberMatch[1] : '';
            content = content.replace(/^\d+\.\s/, '');
            
            const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
            
            return (
              <div key={i} className="flex gap-2 ml-2">
                <span className="font-bold text-[#5599f9] shrink-0">{number}.</span>
                <p className="text-gray-700">
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold text-[#010400]">{part.slice(2, -2)}</strong>;
                    }
                    const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                    if (linkMatch) {
                      return <a key={j} href={linkMatch[2]} className="text-[#5599f9] underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
                    }
                    return <span key={j}>{part}</span>;
                  })}
                </p>
              </div>
            );
          }
          
          if (content.startsWith('- ')) {
            content = content.replace(/^- /, '');
            const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
            
            return (
              <div key={i} className="flex gap-2 ml-2">
                <span className="text-[#5599f9] shrink-0">-</span>
                <p className="text-gray-700">
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold text-[#010400]">{part.slice(2, -2)}</strong>;
                    }
                    const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                    if (linkMatch) {
                      return <a key={j} href={linkMatch[2]} className="text-[#5599f9] underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
                    }
                    return <span key={j}>{part}</span>;
                  })}
                </p>
              </div>
            );
          }
          
          const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
          
          return (
            <p key={i} className="text-gray-700">
              {parts.map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={j} className="font-semibold text-[#010400]">{part.slice(2, -2)}</strong>;
                }
                const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                if (linkMatch) {
                  return <a key={j} href={linkMatch[2]} className="text-[#5599f9] underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
                }
                return <span key={j}>{part}</span>;
              })}
            </p>
          );
        })}
      </div>
    );
  };
  
  const getResponsePreview = (text: string): string => {
    if (!text) return "No response captured.";
    const cleaned = text.replace(/\*\*/g, '').replace(/###?\s/g, '').replace(/\n+/g, ' ').trim();
    return cleaned.length > 150 ? cleaned.substring(0, 150) + "..." : cleaned;
  };

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
    mutationFn: async (data: { name: string; email: string; phone: string; businessName: string; auditScore: number; auditId?: number }) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return await response.json();
    },
    onSuccess: () => {
      setShowLeadForm(false);
      setIsReportUnlocked(true);
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
      auditId: auditResults?.auditId,
    });
  };

  const Branding = () => (
    <div className="flex items-center gap-3">
      <img src={logoIcon} alt="Rossman Media" className="h-8 w-8 rounded-md" />
      <img src={logoFull} alt="ROSSMAN MEDIA" className="h-6" />
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


  // --- View: Results ---
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-green-600";
    if (score >= 40) return "text-[#ffb41c]";
    return "text-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Strong";
    if (score >= 40) return "Moderate";
    return "Critical";
  };

  const getScoreDescription = (score: number) => {
    if (score >= 80) {
      return "AI assistants are actively recommending your business. Your brand has excellent visibility across major AI platforms.";
    }
    if (score >= 60) {
      return "Your business is appearing in AI recommendations. There's room to strengthen your visibility and capture more AI-driven leads.";
    }
    if (score >= 40) {
      return "AI visibility shows mixed results. Some AI platforms mention your business, but competitors are often recommended instead.";
    }
    return "While you may rank on Google, AI models are recommending your competitors instead of your business.";
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return { icon: Star, bgColor: "bg-green-500", textColor: "text-white" };
    if (score >= 60) return { icon: CheckCircle, bgColor: "bg-green-500", textColor: "text-white" };
    if (score >= 40) return { icon: TrendingUp, bgColor: "bg-[#ffb41c]", textColor: "text-[#010400]" };
    return { icon: AlertTriangle, bgColor: "bg-red-500", textColor: "text-white" };
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
                    <>Unlock Full Insights <ArrowRight size={20} /></>
                  )}
                </button>
              </form>

              <div className="text-center">
                <p className="text-xs text-gray-400">
                  Your complete visibility analysis will be revealed instantly.
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
              {auditResults?.scope === "local" && ` in ${auditResults?.city}`}.{" "}
              {getScoreDescription(auditResults?.overallScore || 0)}
            </p>
            {/* Business Impact Statement */}
            {(auditResults?.overallScore || 0) < 70 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4" data-testid="business-impact">
                <p className="text-red-700 font-medium">
                  This means you're invisible in {100 - (auditResults?.overallScore || 0)}% of AI recommendations.
                  {auditResults?.competitors && auditResults.competitors.length > 0 && (
                    <> When customers ask ChatGPT or Google AI for a {auditResults?.keyword}{auditResults?.scope === "local" ? ` in ${auditResults?.city}` : ""}, <span className="font-bold">{auditResults.competitors[0].name}</span> shows up. You don't.</>
                  )}
                  {(!auditResults?.competitors || auditResults.competitors.length === 0) && (
                    <> When customers ask ChatGPT or Google AI for a recommendation, your competitors show up. You don't.</>
                  )}
                </p>
              </div>
            )}
          </div>
          <div className="md:col-span-5 flex justify-center md:justify-end">
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full border-[12px] border-gray-50 flex items-center justify-center relative">
              <div className="text-center">
                <span className={`block text-6xl md:text-7xl font-bold tracking-tighter ${getScoreColor(auditResults?.overallScore || 0)}`} data-testid="text-overall-score">
                  {auditResults?.overallScore || 0}
                </span>
                <span className="block text-sm font-bold uppercase tracking-widest text-gray-400 mt-1">Score / 100</span>
              </div>
              {(() => {
                const scoreIconData = getScoreIcon(auditResults?.overallScore || 0);
                const IconComponent = scoreIconData.icon;
                return (
                  <div className={`absolute top-0 right-0 ${scoreIconData.bgColor} ${scoreIconData.textColor} p-3 rounded-full border-4 border-white shadow-lg`}>
                    <IconComponent size={24} />
                  </div>
                );
              })()}
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

        {/* Blurred Section Container - Unlock to view full report */}
        <div className="relative">
          {/* Content - blurred when not unlocked */}
          <div className={`space-y-12 ${!isReportUnlocked ? 'blur-sm select-none pointer-events-none' : ''}`}>
            {/* Visibility Score Explanation */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5" data-testid="visibility-explanation">
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className="w-10 h-10 bg-[#5599f9] rounded-lg flex items-center justify-center">
                    <Search className="text-white" size={20} />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-[#010400] mb-1">What does this score mean?</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Your visibility score measures how often AI assistants <span className="font-medium">organically recommend</span> your brand when users ask generic questions like "best {auditResults?.keyword} in {auditResults?.scope === "local" ? auditResults?.city : "the country"}." 
                    A low score means AI doesn't naturally suggest your business—even if it knows about you. This is different from sentiment, which measures what AI says <span className="font-medium">when asked directly about your brand</span>.
                  </p>
                </div>
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

          <p className="text-gray-500 text-sm" data-testid="prompt-log-explanation">
            These prompts simulate what real users might ask AI assistants. Your brand must be recommended <span className="font-medium text-[#010400]">without being mentioned in the question</span>—this tests true AI visibility.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - All Prompts with Platform Toggle */}
            <div className="lg:col-span-2 space-y-4">
              {/* Platform Toggle Buttons */}
              <div className="flex gap-2" data-testid="prompt-platform-toggle">
                <button
                  onClick={() => setPromptLogTab("chatgpt")}
                  className={`flex-1 py-3 px-4 text-sm font-bold tracking-wide rounded-lg transition-all flex items-center justify-center gap-2 ${
                    promptLogTab === "chatgpt"
                      ? "bg-[#5599f9] text-white shadow-md"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  data-testid="button-toggle-chatgpt"
                >
                  ChatGPT Responses
                </button>
                <button
                  onClick={() => setPromptLogTab("google")}
                  className={`flex-1 py-3 px-4 text-sm font-bold tracking-wide rounded-lg transition-all flex items-center justify-center gap-2 ${
                    promptLogTab === "google"
                      ? "bg-[#5599f9] text-white shadow-md"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  data-testid="button-toggle-google"
                >
                  Google AI Responses
                </button>
              </div>

              {/* All Prompts List */}
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {auditResults?.promptResults?.map((result, index) => {
                  const platformData = promptLogTab === "chatgpt" ? result.chatgpt : result.googleAI;
                  const isFound = platformData.found;
                  const rowKey = `${index}`;
                  const isExpanded = expandedRows[rowKey];
                  
                  return (
                    <div key={index} data-testid={`prompt-result-${index}`}>
                      <div 
                        className="flex items-start gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleRowExpansion(rowKey)}
                        data-testid={`prompt-row-${index}`}
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
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs text-gray-400 uppercase tracking-wider mb-1">Prompt #{index + 1}</div>
                          <p className="font-medium text-[#010400] text-base">"{result.prompt}"</p>
                          <p className={`text-sm mt-1 ${isFound ? 'text-green-600' : 'text-red-500 font-medium'}`}>
                            {isFound 
                              ? `Your brand was cited by ${promptLogTab === "chatgpt" ? "ChatGPT" : "Google AI"}.`
                              : `Not found. ${platformData.competitors?.length ? `${platformData.competitors.slice(0, 2).join(", ")} cited instead.` : "Competitors were recommended."}`
                            }
                          </p>
                        </div>
                        <div className="mt-1 shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="text-gray-400" size={20} />
                          ) : (
                            <ChevronDown className="text-gray-400" size={20} />
                          )}
                        </div>
                      </div>
                      
                      {/* Expanded Response */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 ml-9 mr-4 bg-gray-50 rounded-lg mb-4 mx-4">
                          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 pt-4">
                            {promptLogTab === "chatgpt" ? "ChatGPT" : "Google AI"} Response
                          </div>
                          <div className="text-sm text-gray-700 leading-relaxed">
                            {renderMarkdown(platformData.response || "")}
                          </div>
                          {platformData.competitors && platformData.competitors.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-gray-200">
                              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Competitors Mentioned</div>
                              <div className="flex flex-wrap gap-2">
                                {platformData.competitors.map((comp, i) => (
                                  <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium">
                                    {comp}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

              {/* Platform Stats Summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
                  {promptLogTab === "chatgpt" ? "ChatGPT" : "Google AI"} Summary
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Found</span>
                    <span className="font-bold text-green-600">
                      {auditResults?.promptResults?.filter(r => 
                        promptLogTab === "chatgpt" ? r.chatgpt.found : r.googleAI.found
                      ).length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Not Found</span>
                    <span className="font-bold text-red-500">
                      {auditResults?.promptResults?.filter(r => 
                        promptLogTab === "chatgpt" ? !r.chatgpt.found : !r.googleAI.found
                      ).length || 0}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Visibility Rate</span>
                      <span className="font-bold text-[#5599f9]">
                        {Math.round(((auditResults?.promptResults?.filter(r => 
                          promptLogTab === "chatgpt" ? r.chatgpt.found : r.googleAI.found
                        ).length || 0) / (auditResults?.promptResults?.length || 1)) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Unlock Overlay - positioned on top of blurred content */}
          {!isReportUnlocked && (
            <>
              {/* Semi-transparent blur overlay covering content */}
              <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[3px] rounded-xl pointer-events-none" />
              {/* Centered unlock box */}
              <div className="absolute inset-0 z-20 flex items-start justify-center pt-24 pointer-events-none">
                <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-md text-center border border-gray-200 pointer-events-auto mx-4">
                  <div className="w-16 h-16 bg-[#5599f9] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock className="text-white" size={28} />
                  </div>
                  <h3 className="text-2xl font-bold text-[#010400] tracking-tight mb-2">
                    Unlock Full Report
                  </h3>
                  <p className="text-gray-500 mb-6">
                    Get complete visibility insights including sentiment analysis, full prompt breakdown, and competitor details.
                  </p>
                  <button
                    onClick={() => setShowLeadForm(true)}
                    className="w-full bg-[#5599f9] hover:bg-[#4a8ce8] text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                    data-testid="button-unlock-report"
                  >
                    <Lock size={18} /> Unlock Now - Free
                  </button>
                  <p className="text-xs text-gray-400 mt-4">
                    Just enter your contact info to access the full report.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* CTA - Gray Design */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 md:p-12 text-center">
          <h3 className="text-2xl md:text-3xl font-bold text-[#010400] tracking-tight mb-4">
            Ready to start showing up?
          </h3>
          <p className="text-gray-500 mb-6 max-w-xl mx-auto">
            Book a 15-minute call. We'll walk through your report, answer questions, and show you exactly what it would take to start showing up.
          </p>
          <p className="text-sm text-gray-600 font-medium mb-8">
            No pitch. Just clarity.
          </p>
          <a
            href="https://calendly.com/rossmanmedia"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#5599f9] hover:bg-[#4a8ce8] text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all inline-flex items-center gap-2"
            data-testid="button-book-call"
          >
            <Calendar size={20} /> Book 15-Min Call
          </a>
          <div className="mt-8 p-4 bg-white/60 rounded-xl border border-gray-200 max-w-md mx-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">What happens next?</p>
            <p className="text-sm text-gray-600">
              We'll review your audit results together, identify your biggest opportunities, and outline a clear path forward. No pressure, no commitment.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 pt-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <img src={logoIcon} alt="Rossman Media" className="h-5 w-5 rounded" />
            <img src={logoFull} alt="ROSSMAN MEDIA" className="h-4 opacity-50" />
          </div>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            *This audit is a simulation based on public LLM behavior patterns and typical industry prompts.
          </p>
        </div>
      </main>
    </div>
  );
}
