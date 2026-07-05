# Redesign spec: "Paper v2" — ullas-notes

You are implementing a full visual redesign of this static site. This document is the
complete specification. The pixel-level source of truth is the approved mockup at
**`mockups/2b-paper-wide.html`** — open and read it before writing any code. Where this
document and the mockup disagree on visuals, the mockup wins.

## Context

- Custom zero-dependency static site generator. **Do not add npm dependencies, frameworks, or CSS tooling.**
- Source of all HTML templates: inline template strings in `scripts/build.mjs`.
- All CSS: `src/styles.css` (copied into `dist/` by the build).
- Config: `site.config.json`. Content: `content/posts/*.md`, `content/pages/about.md`.
- Build: `npm run build`. Preview: `npm run preview` (builds, then serves `dist/` on port 4174).
- Edit only source files. Never edit `dist/` (generated). Do not delete or modify `mockups/`.

## Design system

### Palette (CSS custom properties)

```css
:root {
  --paper:  #faf6ee;  /* page background — warm cream, never pure white */
  --ink:    #2b2620;  /* body text — warm near-black, never #000 */
  --muted:  #8a7f6f;  /* secondary text — warm taupe, never cool gray */
  --accent: #33476b;  /* navy — the ONLY accent color on the site */
  --line:   #e2d9c8;  /* hairline rules */
  --code-bg:#f3ede0;  /* code blocks — slightly deeper cream */
}
```

Rules: every color is warm (except the deliberately cool navy accent). The accent is used
*sparingly*: links, category labels, buttons, the italic emphasized words in the hero, and
the first letter of the wordmark. If everything is colored, nothing stands out.

### Typography

Load via Google Fonts in `<head>` of every page:

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
```

- **Newsreader** (serif, variable, real italics) — all display text, titles, body copy.
  Fallback stack: `"Newsreader", Georgia, "Times New Roman", serif`.
- **Inter** — ONLY for small-caps meta labels (dates, categories, nav, section labels).
  Pattern (the `.caps` class in the mockup):
  `font-family: Inter; font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;`
- Code: `ui-monospace, SFMono-Regular, Menlo, monospace`, 15px, on `--code-bg`.

### Layout: "marginalia" grid

The signature of this design. Page shell: `max-width: 1020px; margin: 0 auto; padding: 40px 32px 90px;`.
Content rows are a two-column grid: **`grid-template-columns: 190px 1fr; gap: 40px;`** —
small-caps metadata lives in the left margin column; serif content in the right column.
Text columns inside the right cell cap at ~620–660px for readability.
At `max-width: 720px` every grid collapses to one column (`grid-template-columns: 1fr`).

### Interaction

- Post-row hover: title turns `var(--accent)` and *italic*. No background changes, no shadows, no transforms.
- Text links: accent color; underline only inside article body text.
- Buttons (pills): accent border + accent text → filled accent background + cream text on hover, `transition: 140ms ease`.
- No animations beyond these hovers. The design is calm.

## Shared components (every page)

### Header

```html
<header>                                  <!-- flex, space-between, center-aligned -->
  <a class="name" href="/">Ullas</a>      <!-- Newsreader italic, 40px, weight 500;
                                               first letter colored var(--accent) via ::first-letter -->
  <nav class="caps">
    <a href="/">Writing</a>
    <a href="/categories/">Sections</a>
    <a href="/about/">About</a>
    <a class="btn" href="{github url}">{octocat svg} GitHub</a>
    <a class="btn" href="{x url}">{x-logo svg} X</a>
  </nav>
</header>
```

- Plain nav links: muted color, no underline, accent on hover.
- `.btn` pills: `inline-flex; align-items: center; gap: 8px; border: 1px solid var(--accent); color: var(--accent); border-radius: 999px; padding: 9px 16px;` hover = filled (see Interaction).
- SVGs are 18×18, `fill: currentColor`. Exact paths are in `mockups/2b-paper-wide.html` — copy them verbatim (GitHub octocat mark, viewBox 0 0 16 16; X logo, viewBox 0 0 24 24).
- Header bottom border: `1px solid var(--line)`.

### Footer

```html
<footer>   <!-- flex space-between; top border 1px solid var(--ink); margin-top ~88px -->
  <span>❦ © 2026 Ullas</span>            <!-- Newsreader italic 15px -->
  <nav class="caps"><a>GitHub</a> <a>X</a> <a>RSS</a></nav>
