"use client";

import { useEffect, useState } from "react";
import { readTvDiagnostic, subscribeTvDiagnostic, type TvDiagnosticSnapshot } from "@/components/tv/tv-diagnostics";
import "./tv-diagnostics.css";

type Probe = {
  viewport: string;
  webgl: string;
  renderer: string;
  hero: string;
};

const EMPTY_PROBE: Probe = { viewport: "", webgl: "not checked", renderer: "", hero: "not checked" };

function readProbe(): Probe {
  const viewport = `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}`;
  const heroImage = document.querySelector<HTMLImageElement>(".fp-hero-slide.is-active img, .tv-stage img");
  let hero = "no hero image on this page";
  if (heroImage) {
    hero = heroImage.complete && heroImage.naturalWidth > 0 ? `loaded ${heroImage.currentSrc || heroImage.src}` : `waiting ${heroImage.currentSrc || heroImage.src}`;
  }
  const game = document.querySelector<HTMLCanvasElement>("[data-fitrunner-v2]");
  if (game?.dataset.webgl) {
    return { viewport, webgl: game.dataset.webgl, renderer: game.dataset.glRenderer || "", hero };
  }
  if (game) return { viewport, webgl: "game canvas present, context not marked", renderer: "", hero };
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return { viewport, webgl: "no WebGL context", renderer: "", hero };
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const version = String(gl.getParameter(gl.VERSION));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { viewport, webgl: version, renderer, hero };
}

export function TvDiagnosticsOverlay() {
  const [open, setOpen] = useState(false);
  const [probe, setProbe] = useState<Probe>(EMPTY_PROBE);
  const [link, setLink] = useState<TvDiagnosticSnapshot>(readTvDiagnostic());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let stored = false;
    try {
      if (params.get("tvdiag") === "1") sessionStorage.setItem("fp-tvdiag", "1");
      stored = sessionStorage.getItem("fp-tvdiag") === "1";
    } catch {
      stored = params.get("tvdiag") === "1";
    }
    if (stored) setOpen(true);
    function onKey(event: KeyboardEvent) {
      const code = event.keyCode || 0;
      if (event.key === "F8" || code === 457) setOpen((value) => !value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => subscribeTvDiagnostic(() => setLink(readTvDiagnostic())), []);

  useEffect(() => {
    if (!open) return;
    const tick = () => setProbe(readProbe());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return (
    <aside data-tv-diagnostics="" role="status" aria-label="Television diagnostics">
      <p>PlayFit diagnostics</p>
      <dl>
        <dt>JavaScript</dt>
        <dd>hydrated</dd>
        <dt>User agent</dt>
        <dd>{typeof navigator === "undefined" ? "" : navigator.userAgent}</dd>
        <dt>Viewport</dt>
        <dd>{probe.viewport}</dd>
        <dt>WebGL</dt>
        <dd>{probe.webgl}</dd>
        <dt>Renderer</dt>
        <dd>{probe.renderer || "—"}</dd>
        <dt>Hero image</dt>
        <dd>{probe.hero}</dd>
        <dt>Realtime</dt>
        <dd>{link.realtime}</dd>
        <dt>Session</dt>
        <dd>{link.session}</dd>
        <dt>Last error</dt>
        <dd>{link.lastError || "—"}</dd>
      </dl>
    </aside>
  );
}
