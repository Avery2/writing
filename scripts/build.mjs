import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const contentDirectory = new URL('../content/notes/', import.meta.url);
const experienceDirectory = new URL('../content/experience/', import.meta.url);
const educationDirectory = new URL('../content/education/', import.meta.url);
const config = JSON.parse(await readFile(new URL('../writing.config.json', import.meta.url), 'utf8'));
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
const baseURL = normalizeBase(argumentValue('--base-url', config.base_url));

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

function parseNote(source, filename, sourcePath = filename) {
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
    source_path: sourcePath,
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
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHTML(markdown) {
  if (!markdown) return '';
  return markdown.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n').map((line) => line.trim());
    if (lines.every((line) => line.startsWith('- '))) {
      return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.slice(2))}</li>`).join('')}</ul>`;
    }
    const heading = lines[0].match(/^(#{2,3})\s+(.+)$/);
    if (heading && lines.length === 1) return `<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`;
    const text = lines.join(' ');
    if (text.startsWith('> ')) return `<blockquote>${inlineMarkdown(text.slice(2))}</blockquote>`;
    return `<p>${inlineMarkdown(text)}</p>`;
  }).join('\n');
}

const files = (await readdir(contentDirectory)).filter((file) => file.endsWith('.md')).sort();
const notes = await Promise.all(files.map(async (file) => parseNote(await readFile(new URL(file, contentDirectory), 'utf8'), file, `content/notes/${file}`)));

async function loadDocuments(directory, kind) {
  const sourceFiles = (await readdir(directory)).filter((file) => file.endsWith('.md')).sort();
  const documents = await Promise.all(sourceFiles.map(async (file) => parseNote(await readFile(new URL(file, directory), 'utf8'), `${kind}/${file}`, `content/${kind}/${file}`)));
  for (const document of documents) {
    if (document.kind !== kind) throw new Error(`${kind}/${document.slug}.md must declare kind: ${kind}`);
  }
  return { sourceFiles, documents };
}

const { sourceFiles: experienceFiles, documents: experiences } = await loadDocuments(experienceDirectory, 'experience');
const { sourceFiles: educationFiles, documents: education } = await loadDocuments(educationDirectory, 'education');
const resume = parseNote(await readFile(new URL('../content/resume.md', import.meta.url), 'utf8'), 'resume.md', 'content/resume.md');
if (resume.kind !== 'resume' || resume.slug !== config.resume_root) throw new Error('content/resume.md must match the configured resume_root');
const resumeEntries = [...experiences, ...education];
const noteBySlug = new Map();
for (const note of notes) {
  if (noteBySlug.has(note.slug)) throw new Error(`Duplicate slug: ${note.slug}`);
  noteBySlug.set(note.slug, note);
}
const rootNote = noteBySlug.get(config.root_note);
if (!rootNote) throw new Error(`Configured root note does not exist: ${config.root_note}`);
notes.forEach((note) => { note.root_note = note.slug === config.root_note; });
notes.sort((a, b) => Number(b.root_note) - Number(a.root_note) || a.title.localeCompare(b.title));

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
  const backLink = note.root_note ? `<a class="content-back-link" href="/">← Back to portfolio</a>` : '';
  return `<article class="note-article" data-note="${note.slug}">
    ${backLink}
    <header class="note-header">
      <div class="note-kicker">${note.root_note ? 'About these notes' : 'Note'} ${status}</div>
      <h1 tabindex="-1">${escapeHTML(note.title)}</h1>
      <p class="note-summary">${escapeHTML(note.summary)}</p>
      ${warning}
    </header>
    <div class="note-body">${body}</div>
    ${sourceNotice(note)}
  </article>`;
}

function sourceNotice(document) {
  const sourceURL = `${config.repository_url}/blob/main/${document.source_path}`;
  return `<footer class="writing-source">Generated from <a href="${sourceURL}">Markdown source on GitHub</a>.</footer>`;
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
  <link rel="icon" href="${config.favicon_url}" type="image/jpeg">
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
  console.log(`Validated ${notes.length} notes and ${files.length + experienceFiles.length + educationFiles.length + 1} Markdown sources.`);
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
  cp(new URL('../src/resume.js', import.meta.url), new URL('./resume.js', assetsDirectory)),
  cp(new URL('../src/resume.css', import.meta.url), new URL('./resume.css', assetsDirectory)),
  cp(new URL('../styles/portfolio-foundation.css', import.meta.url), new URL('./portfolio-foundation.css', assetsDirectory))
]);

