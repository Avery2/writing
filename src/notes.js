import { initTheme } from '../assets/theme.js';

const app = document.querySelector('#notes-app');
const { noteBySlug } = await import(app?.dataset.corpus || './corpus.generated.mjs');
const initialSlug = app?.dataset.initialNote;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let panes = [];
let expandedDepth = 0;
let expandedPinned = false;
let currentExpanded = true;
let historyExpanded = false;
let resizeFrame;

initTheme();

if (app && noteBySlug.has(initialSlug)) enhance();

function enhance() {
  const urlPath = pathFromURL();
  const statePath = urlPath || validPath(history.state?.notePath) || [initialSlug];
  const urlVias = urlPath ? viasFromURL(statePath) : null;
  const stateVias = Array.isArray(history.state?.noteVias) ? history.state.noteVias : [];
  panes = statePath.map((slug, depth) => makePane(slug, depth, (urlVias || stateVias)[depth - 1]));
  const urlPresentation = urlPath ? presentationFromURL(panes.length) : null;
  expandedDepth = validExpandedDepth(urlPresentation ? urlPresentation.expandedDepth : history.state?.expandedDepth, panes.length);
  expandedPinned = urlPresentation ? true : Boolean(history.state?.expandedPinned);
  currentExpanded = urlPresentation ? urlPresentation.currentExpanded : history.state?.currentExpanded !== false;
  historyExpanded = false;
  app.classList.add('is-enhanced');
  app.innerHTML = `<div class="stack-viewport" aria-label="Reading path"><div class="stack-track"></div></div>`;
  render({ focus: false, announce: false });
  replaceCurrentState();
  addEventListener('popstate', onPopState);
  addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => render({ focus: false, announce: false }));
  });
}

function validPath(path) {
  return Array.isArray(path) && path.length && path.every((slug) => noteBySlug.has(slug)) ? path : null;
}

function pathFromURL() {
  const encoded = new URL(location.href).searchParams.get('path');
  if (!encoded) return null;
  const path = encoded.split('~').filter(Boolean);
  return validPath(path) && path.at(-1) === initialSlug ? path : null;
}

function presentationFromURL(length) {
  const encoded = new URL(location.href).searchParams.get('open');
  if (!encoded) return null;
  const tokens = encoded.split(',');
  const currentExpanded = tokens.includes('last');
  const olderDepth = tokens
    .map((token) => Number.parseInt(token, 10) - 1)
    .find((depth) => Number.isInteger(depth) && depth >= 0 && depth < length - 1);
  return { expandedDepth: olderDepth ?? null, currentExpanded };
}

function stateURL(slug = panes.at(-1).noteId) {
  const url = new URL(noteBySlug.get(slug).url, location.origin);
  const params = [];
  if (panes.length > 1) params.push(`path=${slugs().join('~')}`);
  const vias = panes.slice(1).map((pane) => Number.isInteger(pane.via) ? pane.via : '');
  if (vias.some((via) => via !== '')) params.push(`via=${vias.join(',')}`);
  const open = [];
  if (expandedDepth !== null) open.push(String(expandedDepth + 1));
  if (currentExpanded) open.push('last');
  if (!open.length) open.push('1');
  params.push(`open=${open.join(',')}`);
  return `${url.pathname}?${params.join('&')}`;
}

function replaceCurrentState() {
  history.replaceState({ ...(history.state || {}), notePath: slugs(), noteVias: paneVias(), expandedDepth, expandedPinned, currentExpanded }, '', stateURL());
}

function viasFromURL(path) {
  const encoded = new URL(location.href).searchParams.get('via');
  if (!encoded) return [];
  return encoded.split(',').slice(0, path.length - 1).map((value) => /^\d+$/.test(value) ? Number(value) : null);
}

function validExpandedDepth(depth, length) {
  if (length < 2 || depth === null) return null;
  return Number.isInteger(depth) && depth >= 0 && depth < length - 1 ? depth : length - 2;
}

function slugs() { return panes.map((pane) => pane.noteId); }

function makePane(noteId, depth = 0, via = null) {
  return { noteId, depth, via: Number.isInteger(via) ? via : null, active: false, expanded: false, presentationMode: 'compact', width: 0, offset: 0 };
}

function paneVias() { return panes.slice(1).map((pane) => pane.via); }

