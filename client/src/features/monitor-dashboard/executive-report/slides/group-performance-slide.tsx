import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SlideLayout } from "../components/slide-layout";

interface GroupPerformanceSlideProps {
  groupBarData: { name: string; fullName: string; visibility: number; total: number }[];
  slideNumber: number;
  totalSlides: number;
}

const COLORS = ["#5599f9", "#ffb41c", "#22c55e", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

export function GroupPerformanceSlide({ groupBarData, slideNumber, totalSlides }: GroupPerformanceSlideProps) {
  const sortedData = [...groupBarData].sort((a, b) => b.visibility - a.visibility);
  const barSize = sortedData.length > 15 ? 20 : sortedData.length > 10 ? 26 : 32;

  return (
    <SlideLayout title="Service Group Performance" subtitle="Visibility breakdown by service category" slideNumber={slideNumber} totalSlides={totalSlides}>
      {sortedData.length > 0 ? (
        <div className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <YAxis
                type="category"
                dataKey="fullName"
                tick={{ fontSize: 12 }}
                width={150}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
                formatter={(value: number) => [`${value}%`, "Visibility"]}
              />
              <Bar dataKey="visibility" radius={[0, 6, 6, 0]} maxBarSize={barSize}>
                {sortedData.map((_entry, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-gray-400 text-lg pt-8">No service group data available</p>
      )}
    </SlideLayout>
  );
}
