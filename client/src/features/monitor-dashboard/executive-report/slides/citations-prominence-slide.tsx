import { Award, Link2 } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { Citation } from "../../selectors";

interface CitationsProminenceSlideProps {
  topCitations: Citation[];
  avgRank: number | null;
  firstPlaceCount: number;
  slideNumber: number;
  totalSlides: number;
}

export function CitationsProminenceSlide({
  topCitations,
  avgRank,
  firstPlaceCount,
  slideNumber,
  totalSlides,
}: CitationsProminenceSlideProps) {
  return (
    <SlideLayout title="Citations & Prominence" subtitle="Source authority and ranking position" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="grid grid-cols-2 gap-12 w-full">
          {/* Top Citations */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Link2 className="w-5 h-5 text-[#ffb41c]" />
              <h3 className="text-lg font-semibold text-gray-900">Top Cited Sources</h3>
            </div>
            {topCitations.length > 0 ? (
              <div className="space-y-3">
                {topCitations.slice(0, 8).map((citation, index) => (
                  <div key={citation.domain} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ffb41c]/10 flex items-center justify-center text-sm font-bold text-[#ffb41c]">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-700 truncate">{citation.domain}</span>
                    <span className="flex-shrink-0 px-3 py-1 bg-white rounded-full text-sm font-semibold text-gray-600 shadow-sm">
                      {citation.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No citations found</p>
            )}
          </div>

          {/* Prominence */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Award className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900">Prominence</h3>
            </div>
            <div className="space-y-8">
              <div className="bg-gray-50 rounded-2xl p-8">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Average Position</p>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-6xl font-bold text-gray-900">
                    {avgRank !== null ? avgRank.toFixed(1) : "—"}
                  </span>
                  {avgRank !== null && <span className="text-lg text-gray-500">avg rank</span>}
                </div>
                {avgRank !== null && (
                  <p className="text-sm text-gray-500 mt-2">
                    {avgRank <= 2 ? "Excellent positioning" : avgRank <= 4 ? "Good positioning" : "Room for improvement"}
                  </p>
                )}
              </div>

              <div className="bg-[#ffb41c]/5 rounded-2xl p-8">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">First Choice</p>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-6xl font-bold text-[#ffb41c]">{firstPlaceCount}</span>
                  <span className="text-lg text-gray-500">times ranked #1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