function computePresentation() {
  const viewport = app.clientWidth || innerWidth;
  const mobile = viewport < 640;
  const compact = mobile ? 0 : 40;
  const currentIndex = panes.length - 1;
  expandedDepth = validExpandedDepth(expandedDepth, panes.length);
  let expandedIndexes = [];
  if (currentExpanded) expandedIndexes.push(currentIndex);
  if (expandedDepth !== null && expandedDepth !== currentIndex) expandedIndexes.push(expandedDepth);
  if (mobile && expandedIndexes.length > 1) expandedIndexes = [currentExpanded ? currentIndex : expandedDepth];
  if (!expandedIndexes.length) expandedIndexes = [0];

  panes.forEach((pane, index) => {
    pane.active = index === currentIndex;
    pane.expanded = expandedIndexes.includes(index);
    pane.presentationMode = pane.expanded ? 'full' : 'compact';
    pane.groupEnd = null;
    pane.canCondenseHistory = false;
    pane.primaryCondense = false;
    pane.width = pane.expanded ? 0 : compact;
  });

  if (!historyExpanded) condenseCompactRuns(compact);
  if (historyExpanded) {
    const compactPanes = panes.filter((pane) => !pane.expanded);
    if (compactPanes.length > 3) {
      compactPanes.forEach((pane) => { pane.canCondenseHistory = true; });
      compactPanes[Math.floor(compactPanes.length / 2)].primaryCondense = true;
    }
  }
  const compactWidth = panes.reduce((sum, pane) => sum + (pane.expanded ? 0 : pane.width), 0);
  const minimumReader = mobile ? Math.max(280, viewport - compact) : 440;
  const availableForReaders = viewport - compactWidth;
  const readerWidth = Math.max(minimumReader, availableForReaders / expandedIndexes.length);

  panes.forEach((pane) => { if (pane.expanded) pane.width = readerWidth; });
  let offset = 0;
  panes.forEach((pane) => {
    pane.offset = offset;
    offset += pane.width;
  });
  return { trackWidth: Math.max(viewport, offset), mobile };
}

function condenseCompactRuns(compactWidth) {
  let runStart = null;
  const flush = (end) => {
    if (runStart === null || end - runStart + 1 <= 3) return;
    for (let index = runStart + 1; index < end; index++) {
      panes[index].presentationMode = index === runStart + 1 ? 'group' : 'hidden';
      panes[index].width = index === runStart + 1 ? compactWidth : 0;
      panes[index].groupEnd = end - 1;
    }
  };
  panes.forEach((pane, index) => {
    if (!pane.expanded) {
      if (runStart === null) runStart = index;
    } else {
      flush(index - 1);
      runStart = null;
    }
  });
  flush(panes.length - 1);
}

function render({ focus = false, announce = true } = {}) {
  document.querySelector('.media-lightbox')?.remove();
  panes.forEach((pane, index) => { pane.depth = index; });
  const { trackWidth, mobile } = computePresentation();
  const viewportEl = app.querySelector('.stack-viewport');
  const trackEl = app.querySelector('.stack-track');
  viewportEl.classList.toggle('is-mobile-reader', mobile);
  viewportEl.classList.toggle('is-history-scrollable', !mobile && historyExpanded && trackWidth > viewportEl.clientWidth);
  trackEl.style.width = `${trackWidth}px`;
  trackEl.innerHTML = mobile ? mobileHTML() : panes.map(paneHTML).join('');
  bindInteractions();
  const active = panes.at(-1);
  if (!mobile) viewportEl.scrollLeft = Math.max(0, active.offset + active.width - viewportEl.clientWidth);
  const activeDocument = noteBySlug.get(active.noteId);
  const resumeDocument = ['resume', 'experience', 'education'].includes(activeDocument.kind);
  const projectDocument = activeDocument.kind === 'project' || activeDocument.kind === 'projects';
  const sectionTitle = resumeDocument ? 'Résumé' : projectDocument ? 'Projects' : 'Notes';
  document.title = `${activeDocument.title} — ${sectionTitle} — Avery`;
  if (focus) (trackEl.querySelector('.stack-pane--active h1') || trackEl.querySelector('.stack-pane--expanded h1'))?.focus({ preventScroll: true });
  if (announce) announcePath();
}

