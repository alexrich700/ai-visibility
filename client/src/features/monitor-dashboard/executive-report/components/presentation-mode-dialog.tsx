import { useState } from "react";
import { Megaphone, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SLIDE_REGISTRY, getDefaultSlideIds } from "../executive-report-overlay";
import type { PresentationMode, ReportData, SlideConfig } from "../types";

interface PresentationModeDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (mode: PresentationMode, enabledSlides: string[]) => void;
  data: ReportData;
}

const MODE_OPTIONS = [
  {
    mode: "pitch" as const,
    icon: Megaphone,
    title: "New Client Pitch",
    description: "Introduce AI visibility and show opportunity gaps",
  },
  {
    mode: "progress" as const,
    icon: BarChart3,
    title: "Client Progress Report",
    description: "Show improvements and performance over time",
  },
];

export function PresentationModeDialog({ open, onClose, onStart, data }: PresentationModeDialogProps) {
  const [selectedMode, setSelectedMode] = useState<PresentationMode>("pitch");
  const [showCustomize, setShowCustomize] = useState(false);
  const [slideConfigs, setSlideConfigs] = useState<SlideConfig[]>(() =>
    buildSlideConfigs("pitch", data),
  );

  function buildSlideConfigs(mode: PresentationMode, reportData: ReportData): SlideConfig[] {
    const defaults = new Set(getDefaultSlideIds(mode, reportData));
    return SLIDE_REGISTRY
      .filter((s) => s.condition(reportData))
      .map((s) => ({
        id: s.id,
        label: s.label,
        enabled: defaults.has(s.id),
      }));
  }

  function handleModeChange(mode: PresentationMode) {
    setSelectedMode(mode);
    setSlideConfigs(buildSlideConfigs(mode, data));
  }

  function handleSlideToggle(id: string, checked: boolean) {
    setSlideConfigs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: checked } : s)),
    );
  }

  function handleStart() {
    const enabledSlides = slideConfigs.filter((s) => s.enabled).map((s) => s.id);
    onStart(selectedMode, enabledSlides);
  }

  const enabledCount = slideConfigs.filter((s) => s.enabled).length;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">
            Presentation Mode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Mode selector cards */}
          <div className="grid grid-cols-2 gap-3">
            {MODE_OPTIONS.map((opt) => {
              const isSelected = selectedMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => handleModeChange(opt.mode)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? "border-[#ff5800] bg-[#ff5800]/5"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <opt.icon className={`w-6 h-6 mb-3 ${isSelected ? "text-[#ff5800]" : "text-gray-400"}`} />
                  <h3 className={`font-semibold text-sm ${isSelected ? "text-[#ff5800]" : "text-gray-900"}`}>
                    {opt.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{opt.description}</p>
                </button>
              );
            })}
          </div>

          {/* Customize slides toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowCustomize(!showCustomize)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showCustomize ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Customize Slides ({enabledCount} selected)
            </button>

            {showCustomize && (
              <div className="mt-3 max-h-52 overflow-y-auto space-y-1 border rounded-lg p-3">
                {slideConfigs.map((slide) => (
                  <label
                    key={slide.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={slide.enabled}
                      onCheckedChange={(checked) => handleSlideToggle(slide.id, checked === true)}
                    />
                    <span className="text-sm text-gray-700">{slide.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Start button */}
          <Button
            onClick={handleStart}
            disabled={enabledCount === 0}
            className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white"
          >
            Start Presentation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
