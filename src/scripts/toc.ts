// Scrollspy: highlight the section currently being read in every table of contents, and open
// that chapter's sections in the desktop index.
const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc] a[href^="#"]')];
const ids = [...new Set(links.map((a) => decodeURIComponent(a.hash.slice(1))))];
const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
const chapters = [...document.querySelectorAll<HTMLElement>('nav.toc [data-chapter]')];
const index = document.querySelector<HTMLElement>('nav.toc');
index?.classList.add('collapsible');

/** Keep the desktop index pinned only while all of it fits in the window. */
function fit() {
  if (!index) return;
  index.classList.remove('unpinned');
  const header = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 0;
  index.classList.toggle('unpinned', index.offsetHeight > innerHeight - header - 48);
}

let current = '';
function update() {
  // The section being read is the last heading above a line just under the sticky header.
  const line = (document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 0) + 96;
  let active = targets[0]?.id ?? '';
  for (const el of targets) {
    if (el.getBoundingClientRect().top - line <= 0) active = el.id;
    else break;
  }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) active = targets[targets.length - 1]?.id ?? active;
  if (active === current) return;
  current = active;
  for (const a of links) {
    if (decodeURIComponent(a.hash.slice(1)) === active) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
  for (const chapter of chapters) {
    chapter.classList.toggle('open', !!chapter.querySelector('a[aria-current="true"]'));
  }
  fit();
}

let queued = false;
addEventListener(
  'scroll',
  () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  },
  { passive: true },
);
addEventListener('resize', () => {
  update();
  fit();
});
update();

// Close the mobile contents panel after choosing a section.
for (const details of document.querySelectorAll<HTMLDetailsElement>('details.toc-mobile')) {
  details.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) details.open = false;
  });
}

export {};