function paneHTML(pane) {
  const note = noteBySlug.get(pane.noteId);
  const activeClass = pane.active ? ' stack-pane--active' : '';
  if (pane.presentationMode === 'hidden') {
    return `<section class="stack-pane stack-pane--hidden" data-pane-depth="${pane.depth}" style="--pane-left:${pane.offset}px;--pane-width:0px;--pane-z:${pane.depth + 1}" aria-hidden="true"></section>`;
  }
  if (pane.presentationMode === 'group') {
    return `<section class="stack-pane stack-pane--group" data-pane-depth="${pane.depth}" style="--pane-left:${pane.offset}px;--pane-exposure:${pane.width}px;--pane-width:${pane.width}px;--pane-z:${pane.depth + 1}"><div class="pane-label" aria-hidden="true"><span class="history-depth">${pane.depth + 1}–${pane.groupEnd + 1}</span><strong>…</strong></div><button class="pane-return" data-expand-history aria-label="Show notes ${pane.depth + 1} through ${pane.groupEnd + 1}"></button></section>`;
  }
  const context = transitionContext(pane.depth);
  const paneContent = pane.expanded
    ? articleHTML(note)
    : `<div class="pane-label"><span class="history-depth">${String(pane.depth + 1).padStart(2, '0')}</span><span class="pane-copy"><strong class="pane-title">${escapeHTML(note.title)}</strong>${context ? `<span class="pane-context"><span aria-hidden="true"> — via </span><b>${escapeHTML(context.label)}</b></span>` : ''}</span></div>`;
  const content = pane.expanded ? paneContent : `<div class="pane-inactive-content" aria-hidden="true">${paneContent}</div>`;
  const returnControl = pane.expanded ? '' : `<button class="pane-return" data-depth="${pane.depth}" aria-label="Open ${note.title} beside the current note, step ${pane.depth + 1} of ${panes.length}"></button>`;
  const closeControl = pane.depth > 0
    ? pane.expanded
      ? `<button class="pane-close pane-close--expanded" data-collapse-depth="${pane.depth}" aria-label="Collapse ${note.title}"><span aria-hidden="true">×</span></button>`
      : `<button class="pane-close pane-close--compact" data-close-depth="${pane.depth}" aria-label="Close ${note.title} and all later notes"><span aria-hidden="true">×</span></button>`
    : '';
  const condenseControl = pane.canCondenseHistory ? `<button class="pane-condense-history${pane.primaryCondense ? ' is-primary' : ''}" data-collapse-history aria-label="Condense history" title="Condense history"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 10h5m-2.5-3 3 3-3 3M17.5 10h-5m2.5-3-3 3 3 3"/></svg></button>` : '';
  return `<section class="stack-pane stack-pane--${pane.presentationMode}${activeClass}${pane.expanded ? ' stack-pane--expanded' : ''}" data-pane-depth="${pane.depth}" style="--pane-left:${pane.offset}px;--pane-exposure:${pane.width}px;--pane-width:${pane.width}px;--pane-z:${pane.depth + 1}" ${pane.active ? 'aria-current="page"' : ''}>${closeControl}${condenseControl}${content}${returnControl}</section>`;
}

function mobileHTML() {
  const current = panes.at(-1);
  const crumbs = panes.map((pane, index) => {
    const note = noteBySlug.get(pane.noteId);
    return index === panes.length - 1
      ? `<li><span aria-current="page">${escapeHTML(note.title)}</span></li>`
      : `<li><button type="button" data-mobile-depth="${index}">${escapeHTML(note.title)}</button></li>`;
  }).join('');
  return `<nav class="mobile-breadcrumbs" aria-label="Reading path"><ol>${crumbs}</ol></nav><section class="mobile-note" data-pane-depth="${current.depth}" aria-current="page">${articleHTML(noteBySlug.get(current.noteId))}</section>`;
}

function transitionContext(depth) {
  const destination = panes[depth + 1];
  if (!destination || !Number.isInteger(destination.via)) return null;
  const container = document.createElement('div');
  container.innerHTML = articleHTML(noteBySlug.get(panes[depth].noteId));
  const link = container.querySelectorAll('[data-note-link]')[destination.via];
  if (!link || link.dataset.noteLink !== destination.noteId) return null;
  return { label: link.textContent };
}

