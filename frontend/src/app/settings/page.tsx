"use client";

import { useEffect, useState } from "react";
import { getSettings, updateSettings, getLanguages } from "@/lib/api";
import type { AppSettings, Language } from "@/lib/types";
import { Save, Key, Check, ExternalLink } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [languages, setLanguages] = useState<Record<string, Language>>({});
  const [apiKey, setApiKey] = useState("");
  const [defaultSource, setDefaultSource] = useState("ko");
  const [defaultTarget, setDefaultTarget] = useState("en");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getSettings(), getLanguages()]).then(([s, l]) => {
      setSettings(s);
      setLanguages(l);
      setDefaultSource(s.default_source_lang);
      setDefaultTarget(s.default_target_lang);
    }).catch((e) => setError("Failed to load settings. Is the backend running?"));
  }, []);

  async function handleSave() {
    try {
      const data: Record<string, string> = {};
      if (apiKey) data.anthropic_api_key = apiKey;
      data.default_source_lang = defaultSource;
      data.default_target_lang = defaultTarget;
      const updated = await updateSettings(data);
      setSettings(updated);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError("Failed to save: " + (e as Error).message);
    }
  }

  if (error) return <div className="text-center py-20 text-red-400">{error}</div>;
  if (!settings) return <div className="text-center py-20 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* API Key */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><Key size={16} /> Claude API Key</h2>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${settings.has_api_key ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-xs text-gray-400">{settings.has_api_key ? "API key configured" : "No API key set"}</span>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.has_api_key ? "Enter new key to update..." : "sk-ant-..."}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-gray-600 mt-1">Model: {settings.claude_model}</p>
        </div>

        {/* Default languages */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium mb-3">Default Languages</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Source</label>
              <select value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {Object.entries(languages).map(([c, l]) => (<option key={c} value={c}>{l.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Target</label>
              <select value={defaultTarget} onChange={(e) => setDefaultTarget(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {Object.entries(languages).map(([c, l]) => (<option key={c} value={c}>{l.name}</option>))}
              </select>
            </div>
          </div>
        </div>

        {/* Save */}
        <button onClick={handleSave} className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2">
          {saved ? (<><Check size={16} /> Saved!</>) : (<><Save size={16} /> Save Settings</>)}
        </button>

        {/* Support */}
        <div className="text-center pt-4 border-t border-gray-800">
          <a href="https://ko-fi.com/therealsenzu" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300">
            <ExternalLink size={14} /> Support MangaLens on Ko-fi
          </a>
        </div>
      </div>
    </div>
  );
}
