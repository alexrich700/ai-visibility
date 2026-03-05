import logoIcon from "@assets/images_1765741951084.png";

interface SlideLayoutProps {
  title?: string;
  subtitle?: string;
  slideNumber: number;
  totalSlides: number;
  children: React.ReactNode;
}

export function SlideLayout({ title, subtitle, slideNumber, totalSlides, children }: SlideLayoutProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Branded header bar */}
      <div className="flex-shrink-0 h-1.5 bg-gradient-to-r from-[#5599f9] to-[#ffb41c]" />

      {/* Header with logo and title */}
      <div className="flex-shrink-0 flex items-center justify-between px-16 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <img src={logoIcon} alt="Logo" className="w-8 h-8" />
          {title && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
            </div>
          )}
        </div>
        <span className="text-xs text-gray-400 font-medium">
          {slideNumber} / {totalSlides}
        </span>
      </div>

      {/* Slide content */}
      <div className="flex-1 min-h-0 px-16 pb-12 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
