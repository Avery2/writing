import { initTheme } from './theme.js';

initTheme();

const enteredFromPortfolio = new URL(location.href).searchParams.get('from') === 'portfolio';

if (enteredFromPortfolio) {
  const backLink = document.querySelector('.content-back-link');
  if (backLink) {
    backLink.href = '/';
    backLink.textContent = '← Back to portfolio';
  }

  document.querySelectorAll('a[href^="/writing/experience/"], a[href^="/writing/education/"], a[href^="/writing/resume"]').forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set('from', 'portfolio');
    link.href = `${url.pathname}${url.search}${url.hash}`;
  });
}
