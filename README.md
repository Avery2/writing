# Avery's writing

This private repository is the source of truth and publishing engine for writing served at [`averychan.site/writing/`](https://www.averychan.site/writing/). The portfolio repository owns the domain and final GitHub Pages deployment; this repository owns the Markdown, note graph, templates, and build rules.

## How publishing works

```text
content/notes/*.md
        ↓
scripts/build.mjs
        ↓
static HTML + linked-note enhancement
        ↓
Avery2.github.io Pages workflow
        ↓
averychan.site/writing/
```

The portfolio workflow checks out this repository with a read-only deploy key and runs:

```bash
npm run build -- --output ../_site/writing --base-url /writing/
```

Generated output belongs in `dist/` locally and is not committed. The portfolio manually chooses which public entry points appear as homepage cards; publishing a note does not automatically feature it.

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
- `root_note`: Marks the main Notes introduction.
- `unavailable`: Publishes metadata and an unavailable destination without a body.

`status` and `visibility` are intentionally separate. A generated page may be public but unlisted. The portfolio's `manual-tiles.yml` remains the explicit editorial list of featured entry points.

## Privacy boundary

This repository is private, but its build output is public. The compiler never emits a body for `status: private`; it publishes public metadata and the unavailable-state message only. Do not put sensitive details in titles or summaries. Review generated `dist/writing/` before publishing changes to privacy behavior.

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

The writing site is visually related to the portfolio but independently owned. `styles/portfolio-foundation.css` contains the small token/reset contract it needs. Avoid importing the portfolio's complete CSS or moving writing compilation back into the portfolio repository.
