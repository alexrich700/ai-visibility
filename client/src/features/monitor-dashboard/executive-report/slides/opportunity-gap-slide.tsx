import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { AlertCircle } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { VisibilityMetrics } from "../../selectors";
import type { PromptPerformanceItem } from "../types";

interface OpportunityGapSlideProps {
  visibilityMetrics: VisibilityMetrics;
  bottomPrompts: PromptPerformanceItem[];
  businessName: string;
  slideNumber: number;
  totalSlides: number;
}

function getStatusColor(rate: number): { bg: string; text: string; label: string } {
  if (rate >= 60) return { bg: "bg-green-100", text: "text-green-700", label: "Good" };
  if (rate >= 30) return { bg: "bg-amber-100", text: "text-amber-700", label: "Needs Work" };
  return { bg: "bg-red-100", text: "text-red-700", label: "Low" };
}

export function OpportunityGapSlide({
  visibilityMetrics,
  bottomPrompts,
  businessName,
  slideNumber,
  totalSlides,
}: OpportunityGapSlideProps) {
  const { visibilityRate, citationRate } = visibilityMetrics;
  const missedPercent = 100 - visibilityRate;

  const visStatus = getStatusColor(visibilityRate);
  const citStatus = getStatusColor(citationRate);

  const donutData = [
    { name: "Visible", value: visibilityRate },
    { name: "Missed", value: missedPercent },
  ];

  const missedPrompts = bottomPrompts.filter((p) => !p.chatgptFound && !p.googleAIFound).slice(0, 4);

  return (
    <SlideLayout
      title="The Gap You're Leaving Open"
      subtitle={`Right now, ${missedPercent}% of AI conversations about your space don't mention ${businessName}`}
      slideNumber={slideNumber}
      totalSlides={totalSlides}
    >
      <div className="h-full flex items-center">
        <div className="grid grid-cols-2 gap-12 w-full">
          {/* Left: donut chart + metrics */}
          <div className="flex flex-col items-center justify-center space-y-8">
            <div className="w-64 h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill="#5599f9" />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-900">{missedPercent}%</span>
                <span className="text-sm text-gray-500">missed</span>
              </div>
            </div>

            <div className="w-full max-w-xs space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-700">Visibility Rate</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">{visibilityRate}%</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visStatus.bg} ${visStatus.text}`}>{visStatus.label}</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-700">Citation Rate</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">{citationRate}%</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${citStatus.bg} ${citStatus.text}`}>{citStatus.label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: missed prompts */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">Queries Where You're Missing</h3>
            </div>
            {missedPrompts.length > 0 ? (
              <div className="space-y-4">
                {missedPrompts.map((prompt, i) => (
                  <div key={i} className="p-4 bg-red-50/50 border border-red-100 rounded-xl">
                    <p className="text-sm text-gray-800 leading-relaxed">"{prompt.promptText}"</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">ChatGPT: Not found</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Google AI: Not found</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {bottomPrompts.slice(0, 4).map((prompt, i) => (
                  <div key={i} className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                    <p className="text-sm text-gray-800 leading-relaxed">"{prompt.promptText}"</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${prompt.chatgptFound ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        ChatGPT: {prompt.chatgptFound ? "Found" : "Not found"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${prompt.googleAIFound ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        Google AI: {prompt.googleAIFound ? "Found" : "Not found"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-500 mt-6">
              Real questions your potential customers are asking AI... and {businessName} isn't part of the answer.
            </p>
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
