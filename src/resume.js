import { initTheme } from './theme.js';

initTheme();

if (new URL(location.href).searchParams.get('from') === 'portfolio') {
  const backLink = document.querySelector('.content-back-link');
  if (backLink) {
    backLink.href = '/';
    backLink.textContent = '← Back to portfolio';
  }
}
