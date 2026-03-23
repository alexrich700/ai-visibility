import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { SlideLayout } from "../components/slide-layout";
import type { SessionChartDataPoint } from "../../selectors";

interface VisibilityTrendSlideProps {
  sessionChartData: SessionChartDataPoint[];
  slideNumber: number;
  totalSlides: number;
}

export function VisibilityTrendSlide({ sessionChartData, slideNumber, totalSlides }: VisibilityTrendSlideProps) {
  return (
    <SlideLayout title="Visibility Trend" subtitle="AI visibility scores over time" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="flex-1 min-h-0 flex flex-col">
        {sessionChartData.length > 1 ? (
          <div className="w-full flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sessionChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="reportOverallGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff5800" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ff5800" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 13 }} stroke="#9ca3af" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 13 }} stroke="#9ca3af" tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
                  formatter={(value: number) => [`${value}%`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Area
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke="#ff5800"
                  strokeWidth={3}
                  fill="url(#reportOverallGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="chatgpt"
                  name="ChatGPT"
                  stroke="#ff5800"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  fill="none"
                />
                <Area
                  type="monotone"
                  dataKey="googleAI"
                  name="Google AI"
                  stroke="#ffb41c"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-400 text-lg">Not enough data points to display trend</p>
        )}
      </div>
    </SlideLayout>
  );
}
