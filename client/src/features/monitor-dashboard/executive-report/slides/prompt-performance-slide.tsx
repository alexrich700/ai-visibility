import { useState } from "react";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { PromptPerformanceItem, PresentationMode } from "../types";

interface PromptPerformanceSlideProps {
  topPrompts: PromptPerformanceItem[];
  bottomPrompts: PromptPerformanceItem[];
  businessName: string;
  slideNumber: number;
  totalSlides: number;
  mode?: PresentationMode;
}

function PlatformBadge({ found, label }: { found: boolean; label: string }) {
  if (found) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
      <XCircle className="w-3 h-3" />
      {label}
    </span>
  );
}

function PromptRow({ prompt, variant, onClick }: { prompt: PromptPerformanceItem; variant: "top" | "bottom"; onClick: () => void }) {
  const truncated = prompt.promptText.length > 65
    ? prompt.promptText.slice(0, 62) + "..."
    : prompt.promptText;

  const bgClass = variant === "top"
    ? "bg-green-50/50 border border-green-100 hover:bg-green-50"
    : "bg-red-50/50 border border-red-100 hover:bg-red-50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 p-4 rounded-xl ${bgClass} w-full text-left transition-colors cursor-pointer`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 leading-relaxed">{truncated}</p>
        <div className="flex items-center gap-2 mt-3">
          <PlatformBadge found={prompt.chatgptFound} label="ChatGPT" />
          <PlatformBadge found={prompt.googleAIFound} label="Google" />
          {prompt.avgRank != null && (
            <span className="text-xs text-gray-500 ml-auto">Rank {prompt.avgRank}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function parseCitations(raw: unknown): Array<{ url: string; title?: string; domain: string }> | null {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (Array.isArray(raw)) return raw as Array<{ url: string; title?: string; domain: string }>;
  return null;
}

function CitationsList({ citations, color }: { citations: Array<{ url: string; title?: string; domain: string }>; color: "blue" | "orange" }) {
  const bg = color === "blue" ? "bg-blue-50" : "bg-orange-50";
  const textColor = color === "blue" ? "text-blue-700" : "text-orange-700";
  const linkColor = color === "blue" ? "text-blue-600 hover:text-blue-800" : "text-orange-600 hover:text-orange-800";
  const numColor = color === "blue" ? "text-blue-400" : "text-orange-400";

  return (
    <div className={`${bg} rounded-lg p-3`}>
      <p className={`text-xs ${textColor} uppercase tracking-wider font-bold mb-2 flex items-center gap-1`}>
        <ExternalLink className="w-3 h-3" />
        Sources Cited ({citations.length})
      </p>
      <div className="space-y-1.5">
        {citations.slice(0, 8).map((citation, idx) => (
          <a
            key={idx}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 text-sm ${linkColor} hover:underline truncate`}
          >
            <span className={`text-xs ${numColor} flex-shrink-0`}>{idx + 1}.</span>
            <span className="truncate">{citation.title || citation.domain}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function ResponseModal({ prompt, businessName, onClose }: { prompt: PromptPerformanceItem; businessName: string; onClose: () => void }) {
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const formatResponse = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>")
      .replace(new RegExp(`(${escapeRegex(businessName)})`, "gi"), '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
  };

  const chatgptCitations = parseCitations(prompt.chatgptCitations);
  const googleAICitations = parseCitations(prompt.googleAICitations);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden z-[60]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">
            AI Response Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-hidden">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Prompt</p>
            <p className="text-gray-900 break-words">{prompt.promptText}</p>
          </div>

          <Tabs defaultValue="chatgpt" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="chatgpt" className="flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${prompt.chatgptFound ? "bg-green-500" : "bg-red-500"}`} />
                  ChatGPT
                  {prompt.chatgptCited && <Badge variant="secondary" className="text-xs ml-1">Cited</Badge>}
                </div>
              </TabsTrigger>
              <TabsTrigger value="googleai" className="flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${prompt.googleAIFound ? "bg-green-500" : "bg-red-500"}`} />
                  Google AI
                  {prompt.googleAICited && <Badge variant="secondary" className="text-xs ml-1">Cited</Badge>}
                </div>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chatgpt" className="mt-4 space-y-3">
              <ScrollArea className="h-[350px] rounded-lg border p-4 overflow-x-hidden">
                {prompt.chatgptResponse ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 break-words overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: formatResponse(prompt.chatgptResponse) }}
                  />
                ) : (
                  <p className="text-gray-500 italic">No response recorded</p>
                )}
              </ScrollArea>
              {chatgptCitations && chatgptCitations.length > 0 && (
                <CitationsList citations={chatgptCitations} color="blue" />
              )}
            </TabsContent>

            <TabsContent value="googleai" className="mt-4 space-y-3">
              <ScrollArea className="h-[350px] rounded-lg border p-4 overflow-x-hidden">
                {prompt.googleAIResponse ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 break-words overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: formatResponse(prompt.googleAIResponse) }}
                  />
                ) : (
                  <p className="text-gray-500 italic">No response recorded</p>
                )}
              </ScrollArea>
              {googleAICitations && googleAICitations.length > 0 && (
                <CitationsList citations={googleAICitations} color="orange" />
              )}
            </TabsContent>
          </Tabs>

          {prompt.competitors && (() => {
            try {
              const comps = JSON.parse(prompt.competitors);
              if (!Array.isArray(comps) || comps.length === 0) return null;
              return (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">Competitors Mentioned</p>
                  <div className="flex flex-wrap gap-2">
                    {comps.slice(0, 10).map((competitor: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {competitor}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PromptPerformanceSlide({ topPrompts, bottomPrompts, businessName, slideNumber, totalSlides, mode }: PromptPerformanceSlideProps) {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptPerformanceItem | null>(null);

  const isPitch = mode === "pitch";
  const title = isPitch ? "The Questions People Are Asking AI" : "Prompt Performance";
  const subtitle = isPitch
    ? "These are real queries... click any to see exactly what ChatGPT and Google said"
    : "Strongest and weakest performing search queries";

  return (
    <SlideLayout title={title} subtitle={subtitle} slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="grid md:grid-cols-2 gap-8 h-full">
        {/* Top Performers */}
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4 px-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <h3 className="text-lg font-bold text-green-700">{isPitch ? "Where You're Showing Up" : "Top Performers"}</h3>
          </div>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
            {topPrompts.length > 0 ? (
              topPrompts.map((prompt, i) => (
                <PromptRow key={i} prompt={prompt} variant="top" onClick={() => setSelectedPrompt(prompt)} />
              ))
            ) : (
              <p className="text-sm text-gray-400">No prompt data available</p>
            )}
          </div>
        </div>

        {/* Needs Attention */}
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4 px-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <h3 className="text-lg font-bold text-red-700">{isPitch ? "Where You're Not" : "Needs Attention"}</h3>
          </div>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
            {bottomPrompts.length > 0 ? (
              bottomPrompts.map((prompt, i) => (
                <PromptRow key={i} prompt={prompt} variant="bottom" onClick={() => setSelectedPrompt(prompt)} />
              ))
            ) : (
              <p className="text-sm text-gray-400">No prompt data available</p>
            )}
          </div>
        </div>
      </div>

      {selectedPrompt && (
        <ResponseModal
          prompt={selectedPrompt}
          businessName={businessName}
          onClose={() => setSelectedPrompt(null)}
        />
      )}
    </SlideLayout>
  );
}
