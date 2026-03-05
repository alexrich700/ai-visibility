import { SlideLayout } from "../components/slide-layout";
import type { VisibilityMetrics } from "../../selectors";
import type { PresentationMode } from "../types";

interface PlatformBreakdownSlideProps {
  visibilityMetrics: VisibilityMetrics;
  slideNumber: number;
  totalSlides: number;
  mode?: PresentationMode;
}

export function PlatformBreakdownSlide({ visibilityMetrics, slideNumber, totalSlides, mode }: PlatformBreakdownSlideProps) {
  const { chatgptVisibility, googleAIVisibility, chatgptFoundCount, googleAIFoundCount, promptCount, visibilityRate, foundCount, totalExposures } = visibilityMetrics;

  const isPitch = mode === "pitch";
  const title = isPitch ? "Your Visibility by Platform" : "Platform Breakdown";
  const subtitle = isPitch
    ? "Let's break that down... where are you showing up, and where aren't you?"
    : "Visibility across AI platforms";

  return (
    <SlideLayout title={title} subtitle={subtitle} slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="w-full max-w-4xl mx-auto space-y-12">
          {/* ChatGPT */}
          <div className="bg-gray-50 border border-gray-100 p-8 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-[#5599f9]" />
                <span className="text-2xl font-bold text-gray-800">ChatGPT</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-[#5599f9]">{chatgptVisibility}%</span>
                <span className="text-lg text-gray-400">({chatgptFoundCount}/{promptCount})</span>
              </div>
            </div>
            <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5599f9] rounded-full transition-all duration-1000"
                style={{ width: `${chatgptVisibility}%` }}
              />
            </div>
          </div>

          {/* Google AI */}
          <div className="bg-gray-50 border border-gray-100 p-8 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-[#ffb41c]" />
                <span className="text-2xl font-bold text-gray-800">Google AI</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-[#ffb41c]">{googleAIVisibility}%</span>
                <span className="text-lg text-gray-400">({googleAIFoundCount}/{promptCount})</span>
              </div>
            </div>
            <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ffb41c] rounded-full transition-all duration-1000"
                style={{ width: `${googleAIVisibility}%` }}
              />
            </div>
          </div>

          {/* Combined summary */}
          <div className="pt-6 border-t-2 border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-lg text-gray-600">Combined Visibility</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{visibilityRate}%</span>
                <span className="text-sm text-gray-400">({foundCount} of {totalExposures} responses)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
