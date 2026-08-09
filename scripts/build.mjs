import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const contentDirectory = new URL('../content/notes/', import.meta.url);
const argumentsList = process.argv.slice(2);
const checkOnly = argumentsList.includes('--check');

function argumentValue(name, fallback) {
  const index = argumentsList.indexOf(name);
  return index >= 0 && argumentsList[index + 1] ? argumentsList[index + 1] : fallback;
}

const outputPath = resolve(process.cwd(), argumentValue('--output', 'dist/writing'));
const outputDirectory = pathToFileURL(`${outputPath}/`);
const notesDirectory = new URL('./notes/', outputDirectory);
const assetsDirectory = new URL('./assets/', outputDirectory);
const baseURL = normalizeBase(argumentValue('--base-url', '/writing/'));

function normalizeBase(value) {
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value.startsWith('"')) return JSON.parse(value);
  return value;
}

function parseNote(source, filename) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename} is missing YAML frontmatter`);
  const metadata = Object.fromEntries(match[1].split('\n').filter(Boolean).map((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`${filename} has invalid frontmatter: ${line}`);
    return [line.slice(0, separator).trim(), parseValue(line.slice(separator + 1).trim())];
  }));
  validateMetadata(metadata, filename);
  const privateBody = metadata.status === 'private';
  return {
    visibility: 'listed',
    ...metadata,
    unavailable: metadata.unavailable || privateBody,
    body: privateBody ? '' : markdownToHTML(match[2].trim())
  };
}

function validateMetadata(note, filename) {
  for (const field of ['slug', 'title', 'summary', 'status']) {
    if (!note[field]) throw new Error(`${filename} is missing ${field}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(note.slug)) throw new Error(`${filename} has invalid slug: ${note.slug}`);
  if (!['published', 'draft', 'stub', 'private'].includes(note.status)) throw new Error(`${filename} has invalid status: ${note.status}`);
  if (note.visibility && !['featured', 'listed', 'unlisted'].includes(note.visibility)) throw new Error(`${filename} has invalid visibility: ${note.visibility}`);
}

function escapeHTML(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function inlineMarkdown(value) {
  return escapeHTML(value)
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '[[$1|$2]]')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHTML(markdown) {
  if (!markdown) return '';
  return markdown.split(/\n\s*\n/).map((block) => {
    const text = block.split('\n').map((line) => line.trim()).join(' ');
    if (text.startsWith('> ')) return `<blockquote>${inlineMarkdown(text.slice(2))}</blockquote>`;
    return `<p>${inlineMarkdown(text)}</p>`;
  }).join('\n');
}

const files = (await readdir(contentDirectory)).filter((file) => file.endsWith('.md')).sort();
const notes = await Promise.all(files.map(async (file) => parseNote(await readFile(new URL(file, contentDirectory), 'utf8'), file)));
notes.sort((a, b) => Number(Boolean(b.root_note)) - Number(Boolean(a.root_note)) || a.title.localeCompare(b.title));
const noteBySlug = new Map();
for (const note of notes) {
  if (noteBySlug.has(note.slug)) throw new Error(`Duplicate slug: ${note.slug}`);
  noteBySlug.set(note.slug, note);
}

function linkify(body = '') {
  return body.replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (_, slug, label) => {
    const target = noteBySlug.get(slug);
    if (!target) throw new Error(`Broken note link: ${slug}`);
    const unavailable = target.unavailable ? ' data-unavailable="true"' : '';
    return `<a href="./${slug}.html" data-note-link="${slug}"${unavailable}>${label}</a>`;
  });
}

function article(note) {
  const status = note.status === 'published' ? '' : `<span class="note-status note-status--${note.status}">${note.status}</span>`;
  const warning = note.ai_generated ? `<aside class="generated-note-notice" role="note"><strong>AI-generated example</strong><span>This is substantive prototype content written to test the linked-reading interface, not Avery’s published writing.</span></aside>` : '';
  const body = note.unavailable
    ? `<div class="unavailable-note"><p>This concept exists in the public graph, but its writing is not public.</p><p>No private note content is included in this site.</p></div>`
    : linkify(note.body);
  return `<article class="note-article" data-note="${note.slug}">
    <header class="note-header">
      <div class="note-kicker">${note.root_note ? 'About these notes' : 'Note'} ${status}</div>
      <h1 tabindex="-1">${escapeHTML(note.title)}</h1>
      <p class="note-summary">${escapeHTML(note.summary)}</p>
      ${warning}
    </header>
    <div class="note-body">${body}</div>
  </article>`;
}

