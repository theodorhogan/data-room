// Back to top: shown on long pages once the reader is more than a screen down.
const button = document.querySelector<HTMLButtonElement>('[data-to-top]');

if (button) {
  let queued = false;
  const update = () => {
    queued = false;
    const long = document.documentElement.scrollHeight > innerHeight * 2.5;
    button.toggleAttribute('data-visible', long && scrollY > innerHeight);
  };
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  addEventListener('resize', update);
  update();

  button.addEventListener('click', (event) => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // A keyboard press continues from the top of the page (the skip link is its first stop).
    if (event.detail === 0) document.querySelector<HTMLElement>('.skip-link')?.focus({ preventScroll: true });
  });
}

export {};
