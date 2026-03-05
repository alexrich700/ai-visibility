import { ClipboardCheck, Settings, BarChart3 } from "lucide-react";
import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";

interface CtaSlideProps {
  businessName: string;
}

const steps = [
  {
    icon: ClipboardCheck,
    title: "Audit",
    description: "Comprehensive analysis of your current AI presence across all major platforms",
  },
  {
    icon: Settings,
    title: "Optimize",
    description: "Strategic content and technical optimizations to boost AI visibility and citations",
  },
  {
    icon: BarChart3,
    title: "Monitor & Grow",
    description: "Ongoing tracking with regular reports to measure progress and refine strategy",
  },
];

export function CtaSlide({ businessName }: CtaSlideProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center pt-1.5 px-12">
      <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">
        Let's Improve {businessName}'s AI Visibility
      </h1>
      <p className="text-lg text-gray-500 mb-14 max-w-2xl">
        A clear path to getting your business recommended by AI
      </p>

      <div className="grid grid-cols-3 gap-8 w-full max-w-4xl mb-16">
        {steps.map((step, i) => (
          <div key={i} className="relative">
            {/* Step number */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5599f9] to-[#ffb41c] flex items-center justify-center mx-auto mb-5">
              <span className="text-white font-bold">{i + 1}</span>
            </div>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="absolute top-5 left-[calc(50%+24px)] right-[calc(-50%+24px)] h-0.5 bg-gradient-to-r from-[#5599f9] to-[#ffb41c] opacity-30" />
            )}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
              <step.icon className="w-8 h-8 text-[#5599f9] mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-[#5599f9] to-[#ffb41c] rounded-2xl p-8 w-full max-w-3xl">
        <div className="flex items-center justify-center gap-4">
          <img src={logoFull} alt="Logo" className="h-8 object-contain brightness-0 invert" />
          <div className="w-px h-8 bg-white/30" />
          <p className="text-white text-lg font-medium">
            Ready to get started? Let's talk about your AI visibility strategy.
          </p>
        </div>
      </div>
    </div>
  );
}
