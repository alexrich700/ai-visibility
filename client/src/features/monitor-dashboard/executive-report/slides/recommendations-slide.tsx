import { Lightbulb, Eye, Link2, Monitor, MessageSquare, ArrowUpRight } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";
import type { ReportData } from "../types";

interface RecommendationsSlideProps {
  data: ReportData;
  slideNumber: number;
  totalSlides: number;
}

interface Recommendation {
  icon: React.ElementType;
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
}

function generateRecommendations(data: ReportData): Recommendation[] {
  const recs: Recommendation[] = [];
  const { visibilityRate, citationRate, chatgptVisibility, googleAIVisibility } = data.visibilityMetrics;

  if (visibilityRate < 50) {
    recs.push({
      icon: Eye,
      title: "Boost AI Visibility",
      description: `Your visibility rate is ${visibilityRate}%. Focus on structured content optimization, authoritative source building, and ensuring consistent NAP data to increase AI mentions.`,
      priority: "High",
    });
  }

  if (citationRate < 30) {
    recs.push({
      icon: Link2,
      title: "Improve Citation Rate",
      description: `Only ${citationRate}% of AI responses cite your business directly. Strengthen backlink profiles, add structured data markup, and build authoritative content to drive more citations.`,
      priority: citationRate < 15 ? "High" : "Medium",
    });
  }

  const platformGap = Math.abs(chatgptVisibility - googleAIVisibility);
  if (platformGap > 15) {
    const weaker = chatgptVisibility < googleAIVisibility ? "ChatGPT" : "Google AI";
    const stronger = chatgptVisibility < googleAIVisibility ? "Google AI" : "ChatGPT";
    const weakerScore = chatgptVisibility < googleAIVisibility ? chatgptVisibility : googleAIVisibility;
    const strongerScore = chatgptVisibility < googleAIVisibility ? googleAIVisibility : chatgptVisibility;
    recs.push({
      icon: Monitor,
      title: `Close the ${weaker} Gap`,
      description: `Your ${weaker} visibility (${weakerScore}%) lags behind ${stronger} (${strongerScore}%). Platform-specific optimization strategies can help balance your AI presence.`,
      priority: "Medium",
    });
  }

  if (data.bottomPrompts.length > 0) {
    const missing = data.bottomPrompts.filter((p) => !p.chatgptFound && !p.googleAIFound);
    const count = missing.length || data.bottomPrompts.length;
    const sample = (missing.length > 0 ? missing : data.bottomPrompts).slice(0, 2).map((p) => `"${p.promptText.length > 50 ? p.promptText.slice(0, 47) + "..." : p.promptText}"`).join(" and ");
    recs.push({
      icon: MessageSquare,
      title: "Address Weak Queries",
      description: `${count} search queries show poor performance, including ${sample}. Create targeted content aligned with these specific queries.`,
      priority: count > 3 ? "High" : "Medium",
    });
  }

  if (data.sentimentNarratives?.improvements && data.sentimentNarratives.improvements.length > 0) {
    recs.push({
      icon: ArrowUpRight,
      title: "Improve Brand Perception",
      description: `AI has identified areas for improvement in brand sentiment. Address customer feedback themes to strengthen how AI portrays your brand.`,
      priority: "Low",
    });
  }

  if (recs.length === 0) {
    recs.push({
      icon: Lightbulb,
      title: "Maintain Your Strong Position",
      description: "Your AI visibility metrics are solid. Continue monitoring and optimizing to stay ahead of competitors.",
      priority: "Low",
    });
  }

  return recs.slice(0, 5);
}

const priorityStyles = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-green-50 text-green-700 border-green-200",
};

export function RecommendationsSlide({ data, slideNumber, totalSlides }: RecommendationsSlideProps) {
  const recommendations = generateRecommendations(data);

  return (
    <SlideLayout title="Recommendations" subtitle="Data-driven next steps for improvement" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="w-full max-w-4xl mx-auto space-y-5">
          {recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-5 p-5 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#5599f9]/10 flex items-center justify-center">
                <rec.icon className="w-5 h-5 text-[#5599f9]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priorityStyles[rec.priority]}`}>
                    {rec.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{rec.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideLayout>
  );
}
