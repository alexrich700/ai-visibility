import { TrendingUp, TrendingDown, Minus, Eye, Target, Award, BarChart3 } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { VisibilityMetrics } from "../../selectors";
import type { PreviousPeriodData } from "../types";

interface ProgressHighlightsSlideProps {
  visibilityMetrics: VisibilityMetrics;
  avgRank: number | null;
  sentimentScore: number | null;
  previousPeriod: PreviousPeriodData | null;
  slideNumber: number;
  totalSlides: number;
}

function DeltaIndicator({ current, previous, invertBetter }: { current: number; previous: number; invertBetter?: boolean }) {
  const diff = current - previous;
  const absDiff = Math.abs(diff);
  const formatted = absDiff % 1 === 0 ? absDiff.toString() : absDiff.toFixed(1);

  if (Math.abs(diff) < 0.1) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-gray-400">
        <Minus className="w-4 h-4" /> No change
      </span>
    );
  }

  const isPositive = invertBetter ? diff < 0 : diff > 0;

  if (isPositive) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
        <TrendingUp className="w-4 h-4" /> +{formatted}{invertBetter ? "" : "%"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-red-500">
      <TrendingDown className="w-4 h-4" /> -{formatted}{invertBetter ? "" : "%"}
    </span>
  );
}

export function ProgressHighlightsSlide({
  visibilityMetrics,
  avgRank,
  sentimentScore,
  previousPeriod,
  slideNumber,
  totalSlides,
}: ProgressHighlightsSlideProps) {
  const { visibilityRate, citationRate } = visibilityMetrics;

  if (!previousPeriod) {
    return (
      <SlideLayout title="Progress Highlights" subtitle="Performance changes since last report" slideNumber={slideNumber} totalSlides={totalSlides}>
        <div className="h-full flex items-center justify-center">
          <div className="text-center max-w-md">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-gray-700 mb-3">This is Your First Report</h3>
            <p className="text-gray-500">Future reports will show progress and improvements compared to this baseline.</p>
          </div>
        </div>
      </SlideLayout>
    );
  }

  const kpis = [
    {
      label: "Visibility Rate",
      current: visibilityRate,
      previous: previousPeriod.visibilityRate,
      format: (v: number) => `${v}%`,
      icon: Eye,
      iconColor: "text-[#ff5800]",
      iconBg: "bg-orange-50",
      borderColor: "#ff5800",
    },
    {
      label: "Citation Rate",
      current: citationRate,
      previous: previousPeriod.citationRate,
      format: (v: number) => `${v}%`,
      icon: Target,
      iconColor: "text-[#ffb41c]",
      iconBg: "bg-amber-50",
      borderColor: "#ffb41c",
    },
    {
      label: "Average Rank",
      current: avgRank,
      previous: previousPeriod.avgRank,
      format: (v: number) => v.toFixed(1),
      icon: Award,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
      borderColor: "#f59e0b",
      invertBetter: true,
    },
    {
      label: "Sentiment Score",
      current: sentimentScore,
      previous: previousPeriod.sentimentScore,
      format: (v: number) => `${v}%`,
      icon: TrendingUp,
      iconColor: "text-green-600",
      iconBg: "bg-green-50",
      borderColor: "#22c55e",
    },
  ];

  // Generate highlight callouts
  const highlights: string[] = [];
  const visDiff = visibilityRate - previousPeriod.visibilityRate;
  if (visDiff > 0) highlights.push(`Visibility improved by ${visDiff.toFixed(0)} points`);
  const citDiff = citationRate - previousPeriod.citationRate;
  if (citDiff > 0) highlights.push(`Citation rate up ${citDiff.toFixed(0)} points`);
  if (avgRank !== null && previousPeriod.avgRank !== null && avgRank < previousPeriod.avgRank) {
    highlights.push(`Average rank improved from ${previousPeriod.avgRank.toFixed(1)} to ${avgRank.toFixed(1)}`);
  }
  if (sentimentScore !== null && previousPeriod.sentimentScore !== null && sentimentScore > previousPeriod.sentimentScore) {
    highlights.push(`Sentiment score increased by ${(sentimentScore - previousPeriod.sentimentScore).toFixed(0)} points`);
  }

  return (
    <SlideLayout
      title="Progress Highlights"
      subtitle={`Changes since ${previousPeriod.scanDate ?? "last report"}`}
      slideNumber={slideNumber}
      totalSlides={totalSlides}
    >
      <div className="h-full flex flex-col justify-center space-y-8">
        {/* KPI cards with deltas */}
        <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-2xl p-6 flex items-start gap-5 border border-gray-200 shadow-sm border-l-4"
              style={{ borderLeftColor: kpi.borderColor }}
            >
              <div className={`p-2.5 rounded-xl ${kpi.iconBg}`}>
                <kpi.icon className={`w-6 h-6 ${kpi.iconColor}`} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                <div className="flex items-baseline gap-3 mt-1">
                  <p className="text-3xl font-bold text-gray-900">
                    {kpi.current !== null ? kpi.format(kpi.current) : "—"}
                  </p>
                  {kpi.current !== null && kpi.previous !== null && (
                    <DeltaIndicator current={kpi.current} previous={kpi.previous} invertBetter={kpi.invertBetter} />
                  )}
                </div>
                {kpi.previous !== null && (
                  <p className="text-xs text-gray-400 mt-1">Previously: {kpi.format(kpi.previous)}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Highlight callouts */}
        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center">
            {highlights.map((h, i) => (
              <div key={i} className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">{h}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SlideLayout>
  );
}
