import { useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
  onGoToSlide: (index: number) => void;
  onClose: () => void;
}

export function SlideNavigation({ currentSlide, totalSlides, onPrevious, onNext, onGoToSlide, onClose }: SlideNavigationProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        onPrevious();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        onNext();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [onPrevious, onNext, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-6 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-md border border-gray-200 transition-colors"
        aria-label="Close presentation"
      >
        <X className="w-5 h-5 text-gray-500" />
      </button>

      {/* Navigation arrows */}
      {currentSlide > 0 && (
        <button
          onClick={onPrevious}
          className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-md border border-gray-200 transition-all hover:shadow-lg"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
      )}
      {currentSlide < totalSlides - 1 && (
        <button
          onClick={onNext}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-md border border-gray-200 transition-all hover:shadow-lg"
          aria-label="Next slide"
        >
          <ChevronRight className="w-6 h-6 text-gray-600" />
        </button>
      )}

      {/* Progress dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <button
            key={i}
            onClick={() => onGoToSlide(i)}
            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
              i === currentSlide ? "bg-[#5599f9] w-6" : "bg-gray-300 w-2 hover:bg-gray-400"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </>
  );
}