function articleHTML(note) {
  const status = note.status === 'published' ? '' : `<span class="note-status note-status--${note.status}">${note.status}</span>`;
  const warning = note.ai_generated ? `<aside class="generated-note-notice" role="note"><strong>AI-generated example</strong><span>This is substantive prototype content written to test the linked-reading interface, not Avery’s published writing.</span></aside>` : '';
  const body = note.unavailable
    ? `<div class="unavailable-note"><p>This concept exists in the public graph, but its writing is not public.</p><p>No private note content is included in this site.</p></div>`
    : linkify(note.body);
  const sourceURL = `https://github.com/Avery2/writing/blob/main/${note.source_path}`;
  const isResumeDocument = ['resume', 'experience', 'education'].includes(note.kind);
  const isProjectDocument = ['project', 'projects'].includes(note.kind);
  const kicker = note.root_note ? 'About these notes' : isResumeDocument || isProjectDocument ? note.kind : 'Note';
  const meta = isResumeDocument && note.kind !== 'resume' ? `<div class="resume-meta"><span>${note.dates || ''}</span><span>${note.location || ''}</span>${note.detail ? `<span>${note.detail}</span>` : ''}</div>` : '';
  const projectMeta = isProjectDocument ? `${note.project_stats_html || ''}${note.project_actions_html || ''}` : '';
  const provenance = isProjectDocument
    ? `<footer class="writing-source">${note.provenance_html || `README synced from <a href="${note.repo_url || 'https://github.com/Avery2'}">GitHub</a>${note.synced_on ? ` on ${note.synced_on}` : ''}.`}</footer>`
    : `<footer class="writing-source">Generated from <a href="${sourceURL}">Markdown source on GitHub</a>.</footer>`;
  return `<article class="note-article" data-note="${note.slug}"><header class="note-header"><div class="note-kicker">${kicker} ${status}</div><h1 tabindex="-1">${note.title}</h1><p class="note-summary">${note.summary}</p>${meta}${warning}${projectMeta}</header><div class="note-body">${body}${note.related_html || ''}</div>${provenance}</article>`;
}

function linkify(body = '') {
  return body.replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (_, slug, label) => `<a href="${noteBySlug.get(slug)?.url}" data-note-link="${slug}"${noteBySlug.get(slug)?.unavailable ? ' data-unavailable="true"' : ''}>${label}</a>`);
}

function bindInteractions() {
  enhanceOutboundContent();
  app.querySelectorAll('.pane-return[data-depth]').forEach((button) => button.addEventListener('click', () => expandPane(Number(button.dataset.depth))));
  app.querySelectorAll('[data-expand-history]').forEach((button) => button.addEventListener('click', expandHistory));
  app.querySelectorAll('[data-collapse-history]').forEach((button) => button.addEventListener('click', collapseHistory));
  app.querySelectorAll('[data-collapse-depth]').forEach((button) => button.addEventListener('click', () => collapsePane(Number(button.dataset.collapseDepth))));
  app.querySelectorAll('[data-close-depth]').forEach((button) => {
    const depth = Number(button.dataset.closeDepth);
    button.addEventListener('click', () => closeFromDepth(depth));
    button.addEventListener('mouseenter', () => previewPrune(depth, true));
    button.addEventListener('mouseleave', () => previewPrune(depth, false));
    button.addEventListener('focus', () => previewPrune(depth, true));
    button.addEventListener('blur', () => previewPrune(depth, false));
  });
  app.querySelectorAll('[data-note-link]').forEach((link) => link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const sourceDepth = Number(link.closest('.stack-pane')?.style.getPropertyValue('--pane-z')) - 1;
    const paneElement = link.closest('[data-pane-depth]');
    const resolvedDepth = paneElement ? Number(paneElement.dataset.paneDepth) : sourceDepth;
    const links = [...paneElement.querySelectorAll('[data-note-link]')];
    openNote(link.dataset.noteLink, resolvedDepth, links.indexOf(link));
  }));
  app.querySelectorAll('[data-mobile-depth]').forEach((button) => button.addEventListener('click', () => navigateBack(Number(button.dataset.mobileDepth))));
  app.querySelector('.stack-pane--active')?.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'ArrowLeft' && panes.length > 1) {
      event.preventDefault();
      navigateBack(panes.length - 2);
    }
  });
}

function enhanceOutboundContent() {
  app.querySelectorAll('.note-body a[href], .writing-source a[href], .project-links a[href]').forEach((link) => {
    if (link.hasAttribute('data-note-link')) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin) return;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.externalLink = 'true';
    link.title ||= 'Opens in a new tab';
    if (!link.querySelector('.external-link-note')) {
      link.insertAdjacentHTML('beforeend', '<span class="external-link-note sr-only"> (opens in a new tab)</span>');
    }
  });

  app.querySelectorAll('.note-body img').forEach((image) => {
    const linkedImage = image.closest('a[href]');
    image.classList.add('lightbox-image');
    const trigger = linkedImage || image;
    trigger.setAttribute('aria-label', `${image.alt || 'Image'} — enlarge image`);
    if (!linkedImage) {
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
    }
    const open = (event) => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openImageLightbox(image, linkedImage?.href || image.currentSrc || image.src);
    };
    trigger.addEventListener('click', open);
    if (!linkedImage) image.addEventListener('keydown', open);
  });
}

