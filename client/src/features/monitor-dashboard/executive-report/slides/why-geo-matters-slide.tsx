import { SlideLayout } from "../components/slide-layout";

interface WhyGeoMattersSlideProps {
  slideNumber: number;
  totalSlides: number;
}

export function WhyGeoMattersSlide({ slideNumber, totalSlides }: WhyGeoMattersSlideProps) {
  return (
    <SlideLayout
      title="Why This Matters for You"
      subtitle="The rules changed... and most businesses haven't caught up yet"
      slideNumber={slideNumber}
      totalSlides={totalSlides}
    >
      <div className="h-full flex flex-col justify-center">
        <div className="w-full max-w-5xl mx-auto space-y-10">
          {/* The shift explained conversationally */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
            <p className="text-lg text-gray-700 leading-relaxed">
              When someone asks ChatGPT or Google AI for a recommendation, the AI doesn't
              show ten blue links. It picks a few names it trusts and presents them as the answer.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed mt-4">
              If your business isn't one of those names... you're not in the running.
            </p>
          </div>

          {/* What's at stake - simple, clear */}
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-6 rounded-2xl border border-gray-100 bg-white">
              <p className="text-4xl font-bold text-gray-900 mb-2">65%</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                of consumers have used AI to find local businesses
              </p>
            </div>
            <div className="text-center p-6 rounded-2xl border border-gray-100 bg-white">
              <p className="text-4xl font-bold text-gray-900 mb-2">4x</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                higher engagement when a business is AI recommended
              </p>
            </div>
            <div className="text-center p-6 rounded-2xl border border-gray-100 bg-white">
              <p className="text-4xl font-bold text-gray-900 mb-2">40%</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                of search queries now trigger an AI generated overview
              </p>
            </div>
          </div>

          {/* Closing line */}
          <p className="text-center text-gray-500 italic">
            The businesses that figure this out first are the ones AI will recommend tomorrow.
          </p>
        </div>
      </div>
    </SlideLayout>
  );
}
