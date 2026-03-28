import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlideNavigation } from "./components/slide-navigation";
import { TitleSlide } from "./slides/title-slide";
import { KpiScorecardSlide } from "./slides/kpi-scorecard-slide";
import { CityComparisonSlide } from "./slides/city-comparison-slide";
import { VisibilityTrendSlide } from "./slides/visibility-trend-slide";
import { PlatformBreakdownSlide } from "./slides/platform-breakdown-slide";
import { CompetitiveLandscapeSlide } from "./slides/competitive-landscape-slide";
import { CitationsProminenceSlide } from "./slides/citations-prominence-slide";
import { SentimentSlide } from "./slides/sentiment-slide";
import { GroupPerformanceSlide } from "./slides/group-performance-slide";
import { PromptPerformanceSlide } from "./slides/prompt-performance-slide";
import { WhatIsAiVisibilitySlide } from "./slides/what-is-ai-visibility-slide";
import { WhyGeoMattersSlide } from "./slides/why-geo-matters-slide";
import { OpportunityGapSlide } from "./slides/opportunity-gap-slide";
import { CtaSlide } from "./slides/cta-slide";
import { ProgressHighlightsSlide } from "./slides/progress-highlights-slide";
import type { PresentationMode, ReportData } from "./types";

interface SlideDefinition {
  id: string;
  label: string;
  condition: (data: ReportData) => boolean;
  render: (data: ReportData, slideNumber: number, totalSlides: number, mode: PresentationMode) => React.ReactNode;
  defaultModes: PresentationMode[];
}