</footer>
```

- Link RSS only if the build actually generates a feed; otherwise omit the RSS link.
- Do NOT include the "Try an accent" swatch row from the mockup — that was a design-review tool, not part of the site.
- Do NOT include "Last generated {date}" or "A basic place for longer writing" anywhere.

## Pages

### 1. Homepage (`/`)

Top to bottom (all present in the mockup — match it):

1. **Hero** — marginalia grid.
   - Left margin: `EST. 2026` / `WRITING · BUILDING` (small caps, muted).
   - Right: statement headline in Newsreader, `clamp(30px, 4.2vw, 46px)`, weight 400, line-height 1.28:
     > Notes on *building* and *learning* — written down when they might help someone else finish their own thing.
     The words "building" and "learning" are `<em>` in accent color.
   - Below, italic muted aside: "Project notes, build logs, and lessons from shipping, by a 19-year-old open-source developer."
   - Below that, the CTA line (italic, 17px): "Everything here is built in the open — <a>browse the code on GitHub ↗</a>" (link: accent, bottom-bordered with `--line`, border turns accent on hover).
2. **Section rule** — full-width `1px solid var(--ink)` top border; below it, flex row:
   left `LATEST WRITING` (small caps, ink), right `{N} PIECES` (small caps, muted).
3. **Post list** — one marginalia row per post, whole row is a single `<a>`:
   - Left margin: date (small caps, muted) over category (small caps, accent).
   - Right: title in Newsreader 29px weight 500 (turns accent+italic on row hover); summary below in 17.5px, color `#5b5142`, max-width 600px.
   - Rows separated by `1px solid var(--line)`; ~34px vertical padding.
   - Show ALL posts, newest first. No tag pills on the homepage. No "N tags" meta.
4. **Sections block** — marginalia grid. Left: `SECTIONS` label. Right: one row per
   category — Newsreader 19px name + small-caps count (`3 PIECES`), thin bottom border,
   accent+italic on hover. **Only render categories that have ≥1 post.**
5. Footer.

The old homepage's "Tags" cloud section is REMOVED. Tag pages may still be generated
(keep existing tag-page generation working), but tags are only surfaced on article pages.

### 2. Article page (`/posts/{slug}/`)

The mockup covers the homepage; extend the same language to articles:

- **Title block**: marginalia grid.
  - Left margin (small caps, stacked): date; category (accent, links to category page);
    "UPDATED {date}" if present; tag list (each tag small-caps muted, links to tag page, one per line).
  - Right: `<h1>` Newsreader weight 500, `clamp(32px, 4.5vw, 44px)`, line-height 1.15;
    below it the post summary in italic muted Newsreader 19px.
- **Body** (right column continues, text max-width 660px):
  - Paragraphs: Newsreader 19px, line-height 1.7, color `--ink`.
  - `h2` 26px / `h3` 21px, Newsreader weight 500, generous top margin (~40px / ~30px).
  - Links: accent with 1px underline, `text-underline-offset: 3px`.
  - Blockquotes: italic, `border-left: 2px solid var(--accent)`, padding-left 18px, muted.
  - Inline code + pre blocks: monospace on `--code-bg` with `1px solid var(--line)` border, radius 6px. `pre` scrolls horizontally.
  - Lists: normal serif, markers in `--muted`.
- **End of article**: small centered ornament `❦` in muted, then a back link "← All writing" (small caps).
- NO boxed "article details" grid, NO uppercase tag pills, no duplicated summary.

### 3. Sections index (`/categories/`)

Header eyebrow treatment: marginalia grid with left label `BROWSE`, right side an
h1 "Sections" (Newsreader ~40px) and one muted serif sentence. Then the same category
rows as the homepage Sections block (only non-empty categories). No cards, no boxes.

### 4. Category page (`/categories/{slug}/`) and tag page

Same skeleton as sections index: left label `SECTION` (or `TAG`), h1 = category label,
muted description sentence, then the standard marginalia post list. If a category has no
posts it should not be linked from anywhere (but generating the page is harmless).

### 5. About page (`/about/`)

Marginalia grid: left label `ABOUT`, right column is prose (Newsreader 19px, max 660px).
**Replace the entire contents of `content/pages/about.md` body with:**

