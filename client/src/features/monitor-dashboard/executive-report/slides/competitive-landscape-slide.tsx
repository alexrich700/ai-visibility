import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SlideLayout } from "../components/slide-layout";
import type { CompetitorVisibility, ShareOfVoiceItem } from "../../selectors";

interface CompetitiveLandscapeSlideProps {
  shareOfVoice: ShareOfVoiceItem[];
  competitorVisibility: CompetitorVisibility[];
  businessName: string;
  slideNumber: number;
  totalSlides: number;
}

const COLORS = ["#5599f9", "#ffb41c", "#22c55e", "#ef4444", "#8b5cf6", "#ec4899"];

export function CompetitiveLandscapeSlide({
  shareOfVoice,
  competitorVisibility,
  businessName,
  slideNumber,
  totalSlides,
}: CompetitiveLandscapeSlideProps) {
  return (
    <SlideLayout title="Competitive Landscape" subtitle="Share of voice and competitor visibility" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="grid grid-cols-2 gap-10 h-full pt-2">
        {/* Share of Voice */}
        <div className="flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex-shrink-0">Share of Voice</h3>
          {shareOfVoice.length > 0 ? (
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shareOfVoice} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                    formatter={(value: number) => [`${value}%`, "Share"]}
                  />
                  <Bar dataKey="percentage" radius={[0, 6, 6, 0]} maxBarSize={32}>
                    {shareOfVoice.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={entry.name.toLowerCase() === businessName.toLowerCase() ? "#5599f9" : COLORS[(index % (COLORS.length - 1)) + 1]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-400">No share of voice data</p>
          )}
        </div>

        {/* Competitor ranking */}
        <div className="flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex-shrink-0">Top Competitors</h3>
          {competitorVisibility.length > 0 ? (
            <div className="space-y-4">
              {competitorVisibility.map((competitor, index) => (
                <div key={competitor.name} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-600">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{competitor.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gray-400"
                          style={{ width: `${Math.min(competitor.visibilityPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-600 flex-shrink-0">{competitor.visibilityPercent}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No competitor data</p>
          )}
        </div>
      </div>
    </SlideLayout>
  );
}