await Promise.all(notes.map((note) => writeFile(new URL(`./${note.slug}.html`, notesDirectory), page(note))));

const publicIndexNotes = notes.filter((note) => !note.unavailable && !note.root_note && note.visibility !== 'unlisted');
const cards = publicIndexNotes.map((note) => `<li><a href="./${note.slug}.html"><strong>${escapeHTML(note.title)}</strong><span>${escapeHTML(note.summary)}</span><small>${note.ai_generated ? 'AI example · ' : ''}${note.status}</small></a></li>`).join('\n');
await writeFile(new URL('./index.html', notesDirectory), `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Example notes — Avery</title><link rel="icon" href="${config.favicon_url}" type="image/jpeg"><link rel="stylesheet" href="${baseURL}assets/portfolio-foundation.css"><link rel="stylesheet" href="./notes.css"><script type="module" src="./notes-index.js"></script></head><body class="notes-page notes-index-page"><header class="notes-site-header"><a class="notes-brand" href="/">Avery</a><a class="notes-home" href="./notes.html">Notes</a><button id="theme-toggle" class="notes-theme" type="button" aria-label="Toggle color theme">◐</button></header><main class="notes-index"><header><p class="note-kicker">AI-generated prototype corpus</p><h1>Seeing and navigating information</h1><p>Substantive example writing created to test the linked-notes interaction. This is not presented as Avery’s published writing.</p></header><ul>${cards}</ul></main></body></html>`);

await writeFile(new URL('./corpus.generated.mjs', notesDirectory), `// Generated by scripts/build.mjs from content/notes/*.md. Do not edit directly.\nexport const notes = ${JSON.stringify(notes, null, 2)};\nexport const noteBySlug = new Map(notes.map((note) => [note.slug, note]));\n`);

const manifest = notes.map(({ body, ...metadata }) => ({ ...metadata, url: `${baseURL}notes/${metadata.slug}.html` }));
await writeFile(new URL('./manifest.json', outputDirectory), `${JSON.stringify({ generated_at: new Date().toISOString(), notes: manifest }, null, 2)}\n`);

function resumeNavigation(activeSlug = '') {
  const links = resumeEntries.map((entry) => {
    const current = entry.slug === activeSlug ? ' aria-current="page"' : '';
    return `<li><a href="${baseURL}${entry.kind}/${entry.slug}.html"${current}>${escapeHTML(entry.title)}</a></li>`;
  }).join('');
  return `<nav class="resume-nav" aria-label="Experience and education">
    <h2>More experience and education</h2>
    <ul>${links}</ul>
    <p><a href="${baseURL}${resume.slug}.html">Experience and education overview</a> · <a href="${baseURL}resume/full.html">View full résumé</a></p>
  </nav>`;
}