const SLIDE_REGISTRY: SlideDefinition[] = [
  {
    id: "title",
    label: "Title",
    condition: () => true,
    render: (data, _sn, _ts, mode) => (
      <TitleSlide key="title" businessName={data.businessName} scanDate={data.scanDate} city={data.city} mode={mode} />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "what-is-ai-visibility",
    label: "How Search Changed",
    condition: () => true,
    render: (_data, sn, ts) => (
      <WhatIsAiVisibilitySlide key="what-is-ai" slideNumber={sn} totalSlides={ts} />
    ),
    defaultModes: ["pitch"],
  },
  {
    id: "why-geo-matters",
    label: "Why This Matters",
    condition: () => true,
    render: (_data, sn, ts) => (
      <WhyGeoMattersSlide key="why-geo" slideNumber={sn} totalSlides={ts} />
    ),
    defaultModes: ["pitch"],
  },
  {
    id: "progress-highlights",
    label: "Progress Highlights",
    condition: () => true,
    render: (data, sn, ts) => (
      <ProgressHighlightsSlide
        key="progress"
        visibilityMetrics={data.visibilityMetrics}
        avgRank={data.avgRank}
        sentimentScore={data.sentimentScore}
        previousPeriod={data.previousPeriod}
        slideNumber={sn}
        totalSlides={ts}
      />
    ),
    defaultModes: ["progress"],
  },
  {
    id: "kpi",
    label: "Executive Summary",
    condition: () => true,
    render: (data, sn, ts, mode) => (
      <KpiScorecardSlide
        key="kpi"
        visibilityMetrics={data.visibilityMetrics}
        avgRank={data.avgRank}
        firstPlaceCount={data.firstPlaceCount}
        sentimentScore={data.sentimentScore}
        slideNumber={sn}
        totalSlides={ts}
        mode={mode}
      />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "visibility-trend",
    label: "Visibility Trend",
    condition: () => true,
    render: (data, sn, ts) => (
      <VisibilityTrendSlide key="trend" sessionChartData={data.sessionChartData} slideNumber={sn} totalSlides={ts} />
    ),
    defaultModes: ["progress"],
  },
  {
    id: "platform-breakdown",
    label: "Platform Breakdown",
    condition: () => true,
    render: (data, sn, ts, mode) => (
      <PlatformBreakdownSlide key="platform" visibilityMetrics={data.visibilityMetrics} slideNumber={sn} totalSlides={ts} mode={mode} />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "competitive-landscape",
    label: "Competitive Landscape",
    condition: () => true,
    render: (data, sn, ts, mode) => (
      <CompetitiveLandscapeSlide
        key="competitive"
        shareOfVoice={data.shareOfVoice}
        competitorVisibility={data.competitorVisibility}
        businessName={data.businessName}
        slideNumber={sn}
        totalSlides={ts}
        mode={mode}
      />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "opportunity-gap",
    label: "Opportunity Gap",
    condition: () => true,
    render: (data, sn, ts) => (
      <OpportunityGapSlide
        key="opportunity"
        visibilityMetrics={data.visibilityMetrics}
        bottomPrompts={data.bottomPrompts}
        businessName={data.businessName}
        slideNumber={sn}
        totalSlides={ts}
      />
    ),
    defaultModes: ["pitch"],
  },
  {
    id: "city-comparison",
    label: "Visibility by Location",
    condition: (data) => data.cityMetrics != null && data.cityMetrics.length > 1,
    render: (data, sn, ts, mode) => (
      <CityComparisonSlide key="cities" cityMetrics={data.cityMetrics!} slideNumber={sn} totalSlides={ts} mode={mode} />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "citations-prominence",
    label: "Citations & Prominence",
    condition: () => true,
    render: (data, sn, ts) => (
      <CitationsProminenceSlide
        key="citations"
        topCitations={data.topCitations}
        avgRank={data.avgRank}
        firstPlaceCount={data.firstPlaceCount}
        slideNumber={sn}
        totalSlides={ts}
      />
    ),
    defaultModes: ["progress"],
  },
  {
    id: "sentiment",
    label: "Sentiment & Perception",
    condition: (data) =>
      (data.sentimentNarratives?.strengths?.length ?? 0) > 0 ||
      (data.sentimentNarratives?.improvements?.length ?? 0) > 0,
    render: (data, sn, ts) => (
      <SentimentSlide key="sentiment" sentimentNarratives={data.sentimentNarratives} slideNumber={sn} totalSlides={ts} />
    ),
    defaultModes: ["progress"],
  },
  {
    id: "group-performance",
    label: "Service Group Performance",
    condition: () => true,
    render: (data, sn, ts, mode) => (
      <GroupPerformanceSlide key="groups" groupBarData={data.groupBarData} slideNumber={sn} totalSlides={ts} mode={mode} />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "prompt-performance",
    label: "Prompt Performance",
    condition: () => true,
    render: (data, sn, ts, mode) => (
      <PromptPerformanceSlide
        key="prompts"
        topPrompts={data.topPrompts}
        bottomPrompts={data.bottomPrompts}
        businessName={data.businessName}
        slideNumber={sn}
        totalSlides={ts}
        mode={mode}
      />
    ),
    defaultModes: ["pitch", "progress"],
  },
  {
    id: "cta",
    label: "Next Steps",
    condition: () => true,
    render: (data, sn, ts) => (
      <CtaSlide key="cta" businessName={data.businessName} slideNumber={sn} totalSlides={ts} />
    ),
    defaultModes: ["pitch"],
  },
];

export { SLIDE_REGISTRY };
export type { SlideDefinition };

export function getDefaultSlideIds(mode: PresentationMode, data: ReportData): string[] {
  return SLIDE_REGISTRY
    .filter((s) => s.defaultModes.includes(mode) && s.condition(data))
    .map((s) => s.id);
}

interface ExecutiveReportOverlayProps {
  data: ReportData;
  mode: PresentationMode;
  enabledSlides: string[];
  onClose: () => void;
}

export function ExecutiveReportOverlay({ data, mode, enabledSlides, onClose }: ExecutiveReportOverlayProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = buildSlideList(data, mode, enabledSlides);
  const totalSlides = slides.nodes.length;

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrevious = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, totalSlides - 1)));
  }, [totalSlides]);

  return (
    <div className="fixed inset-0 z-50 bg-muted" style={{ height: "100dvh" }}>
      {/* Persistent gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#ff5800] to-[#ffb41c] z-20" />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="h-full"
        >
          {slides.nodes[currentSlide]}
        </motion.div>
      </AnimatePresence>

      <SlideNavigation
        currentSlide={currentSlide}
        totalSlides={totalSlides}
        slideLabels={slides.labels}
        onPrevious={goPrevious}
        onNext={goNext}
        onGoToSlide={goToSlide}
        onClose={onClose}
      />
    </div>
  );
}

function buildSlideList(
  data: ReportData,
  mode: PresentationMode,
  enabledSlides: string[],
): { nodes: React.ReactNode[]; labels: string[] } {
  const enabledSet = new Set(enabledSlides);

  const activeSlides = SLIDE_REGISTRY.filter(
    (s) => enabledSet.has(s.id) && s.condition(data),
  );

  const totalSlides = activeSlides.length;
  let slideNumber = 1;

  const nodes: React.ReactNode[] = [];
  const labels: string[] = [];

  for (const slide of activeSlides) {
    nodes.push(slide.render(data, slideNumber, totalSlides, mode));
    labels.push(slide.label);
    slideNumber++;
  }

  return { nodes, labels };
}
