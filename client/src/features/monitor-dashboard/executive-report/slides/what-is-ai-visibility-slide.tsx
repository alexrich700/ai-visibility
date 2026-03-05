import { MessageSquare, Search, BarChart3 } from "lucide-react";
import { SlideLayout } from "../components/slide-layout";

interface WhatIsAiVisibilitySlideProps {
  slideNumber: number;
  totalSlides: number;
}

const columns = [
  {
    icon: MessageSquare,
    iconBg: "bg-blue-50",
    iconColor: "text-[#5599f9]",
    title: "AI Answers Questions",
    description:
      "Millions of people now ask AI platforms like ChatGPT and Google AI Overview for recommendations instead of scrolling through search results.",
  },
  {
    icon: Search,
    iconBg: "bg-amber-50",
    iconColor: "text-[#ffb41c]",
    title: "Does Your Business Appear?",
    description:
      "When someone asks \"Who is the best plumber near me?\" or \"Top rated restaurants in Austin\" — is your business mentioned in the AI response?",
  },
  {
    icon: BarChart3,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    title: "We Measure & Optimize",
    description:
      "AI Visibility tracks how often AI mentions your business, your ranking position, citation rate, and sentiment — then optimizes to improve it.",
  },
];

export function WhatIsAiVisibilitySlide({ slideNumber, totalSlides }: WhatIsAiVisibilitySlideProps) {
  return (
    <SlideLayout title="What is AI Visibility?" subtitle="The new frontier of digital presence" slideNumber={slideNumber} totalSlides={totalSlides}>
      <div className="h-full flex items-center">
        <div className="grid grid-cols-3 gap-10 w-full max-w-5xl mx-auto">
          {columns.map((col, i) => (
            <div key={i} className="text-center">
              <div className={`w-16 h-16 rounded-2xl ${col.iconBg} flex items-center justify-center mx-auto mb-6`}>
                <col.icon className={`w-8 h-8 ${col.iconColor}`} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{col.title}</h3>
              <p className="text-gray-600 leading-relaxed">{col.description}</p>
            </div>
          ))}
        </div>
      </div>
    </SlideLayout>
  );
}
