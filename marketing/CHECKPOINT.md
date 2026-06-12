# Marketing Video Pipeline — Checkpoint Log

Purpose: resumable state for any agent/AI continuing this work.
Plan source: `~/.claude/plans/nah-don-t-worry-about-jiggly-wave.md` (also summarized below).

## Goal
30s vertical (1080×1920, 9:16) marketing ad for Vivid Lingua (German-learning app for Mongolian speakers), Mongolian language, styled like "Top SaaS Marketing Video Example | NeuraFlow" (https://www.youtube.com/watch?v=aSte18D2_YE). Built with HyperFrames (HTML→MP4), repo at `/Users/Hanaashude/DaVinci Resolve Media/hyperframes` (note: path contains spaces — always quote).

## State

- [x] `marketing/` scaffolded (compositions/, assets/, output/); output + mp4 gitignored
- [x] `marketing/.env` holds GEMINI_API_KEY (labeled, gitignored via `.env*` rule)
- [x] Key injected into youtube-vision MCP config (`~/.claude.json`)
- [x] **BLOCKED — reference video analysis**: key returns HTTP 403 "method blocked" on `generateContent`. Key is restricted (visual API only); needs "Generative Language API" enabled in Google Cloud console. Fallback used: standard SaaS ad structure (see reference-analysis.md)
- [x] `reference-analysis.md` written (generic SaaS structure, pending real analysis)
- [x] `storyboard.md` written (30s, 5 scenes, Mongolian copy)
- [x] HyperFrames composition built in `marketing/hyperframes/compositions/` (all 5 scenes + persistent aurora bg)
- [x] Preview verified (lint: 0 errors; validate: no console errors, 120/120 text WCAG AA pass; inspect: 0 layout findings)
- [x] Rendered to `marketing/output/vivid-lingua-ad-mn.mp4`, ffprobe-verified (30.000000s, 1080×1920, h264, 30fps, 900 frames)

## Key facts for resuming

- Design system: "Aurora Atelier" — tokens in `frontend/src/index.css` @theme block.
  Background #060512, primary violet #b388fa, secondary ice-blue #66aafd, tertiary rose #fb6d8e, text #f2f0fa.
  Fonts: Unbounded (display) + Golos Text (body), both Cyrillic-capable. Google Fonts import in index.css line 1.
- App UI is rebuilt as HTML mockups inside the composition (no screenshots needed — HyperFrames is HTML-native).
- HyperFrames usage: read skills at `"/Users/Hanaashude/DaVinci Resolve Media/hyperframes/skills/hyperframes"` and `.../skills/hyperframes-cli` before writing composition code. Examples in `.../examples/`.
- Render: `npx hyperframes render` (or CLI from monorepo via bun). Verify with ffprobe.

## Build notes (2026-06-11)

### Composition files (project root: `marketing/hyperframes/`)
- `index.html` — root composition `main` (1080×1920, 30s). Mounts the aurora bg + 5 scene
  sub-comps via `data-composition-src`; master timeline crossfades outgoing scenes
  (0.45s windows at the 4/9/22/26s boundaries — the transition IS the exit, no jump cuts).
  Declares all 6 Cyrillic `@font-face` blocks (Unbounded + Golos Text, latin/cyrillic/cyrillicExt
  splits) pointing at local `assets/fonts/*.woff2` — compiler embeds them as data URIs at render.
- `compositions/bg-aurora.html` — persistent violet/blue/rose radial glows, slow 30s drift,
  brightens in the final 4s (radial gradients, not linear — avoids H.264 banding).
- `compositions/scene1-hook.html` — Hook (0–4s): kinetic line-by-line slide-up, «Герман» violet pop.
- `compositions/scene2-reveal.html` — Product reveal (4–9s): phone frame springs up from bottom
  with overshoot; app home mockup (word card «die Reise / аялал», mini tiles).
- `compositions/scene3-features.html` — Feature montage (9–22s): 3 panels swap slide-left inside one
  phone shell — placement test (B1 badge pop), flashcards (flip + SRS cycle), tooltips (tap ripple
  + «толь бичиг» gloss). Chip label text swaps per sub-scene.
- `compositions/scene4-ladder.html` — Progression (22–26s): A1→C2 chips light up L→R, violet→blue→rose.
- `compositions/scene5-cta.html` — CTA (26–30s): VL logo mark scales in, «Өнөөдөр эхэл», pulsing
  «Эхлэх →» button, `vividlingua.app` URL line.

### Render command
```
cd marketing/hyperframes
npx --yes hyperframes@0.6.91 render \
  --output /Users/Hanaashude/vivid-lingua/marketing/output/vivid-lingua-ad-mn.mp4 \
  --workers 1 --quality standard
```
- `--workers 1` chosen because `doctor` reported low available RAM (~1.3 GB free / 8 GB total);
  HyperFrames also auto-engages low-memory safe profile (screenshot capture) at ≤8 GB.
- Render time ~46s. Output 6.77 MB, h264, yuv, 30fps.

### ffprobe verification
`width=1080 height=1920 codec=h264 r_frame_rate=30/1 duration=30.000000 nb_frames=900` — matches spec exactly.

### Lint status
0 errors, 111 warnings — all non-blocking and intentional:
- `composition_self_attribute_selector` (76): each scene mounts exactly once, no sibling-instance leak.
- `overlapping_gsap_tweens` (30): `__unresolved__` selector false positives — separate elements with
  staggered `gsap.from()` entrances, not real same-property conflicts.
- `font_family_without_font_face` (5): fonts are declared in `index.html` (the entry the renderer
  compiles), not per-sub-comp; confirmed embedded as data URIs in the render log, and `validate`
  passed all 120 text elements, so typography renders correctly.

### Post-build fix (2026-06-12)
- Scene 3b: added gloss «галт тэрэг» to the incoming «der Zug» card. Previously the
  prior card's «аялал» (die Reise) was the only visible gloss while der Zug flew in,
  reading as a wrong translation pair on pause. Re-rendered + frame-verified at 16s.

### Deviations from storyboard
- None substantive. CTA URL uses the storyboard's placeholder `vividlingua.app` (still flagged
  "confirm real URL" in storyboard.md).
- Scene 3 sub-scene transitions are intra-phone slide-left panel swaps (per storyboard); scene-to-scene
  changes use the master-timeline crossfade rather than hard cuts.
- Reference-video Gemini analysis remained blocked (403); generic SaaS structure from
  reference-analysis.md was followed as planned.
