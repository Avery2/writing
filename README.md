# Avery's writing

This repository is the source of truth, publishing engine, and GitHub Pages project site for writing served at [`averychan.site/writing/`](https://www.averychan.site/writing/). The portfolio repository owns the parent domain and homepage curation; this repository owns the `/writing/` URL prefix, Markdown, note graph, templates, and build rules.

## How publishing works

```text
content/notes/*.md
        ↓
scripts/build.mjs
        ↓
static HTML + linked-note enhancement
        ↓
this repository's Pages workflow
        ↓
averychan.site/writing/
```

The writing Pages workflow runs:

```bash
npm run build -- --output dist/site --base-url /writing/
```

Generated output belongs in `dist/` locally and is not committed. The portfolio manually chooses which public entry points appear as homepage cards; publishing a note does not automatically feature it.

Pushes to `main` deploy automatically. `writing.config.json` selects the landing note and legacy redirects. The workflow also copies portfolio-owned resume detail pages into the artifact so existing `/writing/experience/` and `/writing/education/` URLs remain valid; a daily scheduled deployment refreshes those compatibility pages.

## Write a note

Create a Markdown file in `content/notes/`:

```yaml
---
slug: example-note
title: "Example note"
summary: "A short description."
status: published
visibility: unlisted
kind: substantial
ai_generated: false
---
Markdown body with a [[second-note|conceptual link]].
```

Then run:

```bash
npm run build
npm run check
```

The graph may be disconnected. A public note does not need to appear in an index or connect to the main Notes entry point.

## Metadata

- `slug`: Stable URL and graph identifier. Lowercase letters, numbers, and hyphens.
- `title`: Public display title.
- `summary`: Public description used in indexes and metadata.
- `status`: `published`, `draft`, `stub`, or `private`.
- `visibility`: `featured`, `listed`, or `unlisted`. Defaults to `listed` for the prototype corpus.
- `kind`: Editorial shape such as `substantial`, `partial`, or `stub`.
- `ai_generated`: Displays the provenance notice when true.
- The root note is selected once in `writing.config.json`, rather than repeated in content metadata.
- `unavailable`: Publishes metadata and an unavailable destination without a body.

`status` and `visibility` are intentionally separate. A generated page may be public but unlisted. The portfolio's `manual-tiles.yml` remains the explicit editorial list of featured entry points.

## Privacy boundary

This source repository and its build output are public. Never commit actual private prose here. A `status: private` file may contain public title/summary metadata only; the compiler discards its body defensively and publishes the unavailable-state message. Sensitive drafts belong in a separate private store. Review generated `dist/writing/` before publishing changes to privacy behavior.

## Structure

```text
content/notes/       Markdown and YAML source of truth
scripts/build.mjs    Compiler and validation
src/                 Progressive-enhancement interface
styles/              Small standalone snapshot of portfolio tokens
dist/                Ignored local output
AGENTS.md             Durable instructions for coding agents
```

## Relationship to the portfolio

The writing site is visually related to the portfolio but independently owned. `styles/portfolio-foundation.css` contains the small token/reset contract it needs. Avoid importing the portfolio's complete CSS or moving writing compilation back into the portfolio repository. The writing Pages artifact owns `/writing/`; resume detail sources remain portfolio-owned and are copied only for URL compatibility.
