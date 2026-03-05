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
      {/* White card container with header inside */}
      <div className="flex-1 min-h-0 mx-28 mt-6 mb-16 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-y-auto flex flex-col">
        {/* Header row */}
        <div className="flex-shrink-0 flex items-center justify-between px-8 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="Logo" className="w-8 h-8" />
            {title && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
                {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
              </div>
            )}
          </div>
          <span className="text-sm text-gray-400 font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
            {slideNumber} / {totalSlides}
          </span>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 px-8 pb-8 flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
