import logoIcon from "@assets/BBM-Primary-Logo-300x69_1775234014796.png";

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
        {/* Top bar: logo left, slide counter right */}
        <div className="flex-shrink-0 flex items-center justify-between px-8 pt-5 pb-0">
          <img src={logoIcon} alt="Building Brands Marketing" className="h-5 object-contain opacity-60" />
          <span className="text-xs text-gray-400 font-medium">
            {slideNumber} / {totalSlides}
          </span>
        </div>

        {/* Centered title block — the "action title" */}
        {title && (
          <div className="flex-shrink-0 text-center px-16 pt-3 pb-5">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">{title}</h2>
            {subtitle && <p className="text-lg text-gray-500 mt-1">{subtitle}</p>}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-h-0 px-8 pb-8 flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
