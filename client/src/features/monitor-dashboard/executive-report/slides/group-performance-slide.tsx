import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SlideLayout } from "../components/slide-layout";
import type { PresentationMode } from "../types";

interface GroupPerformanceSlideProps {
  groupBarData: { name: string; fullName: string; visibility: number; total: number }[];
  slideNumber: number;
  totalSlides: number;
  mode?: PresentationMode;
}

const COLORS = ["#5599f9", "#ffb41c", "#22c55e", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

export function GroupPerformanceSlide({ groupBarData, slideNumber, totalSlides, mode }: GroupPerformanceSlideProps) {
  const sortedData = [...groupBarData].sort((a, b) => b.visibility - a.visibility);

  const isPitch = mode === "pitch";
  const title = isPitch ? "Not All Services Are Performing Equal" : "Service Group Performance";
  const subtitle = isPitch
    ? "Some of your offerings are showing up in AI results... others aren't even close"
    : "Visibility breakdown by service category";

  return (
    <SlideLayout title={title} subtitle={subtitle} slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="flex-1 min-h-0 flex flex-col">
        {sortedData.length > 0 ? (
          <div className="w-full flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedData} layout="vertical" margin={{ left: 20, right: 40, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <YAxis
                  type="category"
                  dataKey="fullName"
                  tick={{ fontSize: 13 }}
                  width={160}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                  formatter={(value: number) => [`${value}%`, "Visibility"]}
                />
                <Bar dataKey="visibility" radius={[0, 8, 8, 0]} maxBarSize={36}>
                  {sortedData.map((_entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-400 text-lg">No service group data available</p>
        )}
      </div>
    </SlideLayout>
  );
}
