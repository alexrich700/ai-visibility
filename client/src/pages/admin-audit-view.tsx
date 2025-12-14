import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
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
  MapPin,
  Zap,
  Printer,
  Download,
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import type { AuditResults, PromptResult } from "@shared/schema";
import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";
import logoIcon from "@assets/images_1765741951084.png";

interface AuditWithLead {
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
  lead?: {
    id: number;
    name: string;
    email: string;
    phone: string;
    status: string;
  };
}

export default function AdminAuditView() {
  const { id } = useParams();
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: audit, isLoading, error } = useQuery<AuditWithLead>({
    queryKey: ["/api/admin/audits", id],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/audits/${id}`);
      return response.json();
    },
    enabled: !!id,
  });

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
          <div className="w-8 h-8 border-4 border-[#5599f9] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading audit details...</p>
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
          <Link href="/admin">
            <Button className="bg-[#5599f9]" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Parse the fullResults JSON
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
          <Link href="/admin">
            <Button className="bg-[#5599f9]" data-testid="button-back-admin-no-results">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentDate = format(new Date(audit.createdAt), "MMMM d, yyyy");

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
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          td p { white-space: normal !important; }
        }
      `}</style>

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#010400] text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-6 no-print">
        <span className="text-sm font-bold hidden md:inline">Admin Audit View</span>
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
          <Link href="/admin">
            <span className="flex items-center gap-2 hover:text-[#5599f9] transition-colors text-sm font-medium cursor-pointer" data-testid="link-back-admin">
              <ArrowLeft size={16} /> Back to Admin
            </span>
          </Link>
        </div>
      </div>

      {/* Main Report Container */}
      <div className="max-w-5xl mx-auto bg-white shadow-xl min-h-[1200px] overflow-hidden print:shadow-none">
        
        {/* 1. Header / Cover */}
        <header className="bg-[#010400] text-white p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#5599f9] rounded-full mix-blend-multiply opacity-20 transform translate-x-1/2 -translate-y-1/2 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#ffb41c] rounded-full mix-blend-multiply opacity-20 transform -translate-x-1/2 translate-y-1/2 blur-3xl"></div>

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <img src={logoIcon} alt="Rossman Media" className="h-10 w-10 rounded-md" />
                <img src={logoFull} alt="ROSSMAN MEDIA" className="h-8 invert" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2" data-testid="full-report-title">AI Visibility Audit</h1>
                <p className="text-gray-400 text-lg">Comprehensive Analysis & Strategic Roadmap</p>
              </div>
            </div>
            
            <div className="text-right space-y-2">
              <div className="inline-block bg-[#5599f9] text-white text-xs font-bold px-3 py-1 rounded uppercase tracking-wider mb-2">
                Admin View
              </div>
              <p className="text-sm text-gray-400 font-mono">
                {auditResults.businessName} | {auditResults.keyword}
                {auditResults.scope === "local" && auditResults.city && ` | ${auditResults.city}`}
              </p>
              <p className="text-lg font-bold">{currentDate}</p>
            </div>
          </div>
        </header>

        {/* Lead Info Banner (if available) */}
        {audit.lead && (
          <div className="bg-green-50 border-b border-green-100 p-6 no-print">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-600" />
                <span className="font-bold text-green-800">Lead Contact:</span>
              </div>
              <span className="text-gray-800">{audit.lead.name}</span>
              <span className="text-gray-500">|</span>
              <a href={`mailto:${audit.lead.email}`} className="text-[#5599f9] hover:underline">{audit.lead.email}</a>
              <span className="text-gray-500">|</span>
              <a href={`tel:${audit.lead.phone}`} className="text-[#5599f9] hover:underline">{audit.lead.phone}</a>
            </div>
          </div>
        )}

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

        {/* 3. Simulated Prompt Log */}
        <section className="p-12 border-b border-gray-200 bg-gray-50">
          <SectionHeader title="Simulated Prompt Log" icon={Cpu} />
          <p className="mb-4 text-gray-600">We simulated the following user queries to test brand presence across AI platforms.</p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700">
              <span className="font-bold text-[#5599f9]">How to read this:</span> These are generic questions users might ask AI—your brand name is <span className="font-medium">not included</span> in the prompt. 
              If AI doesn't recommend you here, it means you're invisible to organic AI-assisted discovery, even if AI knows about your brand when asked directly.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                  <th className="p-4 w-16 text-center">Status</th>
                  <th className="p-4 w-48">Simulated User Query</th>
                  <th className="p-4 w-28">Platform</th>
                  <th className="p-4 hidden md:table-cell">AI Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditResults.promptResults?.flatMap((result, idx) => {
                  const chatgptResponse = result.chatgpt.response || "";
                  const googleResponse = result.googleAI.response || "";
                  const chatgptKey = `${idx}-chatgpt`;
                  const googleKey = `${idx}-google`;
                  const isChatgptExpanded = expandedRows[chatgptKey] || isPrinting;
                  const isGoogleExpanded = expandedRows[googleKey] || isPrinting;
                  
                  return [
                    <tr key={chatgptKey} className="hover:bg-gray-50 transition-colors align-top border-b border-gray-50" data-testid={`full-prompt-result-${idx}-chatgpt`}>
                      <td className="p-4 text-center">
                        {result.chatgpt.found ? (
                          <CheckCircle className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <div className="w-5 h-5 mx-auto rounded-full border-2 border-red-200 flex items-center justify-center">
                            <X className="w-3 h-3 text-red-500" />
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-medium text-[#010400] text-sm">"{result.prompt}"</td>
                      <td className="p-4">
                        <span className="text-xs font-bold px-2 py-1 rounded inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200">
                          <Cpu size={12} /> ChatGPT
                        </span>
                      </td>
                      <td className="p-4 text-sm hidden md:table-cell">
                        <div>
                          {isChatgptExpanded ? (
                            renderMarkdown(chatgptResponse)
                          ) : (
                            <p className="text-gray-600">{getResponsePreview(chatgptResponse)}</p>
                          )}
                          {chatgptResponse.length > 150 && (
                            <button
                              onClick={() => toggleRowExpansion(chatgptKey)}
                              className="text-xs font-medium text-[#5599f9] hover:text-[#4a8ce8] flex items-center gap-1 mt-2 no-print"
                              data-testid={`button-expand-response-${idx}-chatgpt`}
                            >
                              {isChatgptExpanded ? (
                                <>View Less <ChevronUp size={14} /></>
                              ) : (
                                <>View Full Response <ChevronDown size={14} /></>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    <tr key={googleKey} className="hover:bg-gray-50 transition-colors align-top border-b-2 border-gray-200" data-testid={`full-prompt-result-${idx}-google`}>
                      <td className="p-4 text-center">
                        {result.googleAI.found ? (
                          <CheckCircle className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <div className="w-5 h-5 mx-auto rounded-full border-2 border-red-200 flex items-center justify-center">
                            <X className="w-3 h-3 text-red-500" />
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-gray-400 text-sm italic">(same query)</td>
                      <td className="p-4">
                        <span className="text-xs font-bold px-2 py-1 rounded inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200">
                          <Globe size={12} /> Google AI
                        </span>
                      </td>
                      <td className="p-4 text-sm hidden md:table-cell">
                        <div>
                          {isGoogleExpanded ? (
                            renderMarkdown(googleResponse)
                          ) : (
                            <p className="text-gray-600">{getResponsePreview(googleResponse)}</p>
                          )}
                          {googleResponse.length > 150 && (
                            <button
                              onClick={() => toggleRowExpansion(googleKey)}
                              className="text-xs font-medium text-[#5599f9] hover:text-[#4a8ce8] flex items-center gap-1 mt-2 no-print"
                              data-testid={`button-expand-response-${idx}-google`}
                            >
                              {isGoogleExpanded ? (
                                <>View Less <ChevronUp size={14} /></>
                              ) : (
                                <>View Full Response <ChevronDown size={14} /></>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ];
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

        {/* 5. Footer */}
        <footer className="p-12 bg-gray-50 border-t border-gray-200 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={logoIcon} alt="Rossman Media" className="h-8 w-8 rounded-md" />
            <img src={logoFull} alt="ROSSMAN MEDIA" className="h-6" />
          </div>
          <p className="text-gray-500 text-sm">
            Prepared by ROSSMAN MEDIA | AI Visibility Audit Report
          </p>
          <p className="text-gray-400 text-xs mt-2">
            Audit ID: {audit.id} | Generated: {currentDate}
          </p>
        </footer>
      </div>
    </div>
  );
}
