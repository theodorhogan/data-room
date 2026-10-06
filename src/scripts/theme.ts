// Light/dark toggle. The site starts light; a reader's choice of dark is remembered.
const root = document.documentElement;

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('data-room:theme', next);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
});

export {};
