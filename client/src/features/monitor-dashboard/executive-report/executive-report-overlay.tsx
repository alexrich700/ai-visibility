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
import type { ReportData } from "./types";

interface ExecutiveReportOverlayProps {
  data: ReportData;
  onClose: () => void;
}

export function ExecutiveReportOverlay({ data, onClose }: ExecutiveReportOverlayProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = buildSlideList(data);
  const totalSlides = slides.length;

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
    <div className="fixed inset-0 z-50 bg-gray-100">
      {/* Persistent gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#5599f9] to-[#ffb41c] z-20" />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="h-full"
        >
          {slides[currentSlide]}
        </motion.div>
      </AnimatePresence>

      <SlideNavigation
        currentSlide={currentSlide}
        totalSlides={totalSlides}
        onPrevious={goPrevious}
        onNext={goNext}
        onGoToSlide={goToSlide}
        onClose={onClose}
      />
    </div>
  );
}

function buildSlideList(data: ReportData): React.ReactNode[] {
  const slides: React.ReactNode[] = [];

  const hasSentiment = (data.sentimentNarratives?.strengths?.length ?? 0) > 0
    || (data.sentimentNarratives?.improvements?.length ?? 0) > 0;
  const hasCities = data.cityMetrics != null && data.cityMetrics.length > 1;

  // Count total slides
  let total = 8; // title + kpi + trend + platform + competitive + citations + groups + prompts
  if (hasCities) total += 1;
  if (hasSentiment) total += 1;

  let n = 1;

  // 1. Title
  slides.push(
    <TitleSlide key="title" businessName={data.businessName} scanDate={data.scanDate} city={data.city} />,
  );

  // 2. KPI Scorecard
  slides.push(
    <KpiScorecardSlide key="kpi" visibilityMetrics={data.visibilityMetrics} avgRank={data.avgRank} firstPlaceCount={data.firstPlaceCount} sentimentScore={data.sentimentScore} slideNumber={++n} totalSlides={total} />,
  );

  // 3. City Comparison (conditional)
  if (hasCities) {
    slides.push(
      <CityComparisonSlide key="cities" cityMetrics={data.cityMetrics!} slideNumber={++n} totalSlides={total} />,
    );
  }

  // 4. Visibility Trend
  slides.push(
    <VisibilityTrendSlide key="trend" sessionChartData={data.sessionChartData} slideNumber={++n} totalSlides={total} />,
  );

  // 5. Platform Breakdown
  slides.push(
    <PlatformBreakdownSlide key="platform" visibilityMetrics={data.visibilityMetrics} slideNumber={++n} totalSlides={total} />,
  );

  // 6. Competitive Landscape
  slides.push(
    <CompetitiveLandscapeSlide key="competitive" shareOfVoice={data.shareOfVoice} competitorVisibility={data.competitorVisibility} businessName={data.businessName} slideNumber={++n} totalSlides={total} />,
  );

  // 7. Citations & Prominence
  slides.push(
    <CitationsProminenceSlide key="citations" topCitations={data.topCitations} avgRank={data.avgRank} firstPlaceCount={data.firstPlaceCount} slideNumber={++n} totalSlides={total} />,
  );

  // 8. Sentiment (conditional)
  if (hasSentiment) {
    slides.push(
      <SentimentSlide key="sentiment" sentimentNarratives={data.sentimentNarratives} slideNumber={++n} totalSlides={total} />,
    );
  }

  // 9. Group Performance
  slides.push(
    <GroupPerformanceSlide key="groups" groupBarData={data.groupBarData} slideNumber={++n} totalSlides={total} />,
  );

  // 10. Prompt Performance
  slides.push(
    <PromptPerformanceSlide key="prompts" topPrompts={data.topPrompts} bottomPrompts={data.bottomPrompts} slideNumber={++n} totalSlides={total} />,
  );

  return slides;
}
