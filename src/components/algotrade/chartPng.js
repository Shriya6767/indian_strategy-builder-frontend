/**
 * src/components/algotrade/chartPng.js
 *
 * "Download this panel as a PNG", for the MTM graph and the History charts.
 *
 * LOADED ON DEMAND. modern-screenshot is ~100 kB and most sessions never press
 * a download button, so it is imported inside the function rather than at the
 * top of a module that every Algo Trade screen pulls in.
 *
 * TAILWIND 4 EMITS oklch() COLOURS, which SVG foreignObject cannot paint — the
 * capture comes back blank or black without converting them first. The same
 * conversion the PDF export uses is applied here, on the CLONE, so the live
 * page is never touched. See src/utils/portfolioScreenshotPdf.js.
 */

const COLOR_PROPS = [
  'color', 'background-color', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke',
];

/**
 * oklch(...) -> rgb(...), by letting the browser do the conversion once per
 * distinct value and caching the result. A capture touches hundreds of nodes
 * and most of them share a handful of colours.
 */
const makeConverter = () => {
  const cache = new Map();
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return (value) => {
    if (!value || !value.includes('oklch')) return null;
    if (cache.has(value)) return cache.get(value);
    let out;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      out = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      out = null;
    }
    cache.set(value, out);
    return out;
  };
};

const flattenClonedColors = (convert) => (cloned) => {
  if (!cloned || cloned.nodeType !== 1) return;
  let computed;
  try { computed = window.getComputedStyle(cloned); } catch { return; }
  if (!computed) return;

  for (const prop of COLOR_PROPS) {
    const converted = convert(computed.getPropertyValue(prop));
    if (converted) cloned.style.setProperty(prop, converted, 'important');
  }
  for (const prop of ['background-image', 'box-shadow']) {
    const raw = computed.getPropertyValue(prop);
    if (raw && raw.includes('oklch')) {
      const fixed = raw.replace(/oklch\([^)]*\)/g, (m) => convert(m) || m);
      if (fixed !== raw) cloned.style.setProperty(prop, fixed, 'important');
    }
  }
};

/**
 * Capture `node` and hand the browser a .png.
 *
 * Anything marked `data-png-hide` is dropped from the CLONE — that is how the
 * chart's hover tooltip stays out of the image unless the pointer is actually
 * over it, and how buttons inside a captured panel are excluded.
 *
 * Returns a promise that rejects on failure, so the caller can report it
 * rather than leaving a button that silently does nothing.
 */
export const downloadNodePng = async (node, fileName = 'chart') => {
  if (!node) throw new Error('Nothing to capture');

  const { domToPng } = await import('modern-screenshot');
  const convert = makeConverter();

  const dataUrl = await domToPng(node, {
    // 2x so the image is sharp when opened or pasted into a document.
    scale: 2,
    backgroundColor: '#FFFFFF',
    onCloneNode: (clonedRoot) => {
      clonedRoot.querySelectorAll?.('[data-png-hide]')
        .forEach((el) => el.remove());
    },
    onCloneEachNode: flattenClonedColors(convert),
  });

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${String(fileName || 'chart').replace(/[\\/:*?"<>|]/g, '_')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};