function resumePage(document, { index = false } = {}) {
  const meta = index ? '' : `<div class="resume-meta"><span>${escapeHTML(document.dates || '')}</span><span>${escapeHTML(document.location || '')}</span>${document.detail ? `<span>${escapeHTML(document.detail)}</span>` : ''}</div>`;
  const entryList = index ? `<h2>Entries</h2><ul class="resume-index">${resumeEntries.map((entry) => `<li><a href="${baseURL}${entry.kind}/${entry.slug}.html">${escapeHTML(entry.title)}</a> — ${escapeHTML(entry.summary)}</li>`).join('')}</ul>` : '';
  return `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escapeHTML(document.summary)}"><title>${escapeHTML(document.title)} — Avery</title><link rel="icon" href="${config.favicon_url}" type="image/jpeg"><link rel="stylesheet" href="${baseURL}assets/portfolio-foundation.css"><link rel="stylesheet" href="${baseURL}notes/notes.css"><link rel="stylesheet" href="${baseURL}assets/resume.css"><script type="module" src="${baseURL}assets/resume.js"></script></head>
<body class="notes-page resume-page"><header class="notes-site-header"><a class="notes-brand" href="/">Avery</a><a class="notes-home" href="${baseURL}${resume.slug}.html">Résumé</a><button id="theme-toggle" class="notes-theme" type="button" aria-label="Toggle color theme">◐</button></header><main class="resume-shell"><article class="note-article"><a class="content-back-link" href="${index ? '/' : `${baseURL}${resume.slug}.html`}">← ${index ? 'Back to portfolio' : 'Back to experience and education'}</a><header class="note-header"><div class="note-kicker">${index ? 'Résumé' : escapeHTML(document.kind)}</div><h1>${escapeHTML(document.title)}</h1><p class="note-summary">${escapeHTML(document.summary)}</p>${meta}</header><div class="note-body">${document.body}${entryList}</div>${resumeNavigation(index ? '' : document.slug)}${sourceNotice(document)}</article></main></body></html>`;
}

function fullResumePage() {
  return `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Avery’s full résumé"><title>Full résumé — Avery</title><link rel="icon" href="${config.favicon_url}" type="image/jpeg"><link rel="stylesheet" href="${baseURL}assets/portfolio-foundation.css"><link rel="stylesheet" href="${baseURL}notes/notes.css"><link rel="stylesheet" href="${baseURL}assets/resume.css"><script type="module" src="${baseURL}assets/resume.js"></script></head>
<body class="notes-page resume-page"><header class="notes-site-header"><a class="notes-brand" href="/">Avery</a><a class="notes-home" href="${baseURL}${resume.slug}.html">Résumé</a><button id="theme-toggle" class="notes-theme" type="button" aria-label="Toggle color theme">◐</button></header><main class="resume-viewer-shell"><a class="content-back-link" href="${baseURL}${resume.slug}.html">← Back to experience and education</a><header class="resume-viewer-header"><div><div class="note-kicker">Résumé</div><h1>Full résumé</h1></div><a class="resume-pdf-link" href="${config.full_resume_pdf_url}">Open or download PDF</a></header><iframe class="resume-pdf-frame" title="Avery’s full résumé PDF" src="${config.full_resume_pdf_url}"><p>Your browser cannot embed this PDF. <a href="${config.full_resume_pdf_url}">Open the résumé PDF</a>.</p></iframe><footer class="writing-source">PDF generated from <a href="${config.full_resume_source_url}">HTML source on GitHub</a>.</footer></main></body></html>`;
}

await mkdir(new URL('./experience/', outputDirectory), { recursive: true });
await mkdir(new URL('./education/', outputDirectory), { recursive: true });
await Promise.all(resumeEntries.map((entry) => writeFile(new URL(`./${entry.kind}/${entry.slug}.html`, outputDirectory), resumePage(entry))));
await writeFile(new URL(`./${resume.slug}.html`, outputDirectory), resumePage(resume, { index: true }));
await mkdir(new URL('./resume/', outputDirectory), { recursive: true });
await writeFile(new URL('./resume/full.html', outputDirectory), fullResumePage());

function redirectPage(destination, title) {
  const encodedDestination = JSON.stringify(destination).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="${destination}"><link rel="icon" href="${config.favicon_url}" type="image/jpeg"><title>${escapeHTML(title)} — Avery</title><script>location.replace(${encodedDestination})</script></head><body><p>Continue to <a href="${destination}">${escapeHTML(title)}</a>.</p></body></html>`;
}

await writeFile(new URL('./index.html', outputDirectory), redirectPage(`${baseURL}notes/${rootNote.slug}.html`, rootNote.title));
for (const [legacyPath, destination] of Object.entries(config.legacy_redirects || {})) {
  await writeFile(new URL(`./${legacyPath}`, outputDirectory), redirectPage(`${baseURL}${destination}`, noteBySlug.get(destination.split('/').at(-1).replace('.html', ''))?.title || 'Writing'));
}

console.log(`Built ${notes.length} notes to ${outputPath} with base ${baseURL}`);
