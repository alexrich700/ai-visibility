import logoFull from "@assets/RMG-Logo-Black-1920w_(1)_1765741951083.webp";
import type { PresentationMode } from "../types";

interface TitleSlideProps {
  businessName: string;
  scanDate: string | null;
  city: string | null;
  mode?: PresentationMode;
}

const SUBTITLE: Record<PresentationMode, string> = {
  pitch: "AI Visibility Audit",
  progress: "AI Visibility Progress Report",
};

export function TitleSlide({ businessName, scanDate, city, mode }: TitleSlideProps) {
  const subtitle = mode ? SUBTITLE[mode] : "AI Visibility Report";

  return (
    <div className="h-full flex flex-col items-center justify-center text-center pt-1.5">
      <img src={logoFull} alt="Logo" className="h-12 mb-12 object-contain" />

      <div className="h-1 w-40 bg-gradient-to-r from-[#5599f9] to-[#ffb41c] rounded-full mb-12" />

      <h1 className="text-6xl font-bold text-gray-900 tracking-tight mb-6">
        {businessName}
      </h1>

      <p className="text-2xl text-[#5599f9] font-medium mb-10">
        {subtitle}
      </p>

      <div className="flex items-center gap-4 text-gray-500">
        {scanDate && <span className="text-lg font-medium">{scanDate}</span>}
        {scanDate && city && <span className="text-gray-300">|</span>}
        {city && <span className="text-lg font-medium">{city}</span>}
      </div>
    </div>
  );
}
