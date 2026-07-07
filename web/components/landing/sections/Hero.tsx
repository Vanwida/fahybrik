'use client';

// FAHYBRID landing — Hero ("Race Film").
//
// A cinematic full-viewport hero. Three stacked layers:
//   1. <RaceFilmCanvas/> — a WebGL (ogl) full-bleed fragment shader that GENERATES a
//      duotone black→orange "race film" grade: flowing fbm noise, drifting heat/embers,
//      horizontal motion-blur streaks (athletes in motion), film grain + vignette.
//      Slow, premium, mostly near-black. Pauses RAF when offscreen / tab hidden.
//      // TODO: real training footage — see `useVideo` swap-point below.
//   2. CSS fallback — ALWAYS in the DOM under the canvas (static dark gradient + grain +
//      bottom scrim). So the hero is intentional even if WebGL never initializes.
//   3. Foreground content (z-10) — eyebrow, kinetic h1, sub, CTAs, trust, scroll cue.
//
// SSR-safe: ogl is only ever touched inside useEffect, guarded for no-DOM. Reduced-motion
// or no-WebGL → the RAF/shader never inits; the CSS fallback carries the look.

import { Link } from '@/i18n/navigation';
import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Renderer, Triangle, Program, Mesh, type OGLRenderingContext } from 'ogl';

import { HERO, SECTION_IDS } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';
import { prefersReducedMotion } from '@/lib/landing/motion';
import { KineticHeadline } from '@/components/landing/primitives/KineticHeadline';
import { SectionLabel } from '@/components/landing/primitives/SectionLabel';
import { FahybridMark } from '@/components/landing/FahybridMark';
import { cn } from '@/lib/utils';

