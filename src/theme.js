const KEY = 'site-theme-override';
let override = null;

export function initTheme() {
  override = sessionStorage.getItem(KEY);
  apply();
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    override = resolved() === 'dark' ? 'light' : 'dark';
    sessionStorage.setItem(KEY, override);
    apply();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!override) apply(); });
}

function resolved() {
  return override || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function apply() {
  document.documentElement.dataset.theme = resolved();
  const button = document.querySelector('#theme-toggle');
  if (button) button.textContent = resolved() === 'dark' ? '🌙' : '☀️';
}

