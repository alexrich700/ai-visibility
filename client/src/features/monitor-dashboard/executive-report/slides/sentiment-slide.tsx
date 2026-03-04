import { Target, AlertTriangle } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { SentimentNarratives } from "../types";

interface SentimentSlideProps {
  sentimentNarratives: SentimentNarratives | null;
  slideNumber: number;
  totalSlides: number;
}

export function SentimentSlide({ sentimentNarratives, slideNumber, totalSlides }: SentimentSlideProps) {
  const strengths = sentimentNarratives?.strengths ?? [];
  const improvements = sentimentNarratives?.improvements ?? [];

  return (
    <SlideLayout title="Sentiment & Brand Perception" subtitle="AI-synthesized insights about your brand" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="grid grid-cols-2 gap-10 w-full">
          {/* Brand Strengths */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Target className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Brand Strengths</h3>
            </div>
            {strengths.length > 0 ? (
              <div className="space-y-4">
                {strengths.slice(0, 5).map((narrative, index) => (
                  <div key={index} className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-sm text-gray-800 leading-relaxed">{narrative.text}</p>
                    <div className="flex items-center gap-1 mt-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${
                            i < narrative.strength ? "bg-green-500" : "bg-green-100"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No strength data available</p>
            )}
          </div>

          {/* Areas for Improvement */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">Areas for Improvement</h3>
            </div>
            {improvements.length > 0 ? (
              <div className="space-y-4">
                {improvements.slice(0, 5).map((narrative, index) => (
                  <div key={index} className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-sm text-gray-800 leading-relaxed">{narrative.text}</p>
                    <div className="flex items-center gap-1 mt-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${
                            i < narrative.strength ? "bg-amber-500" : "bg-amber-100"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No improvement data available</p>
            )}
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
