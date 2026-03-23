import { SlideLayout } from "../components/slide-layout";

interface WhatIsAiVisibilitySlideProps {
  slideNumber: number;
  totalSlides: number;
}

export function WhatIsAiVisibilitySlide({ slideNumber, totalSlides }: WhatIsAiVisibilitySlideProps) {
  return (
    <SlideLayout
      title="How Search Changed"
      subtitle="Two different systems, two different rules"
      slideNumber={slideNumber}
      totalSlides={totalSlides}
    >
      <div className="h-full flex flex-col justify-center">
        <div className="grid grid-cols-2 gap-10 w-full max-w-5xl mx-auto mb-10">
          {/* The Old Model */}
          <div className="p-8 rounded-2xl border border-gray-200 bg-gray-50/50">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">The Old Model</p>
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Crawl <span className="text-gray-300 mx-1">&rarr;</span> Index <span className="text-gray-300 mx-1">&rarr;</span> Rank
            </h3>
            <div className="space-y-3 text-gray-600 leading-relaxed">
              <p>Google crawls your page</p>
              <p>Stores it in an index</p>
              <p>Ranks it for keywords</p>
              <p>User clicks to visit your site</p>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">Success metric: <span className="font-semibold text-gray-700">traffic</span></p>
            </div>
          </div>

          {/* The New Model */}
          <div className="p-8 rounded-2xl border-2 border-[#ff5800]/30 bg-orange-50/30">
            <p className="text-xs font-bold uppercase tracking-widest text-[#ff5800] mb-4">The New Model</p>
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Retrieve <span className="text-gray-300 mx-1">&rarr;</span> Synthesize <span className="text-gray-300 mx-1">&rarr;</span> Generate
            </h3>
            <div className="space-y-3 text-gray-600 leading-relaxed">
              <p>LLM retrieves from multiple sources</p>
              <p>Synthesizes an answer</p>
              <p>Cites brands it trusts</p>
              <p>User may never click at all</p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#ff5800]/20">
              <p className="text-sm text-gray-500">Success metric: <span className="font-semibold text-[#ff5800]">influence</span></p>
            </div>
          </div>
        </div>

        <p className="text-center text-gray-500 italic max-w-2xl mx-auto">
          This is not an algorithm update. This is a product change and a user behavior shift.
        </p>
      </div>
    </SlideLayout>
  );
}
