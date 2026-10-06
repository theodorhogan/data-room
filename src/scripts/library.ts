/**
 * Library: client-side filtering of the ruled tile grid.
 *
 * One state object lives in the URL (?kind=workbook&tag=dcf,cca&ticker=PRLB&year=2026&q=…&view=list).
 * Every control writes to it and a single render() reads it. Facet counts are recalculated against the
 * other active filters on every render; values with no results are disabled, never hidden.
 *
 * Semantics: kind is single-select; topics narrow (an item must carry every selected topic);
 * companies and years widen within their group (any selected value) and narrow across groups.
 *
 * Search matches titles, summaries, tags and tickers at once; in the built site the Pagefind index
 * adds full-text matches a moment later and shows the matching passage in place of the summary.
 */

interface PagefindResult {
  url: string;
  excerpt: string;
  /** The page text, and the positions of the matched words in it (split on whitespace). */
  content?: string;
  locations?: number[];
  /** Page metadata (title, kind), which Pagefind also searches. */
  meta?: Record<string, string>;
}
interface Pagefind {
  options?(opts: { excerptLength?: number }): Promise<void> | void;
  debouncedSearch(q: string, opts?: object, ms?: number): Promise<{ results: { data(): Promise<PagefindResult> }[] } | null>;
}

type ListGroup = 'tag' | 'ticker' | 'year';
type Group = 'kind' | ListGroup;
type View = 'grid' | 'list';

interface State {
  kind: string;
  tag: string[];
  ticker: string[];
  year: string[];
  q: string;
  view: View;
}

interface Item {
  el: HTMLElement;
  summary: HTMLElement | null;
  summaryText: string;
  id: string;
  kind: string;
  /** research | artifact: only for links from the earlier library (?kind=research). */
  pubKind: string;
  year: string;
  tags: string[];
  tickers: string[];
  text: string;
}

const words = (value: string | undefined) => (value ? value.split(/\s+/).filter(Boolean) : []);
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
/** Only text entry swallows the "/" shortcut; radios, checkboxes and buttons let it through to the search field. */
const NOT_TEXT = new Set(['radio', 'checkbox', 'button', 'submit', 'reset', 'image', 'range', 'color', 'file']);
const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    (t instanceof HTMLInputElement && !NOT_TEXT.has(t.type)) ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement);
/** Phones show Company and Year as bottom sheets over a backdrop. */
const sheetQuery = matchMedia('(max-width: 639px)');