function openImageLightbox(image, originalURL) {
  document.querySelector('.media-lightbox')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'media-lightbox';
  dialog.setAttribute('aria-label', image.alt ? `Image: ${image.alt}` : 'Image preview');
  dialog.innerHTML = `
    <div class="media-lightbox-toolbar">
      <a href="${escapeHTML(originalURL)}" target="_blank" rel="noopener noreferrer">Open original<span class="sr-only"> in a new tab</span></a>
      <button type="button" aria-label="Close image preview">×</button>
    </div>
    <div class="media-lightbox-stage">
      <img src="${escapeHTML(image.currentSrc || image.src)}" alt="${escapeHTML(image.alt || '')}">
    </div>`;
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function openNote(slug, sourceDepth = panes.length - 1, via = null) {
  if (!noteBySlug.has(slug)) return;
  const openedFromTerminal = sourceDepth === panes.length - 1;
  if (Number.isInteger(sourceDepth) && sourceDepth >= 0 && sourceDepth < panes.length - 1) {
    panes = panes.slice(0, sourceDepth + 1);
  }
  panes.push(makePane(slug, panes.length, via));
  if (!openedFromTerminal || !expandedPinned) expandedDepth = Math.max(0, panes.length - 2);
  expandedDepth = validExpandedDepth(expandedDepth, panes.length);
  if (!openedFromTerminal) expandedPinned = false;
  currentExpanded = true;
  historyExpanded = false;
  commit(slug, 'forward');
}

function expandPane(depth) {
  if (!panes[depth]) return;
  if (depth === panes.length - 1) currentExpanded = true;
  else expandedDepth = depth;
  expandedPinned = true;
  historyExpanded = false;
  replaceCurrentState();
  render({ focus: false, announce: false });
  app.querySelector(`.stack-pane[style*="--pane-z:${depth + 1}"] h1`)?.focus({ preventScroll: true });
}

function collapsePane(depth) {
  if (!panes[depth] || depth === 0) return;
  if (depth === panes.length - 1) currentExpanded = false;
  if (depth === expandedDepth) expandedDepth = null;
  expandedPinned = true;
  historyExpanded = false;
  replaceCurrentState();
  render({ focus: false, announce: false });
}

function expandHistory() {
  historyExpanded = true;
  render({ focus: false, announce: false });
}

function collapseHistory() {
  historyExpanded = false;
  render({ focus: false, announce: false });
}

function previewPrune(depth, visible) {
  app.querySelectorAll('[data-pane-depth]').forEach((pane) => {
    pane.classList.toggle('will-be-removed', visible && Number(pane.dataset.paneDepth) >= depth);
  });
}

function closeFromDepth(depth) {
  if (depth <= 0 || depth >= panes.length) return;
  const survivingExpandedDepth = expandedDepth !== null && expandedDepth < depth ? expandedDepth : null;
  panes = panes.slice(0, depth);
  const newCurrentDepth = panes.length - 1;
  currentExpanded = survivingExpandedDepth === newCurrentDepth;
  expandedDepth = currentExpanded ? null : survivingExpandedDepth;
  expandedPinned = true;
  historyExpanded = false;
  commit(panes.at(-1).noteId, 'back');
}

function navigateBack(depth) {
  const target = panes[depth];
  if (!target) return;
  panes = panes.slice(0, depth + 1);
  expandedDepth = Math.max(0, panes.length - 2);
  expandedPinned = false;
  currentExpanded = true;
  historyExpanded = false;
  commit(target.noteId, 'back');
}

function commit(slug, direction) {
  history.pushState({ notePath: slugs(), noteVias: paneVias(), expandedDepth, expandedPinned, currentExpanded }, '', stateURL(slug));
  app.dataset.direction = direction;
  render({ focus: true });
  if (!reduceMotion.matches) setTimeout(() => delete app.dataset.direction, 380);
}

function onPopState(event) {
  const path = validPath(event.state?.notePath);
  const slug = location.pathname.split('/').pop().replace('.html', '') || initialSlug;
  const restoredPath = path || [noteBySlug.has(slug) ? slug : initialSlug];
  const restoredVias = Array.isArray(event.state?.noteVias) ? event.state.noteVias : viasFromURL(restoredPath);
  panes = restoredPath.map((noteId, depth) => makePane(noteId, depth, restoredVias[depth - 1]));
  expandedDepth = validExpandedDepth(event.state?.expandedDepth, panes.length);
  expandedPinned = Boolean(event.state?.expandedPinned);
  currentExpanded = event.state?.currentExpanded !== false;
  historyExpanded = false;
  app.dataset.direction = 'back';
  render({ focus: true });
}

function announcePath() {
  let live = document.querySelector('#notes-live');
  if (!live) {
    live = document.createElement('p');
    live.id = 'notes-live';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
  }
  live.textContent = `${noteBySlug.get(panes.at(-1).noteId).title}. Reading path depth ${panes.length}.`;
}
