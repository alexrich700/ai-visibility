import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { SlideLayout } from "../components/slide-layout";
import type { PresentationMode } from "../types";

interface CityMetric {
  city: string;
  visibilityRate: number;
  avgRank: number | null;
}

interface CityComparisonSlideProps {
  cityMetrics: CityMetric[];
  slideNumber: number;
  totalSlides: number;
  mode?: PresentationMode;
}

function getBarColor(rate: number): string {
  if (rate >= 60) return "#22c55e";
  if (rate >= 30) return "#ffb41c";
  return "#ef4444";
}

export function CityComparisonSlide({ cityMetrics, slideNumber, totalSlides, mode }: CityComparisonSlideProps) {
  const sorted = [...cityMetrics].sort((a, b) => b.visibilityRate - a.visibilityRate);
  const avg = sorted.length > 0
    ? Math.round(sorted.reduce((sum, c) => sum + c.visibilityRate, 0) / sorted.length)
    : 0;

  const isPitch = mode === "pitch";
  const title = isPitch ? "How Your Markets Compare" : "Visibility by Location";
  const subtitle = isPitch
    ? "AI visibility varies by location... some markets need more attention than others"
    : "AI visibility performance across tracked markets";

  return (
    <SlideLayout title={title} subtitle={subtitle} slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="w-full flex-1 min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ left: 20, right: 40, top: 30, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <YAxis
                type="category"
                dataKey="city"
                tick={{ fontSize: 14, fontWeight: 500 }}
                width={140}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                formatter={(value: number, _name: string, props: { payload?: CityMetric }) => {
                  const rank = props.payload?.avgRank;
                  return [
                    <span key="v">{value}% visibility{rank != null ? ` · Avg rank ${rank}` : ""}</span>,
                    "",
                  ];
                }}
              />
              <ReferenceLine x={avg} stroke="#9ca3af" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Avg ${avg}%`, position: "top", fontSize: 11, fill: "#9ca3af" }} />
              <Bar dataKey="visibilityRate" radius={[0, 8, 8, 0]} maxBarSize={36}>
                {sorted.map((entry, index) => (
                  <Cell key={index} fill={getBarColor(entry.visibilityRate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SlideLayout>
  );
}