function page(note) {
  const robots = note.visibility === 'unlisted' ? '<meta name="robots" content="noindex">' : '';
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHTML(note.summary)}">
  ${robots}
  <title>${escapeHTML(note.title)} — Notes — Avery</title>
  <link rel="stylesheet" href="${baseURL}assets/portfolio-foundation.css">
  <link rel="stylesheet" href="./notes.css">
  <script type="module" src="./notes.js"></script>
</head>
<body class="notes-page">
  <header class="notes-site-header">
    <a class="notes-brand" href="/">Avery</a>
    <a class="notes-home" href="${baseURL}notes/notes.html">Notes</a>
    <button id="theme-toggle" class="notes-theme" type="button" aria-label="Toggle color theme">◐</button>
  </header>
  <main id="notes-app" class="notes-app" data-initial-note="${note.slug}">
    <div class="baseline-note">${article(note)}</div>
  </main>
  <noscript><p class="notes-noscript">The note remains readable without JavaScript; linked notes open as ordinary pages.</p></noscript>
</body>
</html>`;
}

// Validate every graph edge even during check-only runs.
for (const note of notes) linkify(note.body);

if (checkOnly) {
  console.log(`Validated ${notes.length} notes and ${files.length} Markdown sources.`);
  process.exit(0);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(notesDirectory, { recursive: true });
await mkdir(assetsDirectory, { recursive: true });

await Promise.all([
  cp(new URL('../src/notes.js', import.meta.url), new URL('./notes.js', notesDirectory)),
  cp(new URL('../src/notes.css', import.meta.url), new URL('./notes.css', notesDirectory)),
  cp(new URL('../src/notes-index.js', import.meta.url), new URL('./notes-index.js', notesDirectory)),
  cp(new URL('../src/theme.js', import.meta.url), new URL('./theme.js', assetsDirectory)),
  cp(new URL('../styles/portfolio-foundation.css', import.meta.url), new URL('./portfolio-foundation.css', assetsDirectory))
]);

await Promise.all(notes.map((note) => writeFile(new URL(`./${note.slug}.html`, notesDirectory), page(note))));

const publicIndexNotes = notes.filter((note) => !note.unavailable && !note.root_note && note.visibility !== 'unlisted');
const cards = publicIndexNotes.map((note) => `<li><a href="./${note.slug}.html"><strong>${escapeHTML(note.title)}</strong><span>${escapeHTML(note.summary)}</span><small>${note.ai_generated ? 'AI example · ' : ''}${note.status}</small></a></li>`).join('\n');
await writeFile(new URL('./index.html', notesDirectory), `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Example notes — Avery</title><link rel="stylesheet" href="${baseURL}assets/portfolio-foundation.css"><link rel="stylesheet" href="./notes.css"><script type="module" src="./notes-index.js"></script></head><body class="notes-page notes-index-page"><header class="notes-site-header"><a class="notes-brand" href="/">Avery</a><a class="notes-home" href="./notes.html">Notes</a><button id="theme-toggle" class="notes-theme" type="button" aria-label="Toggle color theme">◐</button></header><main class="notes-index"><header><p class="note-kicker">AI-generated prototype corpus</p><h1>Seeing and navigating information</h1><p>Substantive example writing created to test the linked-notes interaction. This is not presented as Avery’s published writing.</p></header><ul>${cards}</ul></main></body></html>`);

await writeFile(new URL('./corpus.generated.mjs', notesDirectory), `// Generated by scripts/build.mjs from content/notes/*.md. Do not edit directly.\nexport const notes = ${JSON.stringify(notes, null, 2)};\nexport const noteBySlug = new Map(notes.map((note) => [note.slug, note]));\n`);

const manifest = notes.map(({ body, ...metadata }) => ({ ...metadata, url: `${baseURL}notes/${metadata.slug}.html` }));
await writeFile(new URL('./manifest.json', outputDirectory), `${JSON.stringify({ generated_at: new Date().toISOString(), notes: manifest }, null, 2)}\n`);

await writeFile(new URL('./harm-reduction.html', outputDirectory), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${baseURL}notes/harm-reduction.html"><link rel="canonical" href="${baseURL}notes/harm-reduction.html"><title>Harm Reduction — Avery</title></head><body><p>This writing has moved to <a href="${baseURL}notes/harm-reduction.html">Harm Reduction</a>.</p></body></html>`);

console.log(`Built ${notes.length} notes to ${outputPath} with base ${baseURL}`);