// ── Tunables ────────────────────────────────────────────────────────────────
// Cap device pixel ratio so the full-screen shader stays cheap on retina/4K.
const MAX_DPR = 2;
// How hard the scene parallax-drifts toward the cursor (0 = none, 1 = full).
const MOUSE_PARALLAX = 0.12;
// Eased follow factor for the mouse each frame (lerp toward target).
const MOUSE_EASE = 0.05;
// SWAP-POINT: flip to true + provide a <video> to texture real footage later.
// TODO: real training footage. When true, sample uTex instead of the generated grade.
const useVideo = false;

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = /* glsl */ `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Generative duotone "race film": flowing fbm, heat embers, horizontal motion streaks,
// film grain + vignette. Graded from near-black (--bg) to brand orange (--accent).
const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec2  uMouse;       // eased, normalized -1..1
  uniform vec3  uBg;          // near-black base
  uniform vec3  uAccent;      // brand orange

  varying vec2 vUv;

  // Hash / value-noise / fbm ----------------------------------------------------
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }

  // Time-animated grain
  float grain(vec2 uv, float t) {
    return hash(uv * uResolution.xy + t) - 0.5;
  }

  void main() {
    // Aspect-correct uv centered at 0; preserves circular vignette on any ratio.
    vec2 uv = vUv;
    vec2 p = (uv - 0.5);
    p.x *= uResolution.x / uResolution.y;

    float t = uTime * 0.06;

    // Parallax drift toward the cursor.
    vec2 drift = uMouse * ${MOUSE_PARALLAX.toFixed(3)};

    // Slow horizontal flow — the "film" advances mostly sideways (motion of athletes).
    vec2 flowUv = vec2(p.x * 1.6 - t * 1.2, p.y * 2.2 + t * 0.15) + drift;

    // Domain-warped fbm for organic, smoky movement.
    vec2 warp = vec2(
      fbm(flowUv + vec2(0.0, t)),
      fbm(flowUv + vec2(5.2, -t))
    );
    float n = fbm(flowUv + warp * 1.4);

    // Horizontal motion-blur streaks: stretch the field on X to read as speed.
    float streak = fbm(vec2(flowUv.x * 0.5, flowUv.y * 9.0) + vec2(-t * 3.0, 0.0));
    n = mix(n, n * 0.6 + streak * 0.55, 0.4);

    // Warm embers anchored in VIEWPORT uv space (aspect-independent → identical on
    // portrait mobile, where the old p-space corner fell off-screen) and kept alive so
    // the glow never fully dies.
    float ember = fbm(flowUv * 0.7 + vec2(-t * 0.5, t * 0.2));
    ember = smoothstep(0.45, 0.9, ember);
    float glow = smoothstep(1.05, 0.12, distance(uv, vec2(0.2, 0.22)));
    ember = (0.45 + 0.55 * ember) * glow;

    // Compose intensity: mostly dark, occasional warm rise. Keep it restrained.
    float heat = smoothstep(0.40, 0.88, n) * 0.6 + ember * 0.85;
    // Persistent, flowing warm shimmer so the frame NEVER drifts to pure black —
    // this is what made the mobile hero go all-black after a while.
    heat = max(heat, 0.05 + 0.06 * fbm(flowUv * 1.4 + vec2(t * 0.8, -t * 0.3)));
    heat = clamp(heat, 0.0, 1.0);

    // Duotone grade: near-black base → brand orange in the hot regions.
    vec3 col = mix(uBg, uAccent, pow(heat, 1.35));
    // A touch of deep-red shoulder before full orange for filmic warmth.
    col = mix(col, uAccent * 0.45, smoothstep(0.0, 0.35, heat) * 0.25);

    // Soft vignette — pull the edges toward pure --bg.
    float vig = smoothstep(1.25, 0.35, length(p * vec2(0.9, 1.15)));
    col = mix(uBg, col, vig);

    // Film grain (time-animated, subtle).
    col += grain(uv, uTime) * 0.045;

    // Floor to keep it premium-dark; never let it wash out.
    col = max(col, uBg * 0.85);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Convert a hex like #0A0A0A to a normalized [r,g,b] triplet for a uniform. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/** Read a CSS custom property off :root, falling back to a literal if unset. */
function cssVarRgb(name: string, fallbackHex: string): [number, number, number] {
  if (typeof window === 'undefined') return hexToRgb(fallbackHex);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = /^#([0-9a-f]{6})$/i.test(raw) ? raw : fallbackHex;
  return hexToRgb(hex);
}

/**
 * The WebGL "race film" layer. Renders nothing on the server. Self-disables when
 * reduced-motion is requested or WebGL can't init — in both cases the CSS fallback
 * underneath carries the look.
 */
function RaceFilmCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (prefersReducedMotion()) return;

    const host = hostRef.current;
    if (!host) return;

    let renderer: Renderer | null = null;
    let gl: OGLRenderingContext | null = null;
    let raf = 0;
    let running = false;

    // Eased mouse: target updated on move, current lerps toward it each frame.
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };

    try {
      renderer = new Renderer({
        alpha: false,
        antialias: false,
        dpr: Math.min(MAX_DPR, window.devicePixelRatio || 1),
        powerPreference: 'low-power',
      });
    } catch {
      // No WebGL — bail; CSS fallback remains.
      return;
    }

    gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uMouse: { value: [0, 0] },
        uBg: { value: cssVarRgb('--bg', '#0A0A0A') },
        uAccent: { value: cssVarRgb('--accent', '#F06A2A') },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const r = renderer;
      if (!r) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      r.setSize(w, h);
      program.uniforms.uResolution.value = [
        w * r.dpr,
        h * r.dpr,
      ];
    };
    resize();

    const onMouse = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      mouse.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const start = (t: number) => {
      mouse.x += (mouse.tx - mouse.x) * MOUSE_EASE;
      mouse.y += (mouse.ty - mouse.y) * MOUSE_EASE;
      program.uniforms.uTime.value = t * 0.001;
      program.uniforms.uMouse.value = [mouse.x, mouse.y];
      renderer?.render({ scene: mesh });
      raf = requestAnimationFrame(start);
    };

    const play = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(start);
    };
    const pause = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Pause when the hero scrolls offscreen.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden) play();
        else pause();
      },
      { threshold: 0.01 },
    );
    io.observe(host);

    // Pause when the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) pause();
      else if (host.getBoundingClientRect().bottom > 0) play();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    window.addEventListener('pointermove', onMouse, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      pause();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMouse);
      document.removeEventListener('visibilitychange', onVisibility);
      if (canvas.parentNode === host) host.removeChild(canvas);
      // Drop the GL context to free the GPU resource immediately.
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      // useVideo is the documented swap-point: when wired, a <video> would mount here
      // and be uploaded as an ogl Texture each frame instead of the generated grade.
      data-use-video={useVideo ? 'true' : 'false'}
    />
  );
}

export function Hero() {
  return (
    <section
      id={SECTION_IDS.hero}
      aria-labelledby="hero-headline"
      className="relative flex min-h-[100svh] w-full flex-col overflow-hidden scroll-mt-20 bg-[color:var(--bg)] md:scroll-mt-24"
    >
      {/* LAYER 2 — CSS fallback (ALWAYS present, behind canvas). */}
      <div aria-hidden="true" className="absolute inset-0">
        {/* Warm orange glow, bottom-left, on near-black. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 12% 100%, color-mix(in oklab, var(--accent) 22%, transparent) 0%, transparent 55%), linear-gradient(180deg, var(--bg) 0%, color-mix(in oklab, var(--bg) 80%, #000) 100%)',
          }}
        />
        {/* Film grain overlay (landing.css helper). */}
        <div className="landing-grain absolute inset-0" />
      </div>

      {/* LAYER 1 — WebGL race-film grade, above the fallback, below content. The
          canvas mounts client-side only (its effect is a no-op on the server), so the
          server HTML is purely the fallback + content — ideal for LCP. */}
      <div className="pointer-events-none absolute inset-0">
        <RaceFilmCanvas />
      </div>

      {/* Bottom scrim so foreground text is always legible over any frame. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--bg) 65%, transparent) 55%, var(--bg) 100%)',
        }}
      />

      {/* Quiet secondary element — a giant, very-low-opacity FahybridMark watermark
          anchored to the right edge. Fills the empty right/lower-right of wide frames
          so the composition reads edge-to-edge, without ever competing with the h1.
          Wrapped so the whole thing is aria-hidden (the mark exposes role="img");
          hidden on small screens (no room); pointer-events-none. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[3%] bottom-[10%] z-0 hidden select-none lg:block"
      >
        <FahybridMark
          color="var(--fg)"
          className="h-[clamp(18rem,42vh,34rem)] opacity-[0.04]"
        />
      </div>

      {/* LAYER 3 — Foreground content. Flex column filling the hero:
          • mobile/tablet → justify-between puts the FH mark at the TOP (in flow) and the
            text block at the BOTTOM, with a guaranteed gap → they can NEVER overlap
            (the old absolute top-% version collided with the eyebrow on short real
            devices).
          • desktop → content vertically centred so tall windows (Safari) don't leave a
            big void above; the right-edge watermark handles the empty right side. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-1 flex-col justify-between px-6 pt-24 pb-20 md:px-10 lg:justify-center lg:pt-28 lg:pb-28">
        <div aria-hidden="true" className="flex shrink-0 justify-center pt-2 select-none lg:hidden">
          <FahybridMark
            color="var(--fg)"
            className="h-[clamp(4rem,15vw,6rem)] w-auto opacity-80"
          />
        </div>
        <div>
          <SectionLabel className="mb-6">{HERO.eyebrow}</SectionLabel>

          {/* Headline dominates like a film title: oversized + breaks across the frame.
              Wider than the supporting copy so it reads edge-to-edge. */}
          <KineticHeadline
            as="h1"
            trigger="load"
            id="hero-headline"
            lines={[...HERO.headlineLines]}
            className="max-w-[18ch] text-[clamp(3rem,9vw,7.5rem)] leading-[0.92]"
          />

          <p className="mt-7 max-w-[34rem] text-[clamp(1rem,2.2vw,1.25rem)] leading-relaxed text-[color:var(--muted)]">
            {HERO.sub}
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* Primary CTA — prominent orange pill. Matches the brand button spec. */}
            <Link
              href={CHOOSE_PLAN_HREF}
              className={cn(
                'group inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)]',
                'bg-[color:var(--accent)] px-7 py-3.5 text-base font-semibold text-[color:var(--accent-on)]',
                'transition-colors hover:bg-[color:var(--accent-press)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
              )}
            >
              {HERO.primaryCta}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </Link>

            {/* Secondary CTA — site arrow-tick language: small orange tick + label
                (matches ProblemPromise / Methodology), not a generic underline. */}
            <a
              href={`#${SECTION_IDS.comoFunciona}`}
              className={cn(
                'group inline-flex items-center gap-2 rounded-[var(--r-s)] px-1 py-2 text-base font-medium text-[color:var(--fg)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
              )}
            >
              <ArrowRight
                aria-hidden="true"
                strokeWidth={2.25}
                className="size-4 text-[color:var(--accent)] transition-transform duration-300 group-hover:translate-x-0.5"
              />
              <span>{HERO.secondaryCta}</span>
            </a>
          </div>

          <p className="mt-6 text-sm text-[color:var(--muted)]">{HERO.trust}</p>
        </div>
      </div>

      {/* Animated scroll cue, bottom-center. Pure CSS; reduced-motion safe (see below). */}
      <a
        href={`#${SECTION_IDS.comoFunciona}`}
        aria-label={HERO.secondaryCta}
        className={cn(
          'absolute bottom-6 left-1/2 z-10 -translate-x-1/2',
          'flex h-9 w-[22px] items-start justify-center rounded-[var(--r-pill)]',
          'border border-[color:var(--outline)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
        )}
      >
        <span
          aria-hidden="true"
          className="mt-2 h-2 w-[3px] rounded-[var(--r-pill)] bg-[color:var(--muted)] motion-safe:animate-[hero-scroll_1.6s_ease-in-out_infinite]"
        />
        {/* Local keyframes — defined inline so this file owns its bespoke motion and
            it stays disabled under prefers-reduced-motion via the motion-safe variant. */}
        <style>{`
          @keyframes hero-scroll {
            0%   { transform: translateY(0);     opacity: 0; }
            30%  { opacity: 1; }
            100% { transform: translateY(10px);  opacity: 0; }
          }
        `}</style>
      </a>
    </section>
  );
}
