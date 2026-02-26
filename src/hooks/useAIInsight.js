import { useState, useCallback } from "react";

// Use Vite's dev proxy (/api → localhost:5000) in dev,
// or VITE_BACKEND_URL for production deployments.
const BACKEND =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.DEV ? "" : "http://localhost:5000");

/**
 * useAIInsight — sends field metrics to the SkyFarm backend, which proxies
 * them to OpenAI GPT and returns a data-driven agronomic solution.
 *
 * Usage:
 *   const { solution, loading, error, fetchInsight } = useAIInsight();
 *   fetchInsight('water', { crop, stressScore, soilMoisture, … });
 *
 * Pages: 'water' | 'nutrient' | 'global' | 'analyze'
 */
export default function useAIInsight() {
  const [solution, setSolution] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [model, setModel] = useState(null);

  const fetchInsight = useCallback(async (page, data) => {
    setLoading(true);
    setError(null);
    setSolution(null);
    try {
      const res = await fetch(`${BACKEND}/api/ai-insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, data }),
      });

      // Safely read body — guard against empty/HTML responses
      const raw = await res.text();
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        // Response was not JSON (e.g. proxy 502/504 HTML page)
        throw new Error(
          `Server returned non-JSON response (HTTP ${res.status}). ` +
            (res.status === 502 || res.status === 504
              ? "Backend may be down — run: cd backend && npm start"
              : raw.slice(0, 120)),
        );
      }

      if (!res.ok)
        throw new Error(
          json.error || `Request failed with status ${res.status}`,
        );
      if (!json.solution)
        throw new Error("OpenAI returned an empty solution. Try again.");

      setSolution(json.solution);
      setModel(json.model || null);
    } catch (e) {
      const msg = e.message || "";
      if (
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("networkerror") ||
        msg.toLowerCase().includes("load failed")
      ) {
        setError(
          "⚠️ Cannot reach backend. Make sure it is running: cd backend && npm start",
        );
      } else {
        setError(msg || "Failed to get AI insight");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSolution(null);
    setError(null);
    setModel(null);
  }, []);

  return { solution, loading, error, model, fetchInsight, clear };
}
