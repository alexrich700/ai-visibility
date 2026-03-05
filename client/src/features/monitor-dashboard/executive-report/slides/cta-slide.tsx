import { Search, FileText, Globe } from "lucide-react";
import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";

interface CtaSlideProps {
  businessName: string;
}

const phases = [
  {
    icon: Search,
    phase: "Phase 1",
    title: "Audit and Foundation",
    timeline: "Month 1",
    items: [
      "Complete AI visibility audit across ChatGPT, Google AI, and Perplexity",
      "Map your products and services to the AI queries that matter",
      "Analyze why competitors are showing up and you're not",
      "Set up technical foundation for AI crawlers",
      "Audit content structure, headings, and internal linking",
    ],
  },
  {
    icon: FileText,
    phase: "Phase 2",
    title: "On Site",
    timeline: "Months 2 to 4",
    items: [
      "Build dedicated pages for each offering identified in audit",
      "Create review and reputation showcase pages",
      "Develop FAQ content that directly answers common AI queries",
      "Add comparison and listicle content to capture AI searches",
      "Restructure existing content with AI friendly formatting",
    ],
  },
  {
    icon: Globe,
    phase: "Phase 3",
    title: "Off Site",
    timeline: "Months 5+",
    items: [
      "Secure spots on industry best of lists and directories",
      "Build presence in Reddit and forums where your market lives",
      "Place competitor comparison content on third party sites",
      "Distribute press releases and media coverage",
      "Build high authority citations through outreach",
    ],
  },
];

export function CtaSlide({ businessName }: CtaSlideProps) {
  return (
    <div className="h-full flex flex-col pt-1.5">
      {/* Header */}
      <div className="flex-shrink-0 px-28 pt-6 pb-4">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          So What Would We Actually Do for {businessName}?
        </h1>
        <p className="text-gray-500 mt-1">
          Here's how we'd approach closing the gap... three phases, clear deliverables.
        </p>
      </div>

      {/* Phase cards */}
      <div className="flex-1 min-h-0 mx-28 mb-6 grid grid-cols-3 gap-6">
        {phases.map((phase) => (
          <div key={phase.phase} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
            {/* Phase header */}
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5599f9] to-[#ffb41c] flex items-center justify-center">
                <phase.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#5599f9]">{phase.phase}</p>
                <h3 className="text-lg font-bold text-gray-900 leading-tight">{phase.title}</h3>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4 italic">{phase.timeline}</p>

            {/* Items */}
            <div className="space-y-3 flex-1">
              {phase.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#5599f9] mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-gray-600 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="mx-28 mb-8">
        <div className="bg-gradient-to-r from-[#5599f9] to-[#ffb41c] rounded-2xl p-6">
          <div className="flex items-center justify-center gap-4">
            <img src={logoFull} alt="Logo" className="h-7 object-contain brightness-0 invert" />
            <div className="w-px h-7 bg-white/30" />
            <p className="text-white text-base font-medium">
              This is the playbook. Let's talk about making it happen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
