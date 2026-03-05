import { TrendingUp, Users, Zap } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";

interface WhyGeoMattersSlideProps {
  slideNumber: number;
  totalSlides: number;
}

const stats = [
  { value: "65%", label: "of consumers have used AI to find local businesses", icon: Users },
  { value: "4x", label: "higher engagement when businesses are AI-recommended", icon: TrendingUp },
  { value: "40%", label: "of search queries now trigger AI overviews", icon: Zap },
];

export function WhyGeoMattersSlide({ slideNumber, totalSlides }: WhyGeoMattersSlideProps) {
  return (
    <SlideLayout title="Why GEO Matters" subtitle="Generative Engine Optimization is the next SEO" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="w-full max-w-5xl mx-auto space-y-12">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center p-6 bg-gray-50 rounded-2xl border border-gray-100">
                <stat.icon className="w-6 h-6 text-[#5599f9] mx-auto mb-3" />
                <p className="text-4xl font-bold text-gray-900 mb-2">{stat.value}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Before / After comparison */}
          <div className="grid grid-cols-2 gap-8">
            <div className="p-8 rounded-2xl border-2 border-red-100 bg-red-50/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <h3 className="text-lg font-bold text-red-700">Without GEO</h3>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">&#x2717;</span>
                  <span>Invisible to AI-powered recommendations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">&#x2717;</span>
                  <span>Competitors capture AI-driven leads</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">&#x2717;</span>
                  <span>No insight into AI perception of your brand</span>
                </li>
              </ul>
            </div>
            <div className="p-8 rounded-2xl border-2 border-green-100 bg-green-50/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <h3 className="text-lg font-bold text-green-700">With GEO</h3>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#x2713;</span>
                  <span>Recommended by AI when customers ask</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#x2713;</span>
                  <span>Higher ranking and citation rates in AI responses</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#x2713;</span>
                  <span>Data-driven optimization of your AI presence</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
