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
    <div className="h-full flex flex-col pt-1.5">
      {/* Header outside the card */}
      <div className="flex-shrink-0 flex items-center justify-between px-28 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <img src={logoIcon} alt="Logo" className="w-8 h-8" />
          {title && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
            </div>
          )}
        </div>
        <span className="text-sm text-gray-400 font-medium bg-white px-3 py-1 rounded-full border border-gray-200">
          {slideNumber} / {totalSlides}
        </span>
      </div>

      {/* White card container */}
      <div className="flex-1 mx-28 mb-16 bg-white rounded-2xl shadow-sm border border-gray-200 p-8 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
