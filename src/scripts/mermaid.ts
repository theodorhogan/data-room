// Renders Mermaid diagrams with colors read from the design tokens. Each diagram is rendered
// in a light and a dark variant; CSS shows the one matching the theme, print always uses light.
const blocks = [...document.querySelectorAll<HTMLElement>('[data-mermaid]:not([data-rendered])')];

function tokens(theme: 'light' | 'dark') {
  const probe = document.createElement('div');
  probe.dataset.theme = theme;
  probe.hidden = true;
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const t = {
    paper: v('--paper'),
    mist: v('--mist'),
    rule: v('--rule'),
    slate: v('--slate'),
    ink: v('--ink'),
    heading: v('--text-heading'),
    kicker: v('--text-kicker'),
    s1: v('--series-1'),
    s2: v('--series-2'),
    s4: v('--series-4'),
    navy700: v('--navy-700'),
    navy300: v('--navy-300'),
    navy100: v('--navy-100'),
    font: v('--font-sans'),
  };
  probe.remove();
  return t;
}

function themeVariables(theme: 'light' | 'dark') {
  const t = tokens(theme);
  // Timeline sections step through the navy ramp by lightness. Each fill is paired with the text
  // color that passes WCAG AA on it (Mermaid derives the event boxes from these fills).
  const scale = theme === 'light' ? [t.s1, t.s2, t.navy300, t.navy100] : [t.s1, t.s2, t.navy700, t.s4];
  const onScale = theme === 'light' ? ['#FFFFFF', '#FFFFFF', t.ink, t.ink] : [t.paper, t.paper, t.ink, t.ink];
  const vars: Record<string, string> = {
    fontFamily: t.font,
    fontSize: '14px',
    background: t.paper,
    primaryColor: t.mist,
    primaryTextColor: t.ink,
    primaryBorderColor: t.kicker,
    secondaryColor: t.paper,
    tertiaryColor: t.paper,
    lineColor: t.slate,
    textColor: t.ink,
    mainBkg: t.mist,
    nodeBorder: t.kicker,
    clusterBkg: t.paper,
    clusterBorder: t.rule,
    edgeLabelBackground: t.paper,
    titleColor: t.heading,
  };
  for (let i = 0; i < 12; i++) {
    vars[`cScale${i}`] = scale[i % 4];
    vars[`cScaleLabel${i}`] = onScale[i % 4];
    vars[`cScaleInv${i}`] = scale[i % 4];
  }
  return vars;
}

// Exhibits are at most this wide on screen and on A4. A left-to-right timeline or flowchart that
// would need shrinking far below that (unreadable text) is re-flowed top-to-bottom instead.
const COLUMN_WIDTH = 860;
const svgWidth = (svg: string) => Number(svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/)?.[1] ?? 0);

function topDown(src: string): string | undefined {
  const lines = src.split('\n');
  const i = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'));
  const header = lines[i] ?? '';
  if (/^\s*timeline(\s+LR)?\s*$/.test(header)) lines[i] = header.replace(/timeline.*$/, 'timeline TD');
  else if (/^\s*(flowchart|graph)\s+(LR|RL)\b/.test(header)) lines[i] = header.replace(/(flowchart|graph)\s+(LR|RL)/, '$1 TD');
  else return undefined;
  return lines.join('\n');
}

/** Diagram types whose source may contain a `title` statement. */
const TITLED = /^\s*(timeline|journey|gantt|quadrantChart|xychart(-beta)?|pie)\b/;

/** The exhibit header already carries the title, so Mermaid's own (bold, unbranded) title is dropped. */
function withoutTitle(src: string): string {
  const lines = src.split('\n');
  const header = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'));
  if (header < 0 || !TITLED.test(lines[header])) return src;
  lines[header] = lines[header].replace(/^(\s*pie\b.*?)\s+title\s.*$/, '$1');
  const title = lines.findIndex((l, i) => i > header && /^\s*title\s/.test(l));
  if (title > 0) lines.splice(title, 1);
  return lines.join('\n');
}

type Mermaid = typeof import('mermaid').default;

/**
 * Mermaid's top-to-bottom timeline renderer ignores the diagram id: its elements get ids starting with
 * "undefined-" (duplicated across the light and dark variants) and its lines point at a missing
 * "#arrowhead" marker. Scope both to this render's id.
 */
async function renderSvg(mermaid: Mermaid, id: string, src: string) {
  const { svg } = await mermaid.render(id, src);
  return svg.replaceAll('id="undefined-', `id="${id}-`).replaceAll('url(#arrowhead)', `url(#${id}-arrowhead)`);
}

async function renderVariant(mermaid: Mermaid, index: number, theme: 'light' | 'dark', src: string) {
  let svg = await renderSvg(mermaid, `diagram-${index}-${theme}`, src);
  let used = src;
  const alternative = svgWidth(svg) > COLUMN_WIDTH * 1.35 ? topDown(src) : undefined;
  if (alternative) {
    const reflowed = await renderSvg(mermaid, `diagram-${index}-${theme}-td`, alternative);
    if (svgWidth(reflowed) < svgWidth(svg)) {
      svg = reflowed;
      used = alternative;
    }
  }
  return { html: `<div class="variant-${theme}">${svg}</div>`, used };
}

async function renderAll() {
  const { default: mermaid } = await import('mermaid');
  await document.fonts.ready;
  for (const [i, block] of blocks.entries()) {
    const original = block.querySelector('.mermaid-source')?.textContent ?? '';
    let src = block.dataset.exhibitTitle !== undefined ? withoutTitle(original) : original;
    try {
      const parts: string[] = [];
      for (const theme of ['light', 'dark'] as const) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          theme: 'base',
          themeVariables: themeVariables(theme),
          // Authored line breaks hold; Mermaid would otherwise re-wrap node text at ~200px and split numbers.
          flowchart: { wrappingWidth: 280 },
          // Diagram sources cannot override the site's theme, fonts or security settings.
          secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'theme', 'themeVariables', 'themeCSS', 'fontFamily', 'fontSize', 'darkMode', 'look', 'handDrawnSeed', 'layout'],
        });
        const { html, used } = await renderVariant(mermaid, i, theme, src);
        src = used;
        parts.push(html);
      }
      block.insertAdjacentHTML('beforeend', parts.join(''));
      // On phones a wide diagram keeps a readable size and scrolls sideways (see .diagram in global.css).
      for (const svg of block.querySelectorAll('svg')) svg.style.setProperty('--diagram-width', `${svgWidth(svg.outerHTML)}px`);
      block.dataset.rendered = 'true';
    } catch (error) {
      // One broken diagram marks only itself; the build's PDF step refuses pages with errors.
      block.dataset.rendered = 'error';
      block.insertAdjacentHTML('afterbegin', '<p class="diagram-error">This diagram could not be rendered; showing its source.</p>');
      console.error(error);
    }
  }
}

if (blocks.length) {
  renderAll().catch((error) => {
    for (const block of blocks.filter((b) => !b.dataset.rendered)) block.dataset.rendered = 'error';
    console.error(error);
  });
}

export {};
