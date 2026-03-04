import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlideNavigation } from "./components/slide-navigation";
import { TitleSlide } from "./slides/title-slide";
import { KpiScorecardSlide } from "./slides/kpi-scorecard-slide";
import { VisibilityTrendSlide } from "./slides/visibility-trend-slide";
import { PlatformBreakdownSlide } from "./slides/platform-breakdown-slide";
import { CompetitiveLandscapeSlide } from "./slides/competitive-landscape-slide";
import { CitationsProminenceSlide } from "./slides/citations-prominence-slide";
import { SentimentSlide } from "./slides/sentiment-slide";
import { GroupPerformanceSlide } from "./slides/group-performance-slide";
import type { ReportData } from "./types";

interface ExecutiveReportOverlayProps {
  data: ReportData;
  onClose: () => void;
}

export function ExecutiveReportOverlay({ data, onClose }: ExecutiveReportOverlayProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Build slide list, conditionally including sentiment if data exists
  const hasSentiment = (data.sentimentNarratives?.strengths?.length ?? 0) > 0
    || (data.sentimentNarratives?.improvements?.length ?? 0) > 0;

  const slides = buildSlideList(data, hasSentiment);
  const totalSlides = slides.length;

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrevious = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-white">
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
        onClose={onClose}
      />
    </div>
  );
}

function buildSlideList(data: ReportData, hasSentiment: boolean): React.ReactNode[] {
  const slides: React.ReactNode[] = [];

  // Count total slides to pass to each
  let total = 7; // title + 5 data slides + group performance
  if (hasSentiment) total += 1;

  let n = 1;

  // 1. Title
  slides.push(
    <TitleSlide
      key="title"
      businessName={data.businessName}
      scanDate={data.scanDate}
      city={data.city}
    />,
  );

  // 2. KPI Scorecard
  slides.push(
    <KpiScorecardSlide
      key="kpi"
      visibilityMetrics={data.visibilityMetrics}
      avgRank={data.avgRank}
      firstPlaceCount={data.firstPlaceCount}
      sentimentScore={data.sentimentScore}
      slideNumber={++n}
      totalSlides={total}
    />,
  );

  // 3. Visibility Trend
  slides.push(
    <VisibilityTrendSlide
      key="trend"
      sessionChartData={data.sessionChartData}
      slideNumber={++n}
      totalSlides={total}
    />,
  );

  // 4. Platform Breakdown
  slides.push(
    <PlatformBreakdownSlide
      key="platform"
      visibilityMetrics={data.visibilityMetrics}
      slideNumber={++n}
      totalSlides={total}
    />,
  );

  // 5. Competitive Landscape
  slides.push(
    <CompetitiveLandscapeSlide
      key="competitive"
      shareOfVoice={data.shareOfVoice}
      competitorVisibility={data.competitorVisibility}
      businessName={data.businessName}
      slideNumber={++n}
      totalSlides={total}
    />,
  );

  // 6. Citations & Prominence
  slides.push(
    <CitationsProminenceSlide
      key="citations"
      topCitations={data.topCitations}
      avgRank={data.avgRank}
      firstPlaceCount={data.firstPlaceCount}
      slideNumber={++n}
      totalSlides={total}
    />,
  );

  // 7. Sentiment (conditional)
  if (hasSentiment) {
    slides.push(
      <SentimentSlide
        key="sentiment"
        sentimentNarratives={data.sentimentNarratives}
        slideNumber={++n}
        totalSlides={total}
      />,
    );
  }

  // 8. Group Performance
  slides.push(
    <GroupPerformanceSlide
      key="groups"
      groupBarData={data.groupBarData}
      slideNumber={++n}
      totalSlides={total}
    />,
  );

  return slides;
}