function init(root: HTMLElement) {
  const one = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const all = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];

  const form = one<HTMLFormElement>('[data-form]')!;
  const wall = one('[data-wall]')!;
  const feature = one('[data-feature]');
  const blanks = all('[data-blank]');
  const empty = one('[data-empty]')!;
  const emptyTitle = one('[data-empty-title]')!;
  const undo = one<HTMLButtonElement>('[data-undo]')!;
  const statusN = one('[data-status-n]')!;
  const statusCount = one('[data-status-count]')!;
  const statusSearching = one('[data-status-searching]')!;
  const search = one<HTMLInputElement>('[data-search]')!;
  const radios = all<HTMLInputElement>('input[name="kind"]');
  const chips = all<HTMLButtonElement>('[data-chip]');
  const boxes = all<HTMLInputElement>('input[name="ticker"], input[name="year"]');
  const pops = all<HTMLDetailsElement>('[data-pop]');
  const tokenList = one('[data-tokens]')!;
  const tokens = all('[data-token]');
  const qText = one('[data-q-text]')!;
  const clearers = all<HTMLButtonElement>('[data-clear]');
  const views = one('[data-views]')!;
  const viewBtns = all<HTMLButtonElement>('[data-set-view]');
  const tabs = one('[data-tabs]')!;
  const tickerBtns = all<HTMLButtonElement>('[data-ticker]');
  const rails = all('[data-rail]');

  const items: Item[] = all('[data-item]').map((el) => ({
    el,
    summary: el.querySelector<HTMLElement>('[data-summary]'),
    summaryText: el.querySelector<HTMLElement>('[data-summary]')?.textContent ?? '',
    id: el.dataset.id ?? '',
    kind: el.dataset.kind ?? '',
    pubKind: el.dataset.pubKind ?? '',
    year: el.dataset.year ?? '',
    tags: words(el.dataset.tags),
    tickers: words(el.dataset.tickers),
    text: el.dataset.text ?? '',
  }));
  const valid: Record<Group, Set<string>> = {
    kind: new Set([...radios.map((r) => r.value).filter(Boolean), ...all('[data-legacy-kind]').map((t) => t.dataset.legacyKind ?? '')]),
    tag: new Set(chips.map((c) => c.dataset.chip ?? '')),
    ticker: new Set(boxes.filter((b) => b.name === 'ticker').map((b) => b.value)),
    year: new Set(boxes.filter((b) => b.name === 'year').map((b) => b.value)),
  };
  const labels = new Map(tokens.map((t) => [t.dataset.token ?? '', t.dataset.label ?? '']));

  // ---------------------------------------------------------------- state <-> URL
  function readUrl(): State {
    const p = new URLSearchParams(location.search);
    const list = (name: ListGroup, norm: (v: string) => string) => [
      ...new Set(
        p
          .getAll(name)
          .flatMap((v) => v.split(','))
          .map((v) => norm(v.trim()))
          .filter((v) => valid[name].has(v)),
      ),
    ];
    const kind = (p.get('kind') ?? '').toLowerCase();
    return {
      kind: valid.kind.has(kind) ? kind : '',
      tag: list('tag', (v) => v.toLowerCase()),
      ticker: list('ticker', (v) => v.toUpperCase()),
      year: list('year', (v) => v),
      q: (p.get('q') ?? '').trim(),
      view: p.get('view') === 'list' ? 'list' : 'grid',
    };
  }

  function toQuery(s: State): string {
    const parts: string[] = [];
    const add = (key: string, values: string[]) => {
      if (values.length) parts.push(`${key}=${values.map(encodeURIComponent).join(',')}`);
    };
    add('kind', s.kind ? [s.kind] : []);
    add('tag', s.tag);
    add('ticker', s.ticker);
    add('year', s.year);
    add('q', s.q ? [s.q] : []);
    if (s.view === 'list') parts.push('view=list');
    return parts.join('&');
  }

  function writeUrl(push: boolean) {
    const qs = toQuery(state);
    const next = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
    if (next === `${location.pathname}${location.search}${location.hash}`) return;
    if (push) history.pushState(null, '', next);
    else history.replaceState(null, '', next);
  }

  const keysOf = (s: State) => [
    ...(s.kind ? [`kind:${s.kind}`] : []),
    ...s.tag.map((v) => `tag:${v}`),
    ...s.ticker.map((v) => `ticker:${v}`),
    ...s.year.map((v) => `year:${v}`),
    ...(s.q ? ['q'] : []),
  ];

  // ---------------------------------------------------------------- full text (Pagefind, built site only)
  const base = root.dataset.base ?? '/';
  /** undefined: not loaded yet; null: unavailable (astro dev, or the index failed to load). */
  let pagefind: Pagefind | null | undefined;
  let failedAt = 0;
  /** Full-text hits per query (publication id -> excerpt with <mark>), so Back and Forward render at once. */
  const cache = new Map<string, Map<string, string>>();
  /** The id of a publication URL, after the site's base path (which may itself contain "research"). */
  const idFromUrl = (u: string) => {
    const path = new URL(u, location.origin).pathname;
    const rel = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, '');
    return rel.match(/^(?:research|artifact)\/([^/?#]+)/)?.[1];
  };
  /** Pagefind marks hits with <mark>; everything else in an excerpt is shown as text. */
  const safeExcerpt = (html: string) => html.replace(/<(?!\/?mark>)/g, '&lt;');

  async function loadPagefind(): Promise<Pagefind | null> {
    if (pagefind) return pagefind;
    // After a failure, try again only after a while (no request per keystroke in astro dev).
    if (pagefind === null && Date.now() - failedAt < 15000) return null;
    try {
      const pf = (await import(/* @vite-ignore */ `${base}pagefind/pagefind.js`)) as Pagefind;
      // Short excerpts keep the highlighted words inside the two-line summary slot.
      await pf.options?.({ excerptLength: 14 });
      pagefind = pf;
    } catch {
      pagefind = null;
      failedAt = Date.now();
    }
    return pagefind;
  }

  /** A query is pending while its full-text results may still add publications. */
  const pending = (q: string) => Boolean(q) && pagefind !== null && !cache.has(q);

  /** Lowercase without accents, as Pagefind matches ("Jeronimo" finds "Jerónimo"). */
  const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');

  /** A word's letter and digit runs ("32Freshippo’s": 32, freshippo, s) and the whole word joined ("data-center": datacenter). */
  const wordParts = (word: string) => {
    const w = fold(word);
    return [w.replace(/[^\p{L}\p{N}]+/gu, ''), ...(w.match(/\p{L}+|\p{N}+/gu) ?? [])];
  };

  /** A rough English stem, enough to pair the inflections Pagefind's stemmer pairs (carrying, carries; cutting, cut; sizing, size). */
  const stem = (word: string) => {
    // Each step applies only if at least three letters remain.
    const strip = (w: string, ending: RegExp, by = '') => {
      const s = w.replace(ending, by);
      return s.length >= 3 ? s : w;
    };
    const base = strip(strip(strip(word, /(?<=ing|ed)ly$/), /(?:ies|ied|ying)$/, 'y'), /(?:ings|ing|ed|es|e|s)$/);
    return strip(base, /([^aeiou\d])\1$/, '$1'); // shipp: ship
  };

  /**
   * Pagefind answers a word it does not know with the longest prefix it knows ("bitcoin" marks "B:", "netflix" marks "net").
   * A hit counts only if every query term matches a word it found: the word begins with the term (up to four letters), all
   * but its last letter (five or six) or all but its last three ("Oraclee" finds "Oracle"); or the two share a stem
   * ("studies" finds "Study", "cutting" finds "cut"); or the page text has a word that begins with the whole term.
   */
  function matchesEveryTerm({ content, locations, excerpt, meta }: PagefindResult, terms: string[]): boolean {
    // Locations count the words of the page text; without them, the marked words of the excerpt stand in.
    const text = words(content);
    const located =
      text.length && locations ? locations.map((at) => text[at] ?? '') : [...excerpt.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => m[1]);
    const parts = [...located, ...Object.values(meta ?? {})].flatMap(wordParts);
    let all: string[] | undefined;
    return terms.every((t) => {
      // Short terms must match (almost) whole: Pagefind answers "costco" with "cost" and "paypal" with "pay".
      const start = t.slice(0, t.length <= 4 ? t.length : t.length <= 6 ? t.length - 1 : t.length - 3);
      const root = stem(t);
      // A three-letter stem must match whole ("cutting" finds "cut", "boeing" does not find "boerse").
      const sameStem = (p: string) => (root.length > 3 ? stem(p).startsWith(root) : stem(p) === root);
      if (parts.some((p) => p.startsWith(start) || sameStem(p))) return true;
      all ??= text.flatMap(wordParts);
      return all.some((p) => p.startsWith(t));
    });
  }

  async function searchFullText(q: string) {
    if (!q || cache.has(q)) return;
    try {
      const pf = await loadPagefind();
      if (!pf) return;
      const found = await pf.debouncedSearch(q, {}, 150);
      if (found === null) return; // superseded by a newer query
      const terms = words(fold(q).replace(/[^\p{L}\p{N}\s]+/gu, ''));
      const hits = new Map<string, string>();
      for (const data of await Promise.all(found.results.slice(0, 50).map((r) => r.data()))) {
        const id = idFromUrl(data.url);
        if (id && !hits.has(id) && matchesEveryTerm(data, terms)) hits.set(id, data.excerpt);
      }
      cache.set(q, hits);
      if (cache.size > 30) cache.delete(cache.keys().next().value!);
    } catch {
      // Full text is an addition: metadata results stay.
    } finally {
      if (state.q === q) render();
    }
  }

  let state = readUrl();
  /** Active filter keys in the order they were applied (drives "Remove <last filter>"). */
  let order: string[] = [];

  // ---------------------------------------------------------------- matching
  function matches(i: Item, s: State, terms: string[], skip?: Group): boolean {
    return (
      (skip === 'kind' || !s.kind || i.kind === s.kind || i.pubKind === s.kind) &&
      (skip === 'tag' || s.tag.every((t) => i.tags.includes(t))) &&
      (skip === 'ticker' || !s.ticker.length || s.ticker.some((t) => i.tickers.includes(t))) &&
      (skip === 'year' || !s.year.length || s.year.includes(i.year)) &&
      (terms.every((t) => i.text.includes(t)) || Boolean(cache.get(s.q)?.has(i.id)))
    );
  }

  const setCount = (host: Element | null, n: number) => {
    const el = host?.querySelector('[data-n]');
    if (el && el.textContent !== String(n)) el.textContent = String(n);
  };

  function describe(s: State): string {
    let text = s.kind ? `Nothing in ${labels.get(`kind:${s.kind}`)}` : 'Nothing';
    if (s.tag.length) text += ` tagged ${s.tag.map((t) => labels.get(`tag:${t}`)).join(' + ')}`;
    if (s.ticker.length) text += ` on ${s.ticker.join(' or ')}`;
    if (s.year.length) text += ` from ${s.year.join(' or ')}`;
    if (s.q) text += ` matching “${s.q}”`;
    return text;
  }

  // ---------------------------------------------------------------- render
  function render() {
    const s = state;
    const terms = s.q.toLowerCase().split(/\s+/).filter(Boolean);
    const keys = keysOf(s);
    order = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
    const filtered = keys.length > 0;
    const visible = items.filter((i) => matches(i, s, terms));
    const n = visible.length;
    const showFeature = Boolean(feature) && !filtered && s.view === 'grid';

    for (const i of items) {
      i.el.hidden = !visible.includes(i) || (showFeature && i.id === feature?.dataset.id);
      // A publication found only by its full text shows the matching passage where the summary was.
      const byMetadata = terms.every((t) => i.text.includes(t));
      const excerpt = s.q && !byMetadata ? cache.get(s.q)?.get(i.id) : undefined;
      if (i.summary) {
        if (excerpt) i.summary.innerHTML = `…${safeExcerpt(excerpt)}…`;
        else if (i.summary.textContent !== i.summaryText) i.summary.textContent = i.summaryText;
        i.summary.classList.toggle('is-excerpt', Boolean(excerpt));
      }
    }
    if (feature) feature.hidden = !showFeature;
    // Until full-text results arrive, "no match" is not yet known: say so instead of announcing 0.
    const searching = pending(s.q);
    wall.dataset.layout = s.view;
    wall.hidden = n === 0;
    empty.hidden = n > 0 || searching;
    // Grid or List means nothing with no results.
    views.hidden = n === 0;
    statusCount.hidden = searching && n === 0;
    statusSearching.hidden = !searching;
    if (statusN.textContent !== String(n)) statusN.textContent = String(n);
    if (search.value.trim() !== s.q) search.value = s.q;

    // Kind tabs: single-select, counted against everything except kind. "All" never disables: it is the kind reset.
    for (const r of radios) {
      const c = items.filter((i) => matches(i, s, terms, 'kind') && (!r.value || i.kind === r.value)).length;
      r.checked = r.value === s.kind;
      r.disabled = Boolean(r.value) && c === 0 && !r.checked;
      setCount(r.closest('label'), c);
    }
    // Topic chips narrow: the count is what the result would be with the chip added.
    for (const chip of chips) {
      const t = chip.dataset.chip ?? '';
      const on = s.tag.includes(t);
      const c = visible.filter((i) => i.tags.includes(t)).length;
      chip.setAttribute('aria-pressed', String(on));
      if (c === 0 && !on) chip.setAttribute('aria-disabled', 'true');
      else chip.removeAttribute('aria-disabled');
      setCount(chip, c);
    }
    // Company and Year widen within their group: counted against the other groups.
    for (const b of boxes) {
      const g = b.name as 'ticker' | 'year';
      const on = s[g].includes(b.value);
      const c = items.filter((i) => matches(i, s, terms, g) && (g === 'ticker' ? i.tickers.includes(b.value) : i.year === b.value)).length;
      b.checked = on;
      b.disabled = c === 0 && !on;
      setCount(b.closest('label'), c);
    }
    for (const p of pops) {
      const g = p.dataset.pop as 'ticker' | 'year';
      const badge = p.querySelector<HTMLElement>('[data-badge]')!;
      badge.hidden = s[g].length === 0;
      badge.querySelector('[data-badge-n]')!.textContent = String(s[g].length);
      const clear = p.querySelector<HTMLButtonElement>('[data-pop-clear]')!;
      clear.disabled = s[g].length === 0;
      const done = p.querySelector<HTMLButtonElement>('[data-pop-done]')!;
      done.textContent = n === 0 ? 'No results' : `Show ${n} result${n === 1 ? '' : 's'}`;
    }
    for (const b of tickerBtns) b.setAttribute('aria-pressed', String(s.ticker.includes(b.dataset.ticker ?? '')));

    // Active filter tokens and reset.
    for (const t of tokens) t.hidden = !keys.includes(t.dataset.token ?? '');
    qText.textContent = s.q;
    tokenList.hidden = !filtered;
    for (const b of clearers) if (!empty.contains(b)) b.hidden = !filtered;
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.setView === s.view));

    // Empty state names the filters and offers to undo the most recent one.
    if (n === 0) {
      emptyTitle.textContent = describe(s);
      const last = order.at(-1);
      undo.hidden = !last;
      if (last) {
        undo.dataset.key = last;
        undo.textContent = last === 'q' ? 'Clear the search' : last.startsWith('kind:') ? 'Show all kinds' : `Remove ${labels.get(last)}`;
      }
    }

    updateBlanks();
    rails.forEach(updateRail);
  }

  /** Ruled blanks keep the sheet rectangular when the last row is short. */
  function updateBlanks() {
    const cols = state.view === 'list' || wall.hidden ? 1 : getComputedStyle(wall).gridTemplateColumns.split(' ').filter(Boolean).length;
    const used = items.filter((i) => !i.el.hidden).length + (feature && !feature.hidden ? (cols >= 3 ? 4 : cols) : 0);
    const need = cols > 1 ? (cols - (used % cols)) % cols : 0;
    blanks.forEach((b, k) => (b.hidden = k >= need));
  }

  function commit(push: boolean) {
    render();
    writeUrl(push);
  }

  // ---------------------------------------------------------------- filter edits
  function toggle(g: ListGroup, value: string, on = !state[g].includes(value)) {
    state = { ...state, [g]: on ? [...new Set([...state[g], value])] : state[g].filter((v) => v !== value) };
  }

  function removeKey(key: string) {
    if (key === 'q') {
      state = { ...state, q: '' };
      search.value = '';
      return;
    }
    const at = key.indexOf(':');
    const g = key.slice(0, at) as Group;
    const v = key.slice(at + 1);
    if (g === 'kind') state = { ...state, kind: '' };
    else toggle(g, v, false);
  }

  /** After a removal hides the button that was clicked, put focus on the control that owns the value. */
  function focusOwner(key: string) {
    if (key === 'q') return search.focus();
    const [g, v] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (g === 'kind') return radios[0]?.focus();
    if (g === 'tag') return chips.find((c) => c.dataset.chip === v)?.focus();
    pops.find((p) => p.dataset.pop === g)?.querySelector('summary')?.focus();
  }

  // Runs of edits share one history entry: the first keystroke of a search, or the first arrow-key
  // move through the kind tabs, pushes; the rest of the run replaces it until focus leaves the control.
  let typing = false;
  let arrowing = false;
  let arrowKey = false;
  tabs.addEventListener('keydown', (e) => {
    arrowKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key);
  });
  tabs.addEventListener('pointerdown', () => {
    arrowKey = false;
    arrowing = false;
  });
  tabs.addEventListener('focusout', (e) => {
    if (!tabs.contains(e.relatedTarget as Node | null)) arrowing = false;
  });

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'kind') {
      state = { ...state, kind: t.value };
      commit(!(arrowKey && arrowing));
      arrowing = arrowKey;
      arrowKey = false;
      return;
    }
    if (t.name === 'ticker' || t.name === 'year') toggle(t.name, t.value, t.checked);
    else return;
    commit(true);
  });

  // Typing filters live (see the history note above).
  search.addEventListener('input', () => {
    state = { ...state, q: search.value.trim() };
    commit(!typing);
    typing = true;
    void searchFullText(state.q);
  });
  search.addEventListener('blur', () => (typing = false));

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      if (chip.getAttribute('aria-disabled') === 'true') return;
      toggle('tag', chip.dataset.chip ?? '');
      commit(true);
    });
  }

  // Ticker boxes on the tiles apply (or lift) the Company filter.
  wall.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-ticker]');
    if (!b) return;
    const t = b.dataset.ticker ?? '';
    toggle('ticker', t);
    commit(true);
    // The feature tile leaves the wall once a filter is on: keep focus on the same ticker in the item's own tile.
    if (b.closest('[hidden]')) {
      const id = b.closest<HTMLElement>('[data-id]')?.dataset.id;
      items.find((i) => i.id === id)?.el.querySelector<HTMLButtonElement>(`[data-ticker="${CSS.escape(t)}"]`)?.focus();
    }
  });

  tokenList.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-remove]');
    if (!b) return;
    const key = b.dataset.remove ?? '';
    removeKey(key);
    commit(true);
    focusOwner(key);
  });

  undo.addEventListener('click', () => {
    const key = undo.dataset.key;
    if (!key) return;
    removeKey(key);
    commit(true);
    focusOwner(key);
  });

  for (const b of clearers) {
    b.addEventListener('click', () => {
      state = { kind: '', tag: [], ticker: [], year: [], q: '', view: state.view };
      search.value = '';
      commit(true);
      radios[0]?.focus();
    });
  }

  for (const b of viewBtns) {
    b.addEventListener('click', () => {
      state = { ...state, view: b.dataset.setView === 'list' ? 'list' : 'grid' };
      commit(true);
    });
  }

  // ---------------------------------------------------------------- popovers (details)
  for (const p of pops) {
    p.addEventListener('toggle', () => {
      if (!p.open) return;
      for (const other of pops) if (other !== p) other.open = false;
      // A phone sheet sits over a backdrop like a dialog: take focus into it.
      if (sheetQuery.matches) p.querySelector<HTMLElement>('input:not(:disabled), [data-pop-done]')?.focus();
    });
    // Close when keyboard focus moves somewhere else, so the panel never covers the focused control.
    // A null relatedTarget (a press on the panel's padding, or the window losing focus) is left to the outside-click handler.
    p.addEventListener('focusout', (e) => {
      const next = e.relatedTarget as Node | null;
      if (p.open && next && !p.contains(next)) p.open = false;
    });
    p.querySelector('[data-pop-clear]')?.addEventListener('click', () => {
      const g = p.dataset.pop as 'ticker' | 'year';
      state = { ...state, [g]: [] };
      commit(true);
      p.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    });
    p.querySelector('[data-pop-done]')?.addEventListener('click', () => {
      p.open = false;
      p.querySelector('summary')?.focus();
    });
  }
  document.addEventListener('click', (e) => {
    for (const p of pops) if (p.open && !p.contains(e.target as Node)) p.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const p = pops.find((x) => x.open);
      if (p) {
        p.open = false;
        p.querySelector('summary')?.focus();
      }
    } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) {
      e.preventDefault();
      search.focus();
      search.select();
    }
  });

  // ---------------------------------------------------------------- sideways rails
  function updateRail(rail: HTMLElement) {
    const s = rail.querySelector<HTMLElement>('[data-rail-scroll]');
    if (!s) return;
    rail.toggleAttribute('data-more-start', s.scrollLeft > 1);
    rail.toggleAttribute('data-more-end', s.scrollLeft + s.clientWidth < s.scrollWidth - 1);
  }
  for (const rail of rails) {
    const s = rail.querySelector<HTMLElement>('[data-rail-scroll]');
    if (!s) continue;
    s.addEventListener('scroll', () => updateRail(rail), { passive: true });
    new ResizeObserver(() => updateRail(rail)).observe(s);
    const step = (dir: number) => s.scrollBy({ left: dir * Math.max(160, s.clientWidth * 0.7), behavior: smooth() });
    rail.querySelector('[data-rail-prev]')?.addEventListener('click', () => step(-1));
    rail.querySelector('[data-rail-next]')?.addEventListener('click', () => step(1));
  }

  // ---------------------------------------------------------------- lifecycle
  for (const q of ['(min-width: 640px)', '(min-width: 1000px)']) matchMedia(q).addEventListener('change', updateBlanks);
  const resync = () => {
    // A restored entry starts a new run: the next keystroke or arrow move must push, not overwrite it.
    typing = false;
    arrowing = false;
    state = readUrl();
    render();
    void searchFullText(state.q);
  };
  window.addEventListener('popstate', resync);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resync();
  });

  render();
  // Drop unknown or malformed parameters from a shared URL without adding a history entry.
  writeUrl(false);
  void searchFullText(state.q);
}

const root = document.querySelector<HTMLElement>('[data-library]');
if (root) init(root);

export {};
