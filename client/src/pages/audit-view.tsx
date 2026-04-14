import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building2,
  Globe,
  Cpu,
  CheckCircle,
  AlertTriangle,
  X,
  BarChart2,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Zap,
  Printer,
  Download,
  ChevronDown,
  ChevronUp,
  Lock,
  User,
  Mail,
  Phone,
  ArrowRight,
  Loader2,
  FileText,
  Share2,
  Copy,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import type { AuditResults, SentimentResult } from "@shared/schema";

import logoIcon from "@assets/BBM-Primary-Logo-300x69_1775234014796.png";

interface NegativeSignal {
  platform: "ChatGPT" | "Google AI";
  text: string;
}

function NegativeFeedbackDetails({ results }: { results: SentimentResult[] }) {
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  // Build a flat list of individual negative signals (one per platform)
  const negativeSignals: NegativeSignal[] = [];
  
  for (const result of results) {
    if (result.chatgpt?.sentiment === "negative" && result.chatgpt.response) {
      negativeSignals.push({
        platform: "ChatGPT",
        text: result.chatgpt.response
      });
    }
    if (result.googleAI?.sentiment === "negative" && result.googleAI.response) {
      negativeSignals.push({
        platform: "Google AI",
        text: result.googleAI.response
      });
    }
  }

  // Limit to 5 signals max
  const displaySignals = negativeSignals.slice(0, 5);

  if (displaySignals.length === 0) return null;

  const toggleExpand = (idx: number) => {
    setExpandedCards(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Clean text: remove URLs and markdown, preserve structure
  const cleanText = (text: string) => {
    let cleaned = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
      .replace(/\(https?:\/\/[^)]+\)/g, '') // (https://...) -> remove
      .replace(/https?:\/\/[^\s\])]+/g, '') // plain URLs -> remove
      .replace(/\*\*/g, '') // bold markdown
      .replace(/\*([^*]+)\*/g, '$1') // italic markdown
      .replace(/###?\s?/g, '') // headers
      .replace(/[ \t]+/g, ' ') // multiple spaces to single
      .replace(/\n{3,}/g, '\n\n') // limit to max 2 newlines
      .trim();
      
    return cleaned;
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-bold uppercase tracking-wider text-red-600 mb-3">Negative Feedback Details</p>
      <div className="space-y-3">
        {displaySignals.map((signal, idx) => {
          const fullText = cleanText(signal.text);
          const isLongText = fullText.length > 300;
          const isExpanded = expandedCards[idx] || false;
          const displayText = isExpanded || !isLongText ? fullText : fullText.substring(0, 300) + "...";
          
          return (
            <div key={idx} className="p-4 bg-red-50 rounded-lg border border-red-100" data-testid={`negative-signal-${idx}`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">{signal.platform} Response</span>
              </div>
              <blockquote className={`text-sm text-gray-700 leading-relaxed whitespace-pre-line border-l-2 border-red-200 pl-3 italic ${isLongText ? 'print:hidden' : ''}`}>
                "{displayText}"
              </blockquote>
              {isLongText && (
                <>
                  <button 
                    onClick={() => toggleExpand(idx)}
                    className="text-xs text-red-600 hover:text-red-700 font-medium mt-3 flex items-center gap-1 print:hidden"
                    data-testid={`negative-signal-toggle-${idx}`}
                  >
                    {isExpanded ? (
                      <>Show less <ChevronUp size={12} /></>
                    ) : (
                      <>Read more <ChevronDown size={12} /></>
                    )}
                  </button>
                  <blockquote className="hidden print:block text-sm text-gray-700 leading-relaxed whitespace-pre-line border-l-2 border-red-200 pl-3 italic">"{fullText}"</blockquote>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AuditData {
  id: number;
  businessName: string;
  url: string | null;
  keyword: string;
  scope: string;
  city: string | null;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  fullResults: string | null;
  createdAt: string;
  shareToken?: string | null;
}

interface AuditViewProps {
  isSharedView?: boolean;
  shareToken?: string;
}

export default function AuditView(props: AuditViewProps = {}) {
  const { isSharedView = false, shareToken } = props;
  const { id, token } = useParams();
  const { toast } = useToast();
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isPrinting, setIsPrinting] = useState(false);
  const [isShareCopied, setIsShareCopied] = useState(false);
  const [promptLogTab, setPromptLogTab] = useState<"chatgpt" | "google">("chatgpt");
  const [isReportUnlocked, setIsReportUnlocked] = useState(isSharedView);
  const [showLeadForm, setShowLeadForm] = useState(false);
  
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");

  const effectiveToken = shareToken || token;
  const isShared = isSharedView || !!effectiveToken;

  const { data: audit, isLoading, error } = useQuery<AuditData>({
    queryKey: isShared ? ["/api/audit/share", effectiveToken] : ["/api/audit", id],
    queryFn: async () => {
      const endpoint = isShared ? `/api/audit/share/${effectiveToken}` : `/api/audit/${id}`;
      const response = await apiRequest("GET", endpoint);
      return response.json();
    },
    enabled: isShared ? !!effectiveToken : !!id,
  });

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

  const shareMutation = useMutation({
    mutationFn: async (auditId: number) => {
      const response = await apiRequest("POST", `/api/audit/${auditId}/share`);
      return await response.json();
    },
    onSuccess: async (data: { shareToken: string }) => {
      const shareUrl = `${window.location.origin}/audit/share/${data.shareToken}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setIsShareCopied(true);
        toast({
          title: "Share link copied!",
          description: "Anyone with this link can view the audit without entering their information.",
        });
        setTimeout(() => setIsShareCopied(false), 3000);
      } catch (err) {
        toast({
          title: "Share link generated",
          description: shareUrl,
          variant: "default",
        });
      }
    },
    onError: () => {
      toast({
        title: "Failed to generate share link",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleShare = () => {
    if (audit?.id) {
      shareMutation.mutate(audit.id);
    }
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadEmail || !leadPhone || !audit) return;

    leadMutation.mutate({
      name: leadName,
      email: leadEmail,
      phone: leadPhone,
      businessName: audit.businessName,
      auditScore: audit.overallScore,
      auditId: audit.id,
    });
  };

  const toggleRowExpansion = (key: string) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Auto-expand all content when printing (handles browser Ctrl+P/Cmd+P)
  useEffect(() => {
    const handleBeforePrint = () => {
      setIsPrinting(true);
    };
    
    const handleAfterPrint = () => {
      setIsPrinting(false);
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

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
                <span className="font-bold text-[#ff5800] shrink-0">{number}.</span>
                <p className="text-gray-700">
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold text-[#010400]">{part.slice(2, -2)}</strong>;
                    }
                    const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                    if (linkMatch) {
                      return <a key={j} href={linkMatch[2]} className="text-[#ff5800] underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
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
                <span className="text-[#ff5800] shrink-0">-</span>
                <p className="text-gray-700">
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold text-[#010400]">{part.slice(2, -2)}</strong>;
                    }
                    const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                    if (linkMatch) {
                      return <a key={j} href={linkMatch[2]} className="text-[#ff5800] underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
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
                  return <a key={j} href={linkMatch[2]} className="text-[#ff5800] underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
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

  const handlePrintReport = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#ff5800] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading your audit results...</p>
        </div>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Audit Not Found</h1>
          <p className="text-gray-500 mb-6">The audit you're looking for doesn't exist or has been deleted.</p>
          <Link href="/">
            <Button className="bg-[#ff5800]" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Start New Audit
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  let auditResults: AuditResults | null = null;
  try {
    if (audit.fullResults) {
      auditResults = JSON.parse(audit.fullResults);
    }
  } catch (e) {
    console.error("Failed to parse audit results:", e);
  }

  if (!auditResults) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">No Detailed Results Available</h1>
          <p className="text-gray-500 mb-6">This audit doesn't have detailed results stored.</p>
          <Link href="/">
            <Button className="bg-[#ff5800]" data-testid="button-back-home-no-results">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Start New Audit
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentDate = format(new Date(audit.createdAt), "MMMM d, yyyy");

  const SectionHeader = ({ title, icon: Icon }: { title: string; icon: any }) => (
    <div className="flex items-center gap-3 border-b border-gray-200 pb-4 mb-6">
      <div className="p-2 bg-[#ff5800]/10 rounded-lg">
        <Icon className="text-[#ff5800]" size={24} />
      </div>
      <h2 className="text-2xl font-bold text-[#010400] tracking-tight">{title}</h2>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-10 font-sans text-[#010400] print:py-0 print:bg-white" id="full-report">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          td p { white-space: normal !important; }
          #full-report, #full-report * { overflow: visible !important; overflow-x: visible !important; overflow-y: visible !important; height: auto !important; max-height: none !important; min-height: 0 !important; }
          #full-report { display: block !important; }
          #full-report .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {showLeadForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#010400]/80 backdrop-blur-sm no-print">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setShowLeadForm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors z-10"
              data-testid="button-close-modal"
            >
              <X size={24} />
            </button>

            <div className="bg-[#ff5800] p-8 text-center">
              <FileText className="text-white mx-auto mb-4" size={48} />
              <h2 className="text-2xl font-bold text-white tracking-tight">Unlock Your Full Report</h2>
              <p className="text-orange-100 mt-2">
                See exactly how to fix your technical errors and turn this score from {audit.overallScore} to 80+.
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
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none"
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
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none"
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
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#ff5800] focus:ring-1 focus:ring-[#ff5800] outline-none"
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
                  className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                  data-testid="button-submit-lead"
                >
                  {leadMutation.isPending ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>Unlock Full Report <ArrowRight size={20} /></>
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

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#010400] text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-6 no-print">
        <span className="text-sm font-bold hidden md:inline">AI Visibility Report</span>
        <div className="flex items-center gap-3">
          {isReportUnlocked && (
            <>
              <button 
                onClick={handlePrintReport}
                className="flex items-center gap-2 hover:text-[#ff5800] transition-colors text-sm font-medium"
                data-testid="button-print-report"
              >
                <Printer size={16} /> Print
              </button>
              <div className="w-px h-4 bg-gray-700"></div>
              <button 
                onClick={handlePrintReport}
                className="flex items-center gap-2 hover:text-[#ff5800] transition-colors text-sm font-bold"
                data-testid="button-download-pdf"
              >
                <Download size={16} /> Download PDF
              </button>
              <div className="w-px h-4 bg-gray-700"></div>
              <button 
                onClick={handleShare}
                disabled={shareMutation.isPending}
                className="flex items-center gap-2 hover:text-[#ff5800] transition-colors text-sm font-medium disabled:opacity-50"
                data-testid="button-share-audit"
              >
                {shareMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isShareCopied ? (
                  <Check size={16} className="text-green-400" />
                ) : (
                  <Share2 size={16} />
                )}
                {isShareCopied ? "Copied!" : "Share"}
              </button>
              <div className="w-px h-4 bg-gray-700"></div>
            </>
          )}
          <Link href="/">
            <span className="flex items-center gap-2 hover:text-[#ff5800] transition-colors text-sm font-medium cursor-pointer" data-testid="link-new-audit">
              <ArrowLeft size={16} /> New Audit
            </span>
          </Link>
        </div>
      </div>

      {/* Main Report Container */}
      <div className="max-w-5xl mx-auto bg-white shadow-xl min-h-[1200px] overflow-x-hidden print:shadow-none">
        
        {/* 1. Header / Cover */}
        <header className="bg-[#010400] text-white p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#ff5800] rounded-full mix-blend-multiply opacity-20 transform translate-x-1/2 -translate-y-1/2 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#ffb41c] rounded-full mix-blend-multiply opacity-20 transform -translate-x-1/2 translate-y-1/2 blur-3xl"></div>

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <img src={logoIcon} alt="Building Brands Marketing" className="h-10 object-contain invert" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2" data-testid="full-report-title">AI Visibility Audit</h1>
                <p className="text-gray-400 text-lg">Comprehensive Analysis & Strategic Roadmap</p>
              </div>
            </div>
            
            <div className="text-right space-y-2">
              <p className="text-sm text-gray-400 font-mono">
                {auditResults.businessName} | {auditResults.keyword}
                {auditResults.scope === "local" && auditResults.city && ` | ${auditResults.city}`}
              </p>
              <p className="text-lg font-bold">{currentDate}</p>
            </div>
          </div>
        </header>

        {/* 2. Executive Summary - Always Visible */}
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

        {/* Content that requires unlock */}
        <div className="relative overflow-hidden">
          {/* Opaque overlay to completely hide content when locked */}
          {!isReportUnlocked && (
            <div className="absolute inset-0 z-30 bg-gradient-to-b from-white/70 via-white/90 to-white pointer-events-none" />
          )}
          
          {/* Unlock CTA Overlay */}
          {!isReportUnlocked && (
            <div className="absolute inset-0 z-40 flex items-start justify-center pt-32 no-print">
              <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md mx-4 text-center border border-gray-200">
                <div className="w-16 h-16 bg-[#ff5800] rounded-full flex items-center justify-center mx-auto mb-6">
                  <Lock className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-bold text-[#010400] mb-3">Unlock Your Full Report</h3>
                <p className="text-gray-600 mb-6">
                  Get complete access to your prompt simulation log, sentiment analysis, competitor insights, and actionable recommendations.
                </p>
                <button
                  onClick={() => setShowLeadForm(true)}
                  className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
                  data-testid="button-unlock-report"
                >
                  Unlock Full Report <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Blurred and hidden content when locked - using very strong blur + opacity */}
          <div className={!isReportUnlocked ? 'blur-[20px] select-none pointer-events-none opacity-30' : ''} style={!isReportUnlocked ? { filter: 'blur(20px) grayscale(100%)', WebkitUserSelect: 'none', userSelect: 'none' } : {}}>
            {/* 3. Simulated Prompt Log - Web View with Tabs (hidden when printing) */}
            <section className="p-12 border-b border-gray-200 bg-gray-50 no-print">
              <SectionHeader title="Simulated Prompt Log" icon={Cpu} />
              <p className="mb-4 text-gray-600">We simulated the following user queries to test brand presence across AI platforms.</p>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700">
                  <span className="font-bold text-[#ff5800]">How to read this:</span> These are generic questions users might ask AI—your brand name is <span className="font-medium">not included</span> in the prompt. 
                  If AI doesn't recommend you here, it means you're invisible to organic AI-assisted discovery, even if AI knows about your brand when asked directly.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Platform Tabs */}
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setPromptLogTab("chatgpt")}
                    className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                      promptLogTab === "chatgpt"
                        ? "bg-gray-50 text-[#010400] border-b-2 border-[#ff5800]"
                        : "bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                    data-testid="button-tab-chatgpt"
                  >
                    <Cpu size={16} className={promptLogTab === "chatgpt" ? "text-[#ff5800]" : ""} /> ChatGPT
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptLogTab("google")}
                    className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                      promptLogTab === "google"
                        ? "bg-gray-50 text-[#010400] border-b-2 border-[#ff5800]"
                        : "bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                    data-testid="button-tab-google"
                  >
                    <Globe size={16} className={promptLogTab === "google" ? "text-[#ff5800]" : ""} /> Google AI
                  </button>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                      <th className="p-4 w-16 text-center">Status</th>
                      <th className="p-4">Simulated User Query</th>
                      <th className="p-4 hidden md:table-cell">AI Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditResults.promptResults?.map((result, idx) => {
                      const platformData = promptLogTab === "chatgpt" ? result.chatgpt : result.googleAI;
                      const response = platformData.response || "";
                      const rowKey = `${idx}-${promptLogTab}`;
                      const isExpanded = expandedRows[rowKey] || isPrinting;
                      
                      return (
                        <tr key={rowKey} className="hover:bg-gray-50 transition-colors align-top" data-testid={`full-prompt-result-${idx}-${promptLogTab}`}>
                          <td className="p-4 text-center">
                            {platformData.found ? (
                              <CheckCircle className="text-green-500 mx-auto" size={20} />
                            ) : (
                              <div className="w-5 h-5 mx-auto rounded-full border-2 border-red-200 flex items-center justify-center">
                                <X className="w-3 h-3 text-red-500" />
                              </div>
                            )}
                          </td>
                          <td className="p-4 font-medium text-[#010400] text-sm">"{result.prompt}"</td>
                          <td className="p-4 text-sm hidden md:table-cell">
                            <div>
                              {isExpanded ? (
                                renderMarkdown(response)
                              ) : (
                                <p className="text-gray-600">{getResponsePreview(response)}</p>
                              )}
                              {response.length > 150 && (
                                <button
                                  onClick={() => toggleRowExpansion(rowKey)}
                                  className="text-xs font-medium text-[#ff5800] hover:text-[#e04f00] flex items-center gap-1 mt-2"
                                  data-testid={`button-expand-response-${idx}-${promptLogTab}`}
                                >
                                  {isExpanded ? (
                                    <>View Less <ChevronUp size={14} /></>
                                  ) : (
                                    <>View Full Response <ChevronDown size={14} /></>
                                  )}
                                </button>
                              )}
                            </div>
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

            {/* 3. Simulated Prompt Log - Print View (shows BOTH platforms with full responses) */}
            <section className="print-only p-8 border-b border-gray-200 bg-gray-50">
              <SectionHeader title="Simulated Prompt Log" icon={Cpu} />
              <p className="mb-4 text-gray-600 text-sm">We simulated the following user queries to test brand presence across AI platforms.</p>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-6">
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-[#ff5800]">How to read this:</span> These are generic questions users might ask AI—your brand name is not included in the prompt. 
                  If AI doesn't recommend you here, it means you're invisible to organic AI-assisted discovery.
                </p>
              </div>

              {/* Print layout: Each prompt gets its own card with both platform responses */}
              <div className="space-y-6">
                {auditResults.promptResults?.map((result, idx) => (
                  <div key={idx} className="bg-white rounded-lg border border-gray-200 overflow-hidden break-inside-avoid">
                    {/* Prompt Header */}
                    <div className="bg-gray-50 p-4 border-b border-gray-200">
                      <p className="font-bold text-[#010400] text-sm">Prompt {idx + 1}:</p>
                      <p className="text-gray-700 text-sm mt-1">"{result.prompt}"</p>
                    </div>
                    
                    {/* ChatGPT Response */}
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu size={14} className="text-[#ff5800]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">ChatGPT Response</span>
                        <span className="ml-auto">
                          {result.chatgpt.found ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle size={12} /> Found
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                              <X size={12} /> Not Found
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 pl-5">
                        {result.chatgpt.response ? renderMarkdown(result.chatgpt.response) : <span className="text-gray-400 italic">No response captured.</span>}
                      </div>
                    </div>
                    
                    {/* Google AI Response */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe size={14} className="text-[#ffb41c]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Google AI Response</span>
                        <span className="ml-auto">
                          {result.googleAI.found ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle size={12} /> Found
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                              <X size={12} /> Not Found
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 pl-5">
                        {result.googleAI.response ? renderMarkdown(result.googleAI.response) : <span className="text-gray-400 italic">No response captured.</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 text-center text-sm text-gray-500 font-medium">
                {auditResults.promptResults?.length || 20} prompts analyzed across ChatGPT and Google AI
              </div>
            </section>

            {/* 4. Brand Sentiment & Platform Breakdown */}
            <section className="grid grid-cols-1 md:grid-cols-2">
              {/* Sentiment */}
              <div className="p-12 border-b md:border-b-0 md:border-r border-gray-200">
                <SectionHeader title="Brand Sentiment" icon={BarChart2} />
                
                {auditResults.sentimentAnalysis ? (
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

                      {auditResults.sentimentAnalysis.negativeCount > 0 && auditResults.sentimentAnalysis.results && (
                        <NegativeFeedbackDetails results={auditResults.sentimentAnalysis.results} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-gray-50 rounded-xl border border-gray-100 text-center" data-testid="sentiment-not-available">
                    <Minus size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Sentiment analysis not available for this audit.</p>
                    <p className="text-gray-400 text-xs mt-1">Run a new audit to see brand sentiment data.</p>
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
                    <Globe size={24} className="text-orange-600 shrink-0" />
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
          </div>
        </div>

        {/* 5. Footer */}
        <footer className="p-12 bg-gray-50 border-t border-gray-200 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={logoIcon} alt="Building Brands Marketing" className="h-8 object-contain" />
          </div>
          <p className="text-gray-500 text-sm">
            Prepared by Building Brands Marketing | AI Visibility Audit Report
          </p>
          <p className="text-gray-400 text-xs mt-2">
            Audit ID: {audit.id} | Generated: {currentDate}
          </p>
        </footer>
      </div>
    </div>
  );
}
