# Storyboard — Vivid Lingua Launch Video (WMP-style, Mongolian)

Two renders from the same storyboard:
- **16:9** `hyperframes-launch/` → 1920×1080, ~70s, 30fps → `output/vivid-lingua-launch-mn.mp4`
- **9:16** `hyperframes-launch-916/` → 1080×1920, same beats/copy, vertically re-composed
  (stacked headlines, full-width phone shells) → `output/vivid-lingua-launch-mn-916.mp4`

Reference structure: `reference-analysis-wmp.md` + frames in `reference-frames/wmp/`.
CTA URL: **gridwave.me** (verified live Vivid Lingua deployment).

## Visual language
- Dark scenes: Aurora night sky `#060512`, violet `#b388fa`, ice-blue `#66aafd`, rose `#fb6d8e`,
  text `#f2f0fa`, muted `#a8a3c8`. Radial gradients only (H.264 banding).
- Light scenes: lavender field `#f4f0fd` → `#e6dcfa`, ink text `#241c44`, violet accents.
- Fonts: Unbounded (display), Golos Text (body/UI) — local woff2, Cyrillic-capable.
- AI motif: 4-point sparkle ✦ in violet.
- Dark↔light alternation per the reference; giant cropped typography as transitions.

## Beats (~70s)

| # | Time | Mode | Beat | Content |
|---|------|------|------|---------|
| 1 | 0–5 | dark | Typewriter hook | «Герман хэл сурах хамгийн ухаалаг арга» types on; «Герман» pops violet; giant blurred letterforms «Vi» drift behind |
| 2 | 5–8 | dark | Powered by AI | «Хиймэл оюунаар хөтлөгдсөн» — «хөтлөгдсөн» violet; dot-particle wave below (precomputed coords) |
| 3 | 8–11 | dark | Giant-type transition | Huge violet «Vivid» sweeps across frame, cropped by edges |
| 4 | 11–14 | dark | Introducing | «Vivid Lingua танилцуулж байна» («Vivid Lingua» violet); floating frosted icon tiles: 📖 book, 🃏 card, 💬 chat, 📊 chart, 🔔 bell, ✦ (SVG/CSS icons, not emoji) |
| 5 | 14–18 | light | All-in-one + dashboard | Pill badge «Герман хэл сургалтын платформ»; headline «Бүгдийг нэг дор / Нэгдсэн систем» (line 2 gradient); sub «Үг, дүрэм, давталт — бүгд нэг аппд»; desktop dashboard mockup w/ 2 rounded highlight annotations («Сайн уу, Болд», «Өнөөдрийн давталт 24 үг») |
| 6 | 18–27 | light | UI deep-dive ×3 | Purple cursor + zooms: (a) lesson list, cursor clicks «Reisen — Аялал» lesson; (b) flashcard flips «die Reise» → «аялал», SRS chips; (c) placement test question card → «B1» badge pop. German words ALWAYS show Mongolian gloss in-shot |
| 7 | 27–30 | light | Unified | Italic «Нэгдсэн платформ» over blurred dashboard; sharp KPI strip: «1,200+ үг · A1→C2 · 99% санах ой» |
| 8 | 30–33 | dark | Panel cascade | 3 app panels in perspective stagger (home / flashcards / test) |
| 9 | 33–38 | dark | Learning-path map | Dark map-grid; white route line A1→C2 with milestone dots; 4 callout cards: «Өдрийн давталт бэлэн», «Шинэ түвшин нээгдлээ», «7 хоногийн streak 🔥», «SRS сануулга» (no emoji in final — CSS flame) |
| 10 | 38–41 | dark | Giant type: AI багш | Huge violet «AI багш» fills frame |
| 11 | 41–48 | dark | AI chat demo | Rotating suggested prompts: «"der, die, das"-г хэзээ хэрэглэх вэ?» / «Өнөөдөр ямар үг давтах вэ?» / «Миний түвшин хэд вэ?»; sparkle flies dotted path; question types in input (0/1000 + send); sparkle blob morphs; answer card with gloss «der Zug — галт тэрэг» |
| 12 | 48–53 | violet | Notification | Phone lock screen «12:00 · Мягмар, 3-р сарын 21»; push «Vivid Lingua: Өнөөдрийн давталт бэлэн боллоо»; giant blurred «Lingua» wordmark behind |
| 13 | 53–58 | light | Learners collage | Purple rounded tiles fly from corners → collage of mini app-screen cards + gradient tiles; chips «Оюутан» «Ажилтан» «Аялагч»; label «Хэн ч сурч чадна» |
| 14 | 58–62 | light | More-than | «Зүгээр нэг апп биш» inside morphing 4-point star blob (violet on lavender) |
| 15 | 62–66 | dark→violet | Logo zoom | «Эхэлцгээе» over giant cropped VL logo mark on violet radial gradient |
| 16 | 66–70 | dark | Outro | Particle globe glows up → black frame: VL logo + «Vivid Lingua» + «Өнөөдөр эхэл» + **gridwave.me** |

## Motion rules (carried from v1)
- Entrances: cubic-bezier(0.22, 1, 0.36, 1); springs: cubic-bezier(0.34, 1.56, 0.64, 1)
- Master timeline crossfades 0.45s at beat boundaries; giant-type beats (3, 10) ride their own
  track ABOVE neighbours instead of crossfading
- Typewriter: char-by-char steps(); per-line stagger 120–180ms
- Determinism: no Math.random()/Date.now(); particle coords precomputed arrays
- Nothing static >3s; backgrounds always drifting

## 9:16 re-composition notes
- Headlines stack; font sizes up ~15%; sub-copy max 2 lines
- Dashboard scenes (5–7) become phone-frame scenes (reuse v1 phone shell)
- KPI strip becomes vertical 3-row stack
- Map beat: route runs bottom→top; callouts 2×2 grid below
- Giant-type transitions crop top/bottom instead of left/right
