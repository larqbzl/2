import { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  Trash2,
} from "lucide-react";

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { toast } = useToast();

  const [pexelsInput, setPexelsInput] = useState("");
  const [pixabayInput, setPixabayInput] = useState("");
  const [serpApiInput, setSerpApiInput] = useState("");

  const [showPexels, setShowPexels] = useState(false);
  const [showPixabay, setShowPixabay] = useState(false);
  const [showSerpApi, setShowSerpApi] = useState(false);

  const [savingPexels, setSavingPexels] = useState(false);
  const [savingPixabay, setSavingPixabay] = useState(false);
  const [savingSerpApi, setSavingSerpApi] = useState(false);

  const [testingPexels, setTestingPexels] = useState(false);
  const [testingPixabay, setTestingPixabay] = useState(false);
  const [testingSerpApi, setTestingSerpApi] = useState(false);

  const savePexels = async () => {
    if (!pexelsInput.trim()) return;
    setSavingPexels(true);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pexelsKey: pexelsInput.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        updateSettings({ pexelsKeySet: data.pexelsSet });
        setPexelsInput("");
        toast({ title: "Pexels key saved" });
      } else {
        toast({ title: "Failed to save Pexels key", variant: "destructive" });
      }
    } catch {
      toast({ title: "Server unreachable", variant: "destructive" });
    } finally {
      setSavingPexels(false);
    }
  };

  const savePixabay = async () => {
    if (!pixabayInput.trim()) return;
    setSavingPixabay(true);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixabayKey: pixabayInput.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        updateSettings({ pixabayKeySet: data.pixabaySet });
        setPixabayInput("");
        toast({ title: "Pixabay key saved" });
      } else {
        toast({ title: "Failed to save Pixabay key", variant: "destructive" });
      }
    } catch {
      toast({ title: "Server unreachable", variant: "destructive" });
    } finally {
      setSavingPixabay(false);
    }
  };

  const saveSerpApi = async () => {
    if (!serpApiInput.trim()) return;
    setSavingSerpApi(true);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serpApiKey: serpApiInput.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        updateSettings({ serpApiKeySet: data.serpApiSet });
        setSerpApiInput("");
        toast({ title: "SerpApi key saved" });
      } else {
        toast({ title: "Failed to save SerpApi key", variant: "destructive" });
      }
    } catch {
      toast({ title: "Server unreachable", variant: "destructive" });
    } finally {
      setSavingSerpApi(false);
    }
  };

  const clearKey = async (which: "pexels" | "pixabay" | "serpapi") => {
    try {
      const r = await fetch(`/api/keys?which=${which}`, { method: "DELETE" });
      if (r.ok) {
        if (which === "pexels") updateSettings({ pexelsKeySet: false });
        else if (which === "pixabay") updateSettings({ pixabayKeySet: false });
        else updateSettings({ serpApiKeySet: false });
        const labels: Record<string, string> = { pexels: "Pexels", pixabay: "Pixabay", serpapi: "SerpApi" };
        toast({ title: `${labels[which]} key cleared` });
      }
    } catch {
      toast({ title: "Server unreachable", variant: "destructive" });
    }
  };

  const testPexels = async () => {
    setTestingPexels(true);
    try {
      const r = await fetch("/api/proxy/pexels/test");
      const data = await r.json();
      if (data.valid) {
        toast({ title: "✅ Pexels key valid" });
      } else {
        toast({ title: "❌ Pexels key invalid", description: data.reason || `Status ${data.status}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "❌ Test failed — server unreachable", variant: "destructive" });
    } finally {
      setTestingPexels(false);
    }
  };

  const testPixabay = async () => {
    setTestingPixabay(true);
    try {
      const r = await fetch("/api/proxy/pixabay/test");
      const data = await r.json();
      if (data.valid) {
        toast({ title: "✅ Pixabay key valid" });
      } else {
        toast({ title: "❌ Pixabay key invalid", description: data.reason || `Status ${data.status}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "❌ Test failed — server unreachable", variant: "destructive" });
    } finally {
      setTestingPixabay(false);
    }
  };

  const testSerpApi = async () => {
    setTestingSerpApi(true);
    try {
      const r = await fetch("/api/proxy/serpapi-images/test");
      const data = await r.json();
      if (data.valid) {
        toast({ title: "✅ SerpApi key valid", description: `Got ${data.images} image(s) in test query` });
      } else {
        toast({ title: "❌ SerpApi test failed", description: data.reason || `Status ${data.status}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "❌ Test failed — server unreachable", variant: "destructive" });
    } finally {
      setTestingSerpApi(false);
    }
  };

  const KeyStatusBadge = ({ set }: { set: boolean }) =>
    set ? (
      <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Saved
      </span>
    ) : (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <XCircle className="w-3.5 h-3.5" /> Not set
      </span>
    );

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold mb-1">Settings</h2>
        <p className="text-muted-foreground text-sm">
          API keys are stored on the server — never sent back to the browser.
        </p>
      </div>

      {/* API Keys */}
      <Card className="p-6 border-[#2a2a2a] bg-[#141414]">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-4 h-4 text-[#e85d04]" />
          <h3 className="text-lg font-semibold text-[#e85d04]">API Keys</h3>
        </div>

        <div className="space-y-6">

          {/* Pexels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="font-medium text-sm">Pexels API Key</label>
                <KeyStatusBadge set={settings.pexelsKeySet} />
              </div>
              <a href="https://pexels.com/api" target="_blank" rel="noreferrer" className="text-[#e85d04] text-xs hover:underline">
                Get free key →
              </a>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPexels ? "text" : "password"}
                  value={pexelsInput}
                  onChange={(e) => setPexelsInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") savePexels(); }}
                  placeholder={settings.pexelsKeySet ? "Enter new key to replace…" : "Paste your Pexels key here"}
                  className="pr-10 bg-[#1e1e1e] border-[#2a2a2a]"
                />
                <button type="button" onClick={() => setShowPexels((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPexels ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={savePexels} disabled={savingPexels || !pexelsInput.trim()} className="bg-[#e85d04] hover:bg-[#c84e03] text-white border-none">
                {savingPexels ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              {settings.pexelsKeySet && (
                <Button variant="outline" onClick={testPexels} disabled={testingPexels} className="border-[#2a2a2a]">
                  {testingPexels ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                </Button>
              )}
              {settings.pexelsKeySet && (
                <Button variant="ghost" size="icon" onClick={() => clearKey("pexels")} className="text-muted-foreground hover:text-red-400" title="Clear key">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Pixabay */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="font-medium text-sm">Pixabay API Key</label>
                <KeyStatusBadge set={settings.pixabayKeySet} />
              </div>
              <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" className="text-[#e85d04] text-xs hover:underline">
                Get free key →
              </a>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPixabay ? "text" : "password"}
                  value={pixabayInput}
                  onChange={(e) => setPixabayInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") savePixabay(); }}
                  placeholder={settings.pixabayKeySet ? "Enter new key to replace…" : "Paste your Pixabay key here"}
                  className="pr-10 bg-[#1e1e1e] border-[#2a2a2a]"
                />
                <button type="button" onClick={() => setShowPixabay((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPixabay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={savePixabay} disabled={savingPixabay || !pixabayInput.trim()} className="bg-[#e85d04] hover:bg-[#c84e03] text-white border-none">
                {savingPixabay ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              {settings.pixabayKeySet && (
                <Button variant="outline" onClick={testPixabay} disabled={testingPixabay} className="border-[#2a2a2a]">
                  {testingPixabay ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                </Button>
              )}
              {settings.pixabayKeySet && (
                <Button variant="ghost" size="icon" onClick={() => clearKey("pixabay")} className="text-muted-foreground hover:text-red-400" title="Clear key">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* SerpApi */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="font-medium text-sm">SerpApi Key</label>
                <KeyStatusBadge set={settings.serpApiKeySet} />
              </div>
              <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer" className="text-[#e85d04] text-xs hover:underline">
                Get free key →
              </a>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Used for{" "}
              <a href="https://serpapi.com/google-images-api" target="_blank" rel="noreferrer" className="text-[#e85d04] hover:underline">
                Google Images results
              </a>
              . Free plan: 100 searches/month, no card required.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showSerpApi ? "text" : "password"}
                  value={serpApiInput}
                  onChange={(e) => setSerpApiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveSerpApi(); }}
                  placeholder={settings.serpApiKeySet ? "Enter new key to replace…" : "Paste your SerpApi key here"}
                  className="pr-10 bg-[#1e1e1e] border-[#2a2a2a]"
                />
                <button type="button" onClick={() => setShowSerpApi((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSerpApi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={saveSerpApi} disabled={savingSerpApi || !serpApiInput.trim()} className="bg-[#e85d04] hover:bg-[#c84e03] text-white border-none">
                {savingSerpApi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              {settings.serpApiKeySet && (
                <Button variant="outline" onClick={testSerpApi} disabled={testingSerpApi} className="border-[#2a2a2a]">
                  {testingSerpApi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                </Button>
              )}
              {settings.serpApiKeySet && (
                <Button variant="ghost" size="icon" onClick={() => clearKey("serpapi")} className="text-muted-foreground hover:text-red-400" title="Clear key">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

        </div>
      </Card>

      {/* Search Preferences */}
      <Card className="p-6 border-[#2a2a2a] bg-[#141414]">
        <h3 className="text-lg font-semibold mb-5 text-[#e85d04]">Search Preferences</h3>
        <div className="space-y-6">
          <div>
            <label className="font-medium text-sm block mb-2">Default Quality Filter</label>
            <div className="flex gap-4">
              {(["1080p+", "any"] as const).map((q) => (
                <label key={q} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={settings.defaultQuality === q}
                    onChange={() => updateSettings({ defaultQuality: q })}
                    className="accent-[#e85d04]"
                  />
                  <span className="text-sm">{q === "1080p+" ? "1080p minimum" : "Any quality"}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2 text-sm">
              <label className="font-medium">Results Per Source</label>
              <span className="text-muted-foreground">{settings.resultsPerSource} items</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={settings.resultsPerSource}
              onChange={(e) => updateSettings({ resultsPerSource: parseInt(e.target.value) })}
              className="w-full accent-[#e85d04]"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1</span><span>5</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="font-medium text-sm">Auto-mode Default</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoModeDefault}
                onChange={(e) => updateSettings({ autoModeDefault: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#2a2a2a] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e85d04]" />
            </label>
          </div>
        </div>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Files download to your browser's default Downloads folder
      </p>
    </div>
  );
}
