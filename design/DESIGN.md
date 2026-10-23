<!-- DESIGN.md — pdfaster design contract · format 1.0-restyle -->
<!-- look: hi-fi-instrument · ch-hi-fi-instrument · Braun Shelf palette · tuned 2026-10-23 (restyle MCP + AA gate) -->

# pdfaster — Design Contract (Hi-Fi Instrument)

> Contract, not a suggestion. If implementation conflicts with §2, change the
> implementation, not the contract. Scope of this contract: **graphics and
> motion only** — no functionality, layout structure or copy changes.

## 1. Identity

Hi-Fi Instrument — 1960s–1980s gadget register (Dieter Rams / Braun). The app is
a machine: tools are **physical controls**, states are **machine states**. Colour
is never decoration; exactly one signal orange means *active*.

## 2. Tokens

### Colour
| Token | Value | Role |
|---|---|---|
| `--bg` | #f7f5ef | page ground — cream plastic casing |
| `--surface` | #ffffff | cards, panels, inputs, sheet surfaces |
| `--surface-2` | #eceae2 | elevated panels, code/preview wells, casework insets |
| `--text` | #1a1a18 | primary ink |
| `--text-muted` | #5f5c54 | secondary text, captions |
| `--primary` | #1a1a18 | CTAs, active states (the "black key") |
| `--primary-ink` | #f7f5ef | labels on primary |
| `--accent` | #1a1a18 | links, focus-outlined elements |
| `--signal` | #ff6b1a | **active / filled / engaged controls only** (one per group); pairs with ink `#1a1a18` |
| `--signal-press` | #e2570b | focus rings on cream (3:1), pressed fills |
| `--border` | #d9d5cc | hairlines, grooves, engraving |

All pairs text/bg 15.99 · text/surface 17.43 · muted 6.68 · primary-ink/primary 15.99 — WCAG AA PASS (restyle check_contrast, 2026-10-23). Signal orange `#ff6b1a` with ink `#1a1a18` = 6.2:1; never white-on-orange.

### Shape / depth / line
- Radius: `--radius-sm 4px` (rect controls) · `--radius-md 12px` (panels) · `--radius-lg 20px` (dials).
- `--shadow: inset 0 2px 3px rgba(26,26,24,.25), 0 2px 4px rgba(26,26,24,.15)` — inside every control (shaft).
- `--shadow-hover: inset 0 2px 3px rgba(26,26,24,.25), 0 4px 8px rgba(26,26,24,.18)`.
- `--glow: none`. Ornament: 1px grooves between control fields; engraved hairline circles; screw dots allowed on hero/casing only.
- 4% soft-light grain on the page casing (static, pre-baked SVG/spiral tile — no animation).

### Type
- Display: **IBM Plex Mono** 600, tracking +0.04em, UPPERCASE (labels, headers, readouts).
- Body: **Public Sans** 400–600.
- Mono: IBM Plex Mono (numeric readouts: page counts, sizes, percentages — always mono).
- Licence: both OFL, install via `@fontsource/ibm-plex-mono` + `@fontsource/public-sans` (CSP-safe, self-hosted — replace, keep, or supersede @fontsource/blinker).

### Motion (signature — this contract's animation identity)
- Easing `cubic-bezier(.35,0,.25,1)`, duration **150 ms** everywhere.
- Signature: **deft mechanical** — active press = 2px translate-down + shadow inset deepening (snap); release settles; toggle/segment switches settle like dial detents (150ms, no bounce).
- Entrances: nav/hero/tool-grid children one-time `opacity 0→1, translateY(8px→0)`, 150ms, 40ms stagger, once per mount (no loop, respects `prefers-reduced-motion: none`).
- Toolbar affordances: selected tool's button fills `--signal` and its inset shadow brightens top-light; never stack two orange controls in one field.
- Paper-canvas / editor viewport stays neutral — the machine's colour belongs to the controls, never to the document being worked on.

## 3. Component rules (graphics-level)
- **Nav**: cream casing, 1px groove bottom line; items are caps mono micro-labels with engraved hairline under-dots on hover; active page = `--signal` under-dot.
- **Hero**: casing top face — big mono caps headline, one black CTA + one quiet outline CTA; screw dots allowed at hero corners.
- **Tool pages/cards**: each tool = an instrument: caps mono title, engraved hairline circle or groove field, inset-shadowed action button, signal orange only when the operation is engaged/running/done-confirm (briefly, 150ms in, 600ms hold).
- **Buttons**: default black primary or cream outlined; `:active` translate 2px + inset deepen; focus ring 2px `--signal-press`.
- **Editor chrome**: thumbnails, tool rail and status bar use `--surface-2` casework with grooves; page canvas unchanged.
- **Dial-toplight**: circular controls may use one radial top-light gradient (`at 35% 28%, lighten→base`) — the only gradient permitted.
- **Do**: controls as objects · inset shafts · grooves · mono caps + numeric readouts · single signal orange.
- **Don't**: decorative colour · playful bounce · large expressive radii · decoration gradients · colour on the document canvas.

## 4. Provenance
- Palette: Color Hunt "Braun Shelf" <https://colorhunt.co/palette/f7f5efd9d5cc1a1a18ff6b1a> via RE:STYLE catalogue (studio default was genericised; this file restores the language's native baseline).
- Fonts/icons: Google Fonts OFL; Lucide ISC.
