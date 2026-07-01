import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Film } from "lucide-react";
import BatchPhotoSection from "./BatchPhotoSection";
import BatchVideoSection from "./BatchVideoSection";

type BatchMode = "photos" | "videos";

export default function BatchTab() {
  const [mode, setMode] = useState<BatchMode>("photos");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="max-w-5xl mx-auto flex gap-2">
        <Button
          variant={mode === "photos" ? "default" : "outline"}
          onClick={() => setMode("photos")}
          className={`rounded-full gap-1.5 ${
            mode === "photos"
              ? "bg-[#e85d04] hover:bg-[#c84e03] border-none text-white"
              : "border-[#2a2a2a] text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Photos
        </Button>
        <Button
          variant={mode === "videos" ? "default" : "outline"}
          onClick={() => setMode("videos")}
          className={`rounded-full gap-1.5 ${
            mode === "videos"
              ? "bg-[#e85d04] hover:bg-[#c84e03] border-none text-white"
              : "border-[#2a2a2a] text-muted-foreground hover:text-foreground"
          }`}
        >
          <Film className="w-4 h-4" /> Videos
        </Button>
      </div>

      {/* Both sub-sections stay mounted so switching Photos/Videos doesn't reset state */}
      <div style={{ display: mode === "photos" ? "block" : "none" }}>
        <BatchPhotoSection />
      </div>
      <div style={{ display: mode === "videos" ? "block" : "none" }}>
        <BatchVideoSection />
      </div>
    </div>
  );
}
