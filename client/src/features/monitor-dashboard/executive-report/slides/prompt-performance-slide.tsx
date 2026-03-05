import { CheckCircle2, XCircle, Minus } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { PromptPerformanceItem } from "../types";

interface PromptPerformanceSlideProps {
  topPrompts: PromptPerformanceItem[];
  bottomPrompts: PromptPerformanceItem[];
  slideNumber: number;
  totalSlides: number;
}

function PlatformBadge({ found, cited, label }: { found: boolean; cited: boolean; label: string }) {
  if (cited) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        {label}
      </span>
    );
  }
  if (found) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Minus className="w-3 h-3" />
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

function PromptRow({ prompt }: { prompt: PromptPerformanceItem }) {
  const truncated = prompt.promptText.length > 65
    ? prompt.promptText.slice(0, 62) + "..."
    : prompt.promptText;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-snug">{truncated}</p>
        <div className="flex items-center gap-2 mt-2">
          <PlatformBadge found={prompt.chatgptFound} cited={prompt.chatgptCited ?? false} label="ChatGPT" />
          <PlatformBadge found={prompt.googleAIFound} cited={prompt.googleAICited ?? false} label="Google" />
          {prompt.avgRank != null && (
            <span className="text-xs text-gray-500 ml-1">Rank {prompt.avgRank}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PromptPerformanceSlide({ topPrompts, bottomPrompts, slideNumber, totalSlides }: PromptPerformanceSlideProps) {
  return (
    <SlideLayout title="Prompt Performance" subtitle="Strongest and weakest performing search queries" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="grid md:grid-cols-2 gap-8 h-full">
        {/* Top Performers */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
          </div>
          <div className="space-y-3">
            {topPrompts.length > 0 ? (
              topPrompts.map((prompt, i) => <PromptRow key={i} prompt={prompt} />)
            ) : (
              <p className="text-sm text-gray-400">No prompt data available</p>
            )}
          </div>
        </div>

        {/* Needs Attention */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">Needs Attention</h3>
          </div>
          <div className="space-y-3">
            {bottomPrompts.length > 0 ? (
              bottomPrompts.map((prompt, i) => <PromptRow key={i} prompt={prompt} />)
            ) : (
              <p className="text-sm text-gray-400">No prompt data available</p>
            )}
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
