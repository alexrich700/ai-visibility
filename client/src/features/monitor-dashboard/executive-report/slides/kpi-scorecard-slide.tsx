import { Award, Eye, Target, TrendingUp } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { VisibilityMetrics } from "../../selectors";

interface KpiScorecardSlideProps {
  visibilityMetrics: VisibilityMetrics;
  avgRank: number | null;
  firstPlaceCount: number;
  sentimentScore: number | null;
  slideNumber: number;
  totalSlides: number;
}

export function KpiScorecardSlide({
  visibilityMetrics,
  avgRank,
  firstPlaceCount,
  sentimentScore,
  slideNumber,
  totalSlides,
}: KpiScorecardSlideProps) {
  const { visibilityRate, citationRate } = visibilityMetrics;

  const kpis = [
    {
      label: "Average Rank",
      value: avgRank !== null ? avgRank.toFixed(1) : "—",
      subtitle: avgRank !== null ? "Lower is better" : "No rankings yet",
      icon: Award,
      color: "text-gray-900",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
      borderColor: "#f59e0b",
    },
    {
      label: "Visibility Rate",
      value: `${visibilityRate}%`,
      subtitle: `${visibilityMetrics.foundCount} of ${visibilityMetrics.totalExposures} AI responses`,
      icon: Eye,
      color: "text-[#5599f9]",
      iconColor: "text-[#5599f9]",
      iconBg: "bg-blue-50",
      borderColor: "#5599f9",
    },
    {
      label: "Citation Rate",
      value: `${citationRate}%`,
      subtitle: `${visibilityMetrics.citedCount} direct citations`,
      icon: Target,
      color: "text-[#ffb41c]",
      iconColor: "text-[#ffb41c]",
      iconBg: "bg-amber-50",
      borderColor: "#ffb41c",
    },
    {
      label: "Sentiment Score",
      value: sentimentScore !== null ? `${sentimentScore}%` : "—",
      subtitle: sentimentScore !== null
        ? sentimentScore >= 70 ? "Positive perception" : sentimentScore >= 40 ? "Mixed perception" : "Needs attention"
        : "Not available",
      icon: TrendingUp,
      color: sentimentScore !== null && sentimentScore >= 70 ? "text-green-600" : sentimentScore !== null && sentimentScore >= 40 ? "text-amber-500" : "text-gray-900",
      iconColor: sentimentScore !== null && sentimentScore >= 70 ? "text-green-500" : sentimentScore !== null && sentimentScore >= 40 ? "text-amber-500" : "text-gray-400",
      iconBg: sentimentScore !== null && sentimentScore >= 70 ? "bg-green-50" : sentimentScore !== null && sentimentScore >= 40 ? "bg-amber-50" : "bg-gray-50",
      borderColor: sentimentScore !== null && sentimentScore >= 70 ? "#22c55e" : sentimentScore !== null && sentimentScore >= 40 ? "#f59e0b" : "#d1d5db",
    },
  ];

  return (
    <SlideLayout title="Executive Summary" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="grid grid-cols-2 gap-8 w-full max-w-4xl mx-auto">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-2xl p-8 flex items-start gap-6 border border-gray-200 shadow-sm border-l-4"
              style={{ borderLeftColor: kpi.borderColor }}
            >
              <div className={`p-3 rounded-xl ${kpi.iconBg}`}>
                <kpi.icon className={`w-8 h-8 ${kpi.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                <p className={`text-5xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
                <p className="text-sm text-gray-500 mt-2">{kpi.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideLayout>
  );
}
