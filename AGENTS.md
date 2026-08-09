# Writing repository instructions

This repository owns Avery's Markdown corpus, note graph, writing compiler, linked reading interface, and the GitHub Pages project site mounted at `/writing/`. The portfolio repository owns the parent homepage and manually curated entry points.

## Invariants

- Markdown plus YAML frontmatter under `content/` is the source of truth.
- Never edit generated files in `dist/` as source.
- Preserve stable slugs and real static note routes.
- The graph is the information architecture; the stacked active path is the reading interface.
- Two panes may remain full reading surfaces. Other history compresses without losing navigation.
- Browser history, direct links, and serialized `path`/`open` URL state must remain meaningful.
- Ordinary static pages must remain readable if enhancement JavaScript fails.
- Publishing and portfolio featuring are separate editorial decisions.
- Disconnected and unlisted public graphs are valid.
- `writing.config.json` is the single source for the landing/root note and compatibility redirects.
- Experience and education sources live here and retain their stable `/writing/experience/` and `/writing/education/` routes; the portfolio may link to them but must not generate their HTML.
- Experience, education, and the résumé overview are first-class graph nodes rendered by the stacked reading runtime, not a separate page family. Preserve that shared behavior when adding metadata or layouts.

## Privacy

- Both source and build output are public; never commit actual private prose here.
- `status: private` must never emit the Markdown body or include it in client data.
- Public title/summary metadata for an unavailable concept is allowed.
- Never implement privacy by shipping prose and hiding it in CSS or client JavaScript.

## Styling

- Treat the portfolio as a sibling design system, not a runtime dependency.
- Maintain the small shared token snapshot in `styles/portfolio-foundation.css`.
- Keep vertical reading scroll distinct from horizontal path navigation.
- Respect keyboard navigation, reduced motion, focus, semantic headings, and native links.

## Before committing

Run `npm run check`. For content changes, inspect the generated route and verify that every `[[slug|label]]` target resolves.