```markdown
I'm Ullas — a 19-year-old developer who learns by shipping.

Most of what I know comes from making real projects, breaking them, fixing them, and
turning the work into something other people can use. Everything I build is open source.

## Built in the open

- **[AI-ingest](/posts/ai-ingest/)** — a personal AI news filter that turns the daily
  firehose into one short morning brief. *Using it daily myself.*
- **[Breathe](/posts/breathe/)** — a two-person health ritual app: daily activities,
  streaks, partner accountability. *Two users: me and my partner.*
- **[LaunchGuard](/posts/launchguard/)** — a launch-readiness scanner that turns repo
  risks into a plain-English report. *Prototype.*

## Now

Building small AI tools and writing here as I go. <!-- TODO(Ullas): replace with one
dated sentence about what you're working on; update monthly -->

## Why this site

To remember what I figured out, and to make it useful for someone else trying to finish
their own thing. The rule is simple: if it might help one other person, it lives here.

## Say hello

I'm on [GitHub](https://github.com/UllasSHR) and [X](https://x.com/UllasSHR).
If you're building something and stuck, I'm happy to look.
```

(Verify the three post URLs against the actual generated slugs and fix if they differ.
If the build supports `##` headings on pages, style them as body h2.)

## Content & config changes

### `site.config.json`

- `description`: `"Notes on building and learning — written down when they might help someone else finish their own thing."`
- `author` (used as header subtitle in the old design): no longer displayed; leave as-is or set to `"Builder · Writer"`.
- `nav`: `[ {Writing → /}, {Sections → /categories/}, {About → /about/} ]` — GitHub and X
  come from `social` and render as the pill buttons, not nav items.
- `categories`: reduce to THREE:
  1. `building` / "Building" / "Tools, projects, and experiments, built in the open."
  2. `technical-writing` / "Technical Writing" / "Clear technical articles, agent workflows, and engineering explainers."
  3. `notes` / "Notes" / "Lessons, mistakes, and things worth remembering."
  (Existing posts already use `building` and `technical-writing`; nothing moves. `notes`
  will be empty and therefore hidden until a post uses it.)

### Post frontmatter (`title` only — do not touch body text or slugs/filenames)

- `2026-06-21-ai-ingest.md` → `"AI-ingest: one short brief instead of the morning firehose"`
- `2026-06-21-launchguard.md` → `"LaunchGuard: is this AI-built app actually ready to ship?"`
- `2026-06-21-breathe.md` → `"Breathe: a health ritual you keep with a partner"`
- `2026-06-20-computer-use-on-codex.md` → `"Computer Use on Codex, with exactly enough access"`

### Copy to delete from `scripts/build.mjs` templates (author-facing leakage)

- "Newest writing appears first, so visitors do not have to hunt for what changed."
- "Choose the main bucket for what you are writing."
- "A basic place for longer writing. Last generated {date}."
- The word "pieces" as a count is KEPT (it fits the literary voice) — but empty
  categories are never shown, so "0 pieces" must never appear.

## Non-goals / guardrails

- No dark mode, no JS beyond what already exists (the design needs none — whole-row links
  are plain `<a>` elements, so the old z-index/pointer-events card hack can be deleted).
- No new pages, no RSS work beyond linking an existing feed, no analytics.
- Keep the generator's existing behavior: markdown parsing, slugs, tag pages, `npm run new-post`.
- Preserve valid HTML semantics: one `<h1>` per page, `<time datetime>` for dates,
  `aria-hidden="true"` on decorative SVGs and the ❦ ornament.

## Verification checklist (do all of these before declaring done)

1. `npm run build` exits 0. Then `npm run preview` and check in a browser:
2. `/` matches `mockups/2b-paper-wide.html` closely at 1280px width (same fonts, colors,
   marginalia alignment, pill buttons with visible logos, hero copy).
3. `/posts/ai-ingest/` — marginalia title block, readable serif body, styled code blocks,
   no boxed details grid, links from "GitHub repo / Live page" lines styled and spaced.
4. `/categories/` shows exactly Building (3) and Technical Writing (1). No empty sections anywhere.
5. `/about/` renders the new copy with working links.
6. At 375px width: single column everywhere, header wraps gracefully (name above nav is
   acceptable; pills must not overflow), no horizontal scrolling.
7. Grep the built `dist/` for: "hunt for what changed", "main bucket", "Last generated",
   "0 pieces", "Ullas Srivastava</h1>" — all must return nothing.
8. With network blocked (fonts unavailable), the site is still readable via Georgia fallback.
