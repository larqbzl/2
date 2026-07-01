import { useState, useEffect } from "react";

export type Settings = {
  defaultQuality: "1080p+" | "any";
  resultsPerSource: number;
  autoModeDefault: boolean;
  // Key presence flags — actual values live on server, never in browser
  pexelsKeySet: boolean;
  pixabayKeySet: boolean;
  serpApiKeySet: boolean;
};

const defaultSettings: Settings = {
  defaultQuality: "1080p+",
  resultsPerSource: 3,
  autoModeDefault: true,
  pexelsKeySet: false,
  pixabayKeySet: false,
  serpApiKeySet: false,
};

const STORAGE_KEY = "media_finder_settings_v4";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch {}
    return defaultSettings;
  });

  // On mount, fetch actual key status from server
  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((data) => {
        setSettings((prev) => ({
          ...prev,
          pexelsKeySet: Boolean(data.pexelsSet),
          pixabayKeySet: Boolean(data.pixabaySet),
          serpApiKeySet: Boolean(data.serpApiSet),
        }));
      })
      .catch(() => {});
  }, []);

  // Persist non-key settings to localStorage
  useEffect(() => {
    const { pexelsKeySet: _p, pixabayKeySet: _px, serpApiKeySet: _s, ...toSave } = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [settings]);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const refreshKeyStatus = async () => {
    try {
      const r = await fetch("/api/keys");
      const data = await r.json();
      setSettings((prev) => ({
        ...prev,
        pexelsKeySet: Boolean(data.pexelsSet),
        pixabayKeySet: Boolean(data.pixabaySet),
        serpApiKeySet: Boolean(data.serpApiSet),
      }));
    } catch {}
  };

  return { settings, updateSettings, refreshKeyStatus };
}
