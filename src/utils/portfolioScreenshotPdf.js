import jsPDF from 'jspdf';
import { domToPng } from 'modern-screenshot';

/**
 * Tailwind 4 ships its whole palette as oklch(), and getComputedStyle hands
 * those values back verbatim. modern-screenshot serialises the clone into an
 * SVG <foreignObject>, whose rasteriser does not support oklch — so every
 * Tailwind colour silently drops out of the capture while inline hex values
 * (our theme colours) survive. That is what made exported PDFs look washed out.
 *
 * Painting the value onto a 1x1 canvas and reading the pixel back converts it
 * using the browser's own colour engine, so oklch(0.928 0.006 264.531) becomes
 * rgb(229, 231, 235) — exactly Tailwind's gray-200. Anything the canvas cannot
 * parse leaves the pixel untouched and is skipped rather than guessed at.
 */
const COLOR_PROPS = [
  'color', 'background-color', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color',
  'text-decoration-color', 'caret-color', 'column-rule-color', 'fill', 'stroke',
];

const makeColorConverter = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();

  return (value) => {
    if (!value || !value.includes('oklch')) return null; // only touch what breaks
    if (cache.has(value)) return cache.get(value);

    let out;
    try {
      // A sentinel first: if the value is unparseable fillStyle keeps the
      // sentinel, and we can tell the conversion apart from a real black.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
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

/**
 * Rewrites oklch colours to rgb on a CLONED node. Runs via modern-screenshot's
 * onCloneEachNode hook, so the live page is never touched.
 */
const flattenClonedColors = (convert) => (cloned) => {
  if (!cloned || cloned.nodeType !== 1) return;
  let computed;
  try { computed = window.getComputedStyle(cloned); } catch { return; }
  if (!computed) return;

  for (const prop of COLOR_PROPS) {
    const converted = convert(computed.getPropertyValue(prop));
    if (converted) cloned.style.setProperty(prop, converted, 'important');
  }
  // Gradients and shadows can carry oklch stops too.
  for (const prop of ['background-image', 'box-shadow']) {
    const raw = computed.getPropertyValue(prop);
    if (raw && raw.includes('oklch')) {
      const fixed = raw.replace(/oklch\([^)]*\)/g, (m) => convert(m) || m);
      if (fixed !== raw) cloned.style.setProperty(prop, fixed, 'important');
    }
  }
};


/**
 * Generate PDF by capturing actual screenshots of the rendered components
 * This provides pixel-perfect reproduction of the UI in the PDF
 */
/**
 * Swaps form controls for plain text on the CLONE. Native <select> and date
 * inputs do not render their value inside an SVG <foreignObject>, so each one
 * stamped with data-pdf-text becomes a span carrying that text plus whatever
 * inline styles the clone already has, keeping the control's look.
 *
 * Runs from onCloneNode, which fires once the whole subtree is cloned — so
 * every node has a parent to be replaced within.
 */
const substituteClonedControls = (clonedRoot) => {
  if (!clonedRoot || clonedRoot.nodeType !== 1) return;
  const targets = clonedRoot.querySelectorAll?.('[data-pdf-text]');
  if (!targets) return;

  targets.forEach((node) => {
    const text = node.getAttribute('data-pdf-text');
    const parent = node.parentNode;
    if (!parent) return;

    const span = document.createElement('span');
    span.textContent = text;
    // Carry over the styling modern-screenshot already inlined on the clone so
    // the substitute keeps the control's fill, border, padding and font.
    span.style.cssText = node.style?.cssText || '';
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.whiteSpace = 'nowrap';
    // A select's chevron is a background image that would sit under the text.
    span.style.backgroundImage = 'none';
    parent.replaceChild(span, node);
  });
};

/**
 * options.containerId  — element to capture (default: the portfolio result page)
 * options.filePrefix   — leading part of the saved filename
 * Defaults reproduce the original portfolio behaviour exactly.
 */
export const generatePortfolioScreenshotPDF = async (portfolioName, options = {}) => {
  const {
    containerId = 'portfolio-pdf-content',
    filePrefix = 'backtest-portfolio',
    // CSS selector for blocks that must never be split across two pages (leg
    // cards, mainly). Opt-in: without it the slicer keeps its old fixed-height
    // behaviour, so existing callers are unaffected.
    blockSelector = null,
  } = options;
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const contentWidth = pageWidth - (2 * margin);
    
    // Find the container
    let resultsContainer = document.getElementById(containerId);
    
    if (!resultsContainer) {
      resultsContainer = document.querySelector('.flex-1.overflow-y-auto.bg-gray-50');
    }
    
    if (!resultsContainer) {
      throw new Error('Could not find portfolio content container');
    }
    
    // PRE-PROCESS: stamp the rendered text of form controls onto the elements
    // as a data attribute. This is invisible — no display/style is touched — and
    // the clone inherits it, so the substitution can happen on the CLONE. The
    // previous approach set display:none on every <select> in the LIVE page for
    // the duration of the capture, which is what made the page's dropdowns lose
    // their colour on screen while a PDF was generating.
    const stamped = [];
    resultsContainer.querySelectorAll('select').forEach((select) => {
      const opt = select.options[select.selectedIndex];
      const text = opt?.textContent?.trim();
      // A cloned <select> does not carry its selected value, so the text has to
      // be read here, from the live element, and travel with the clone.
      if (text) {
        select.setAttribute('data-pdf-text', text);
        stamped.push(select);
      }
    });
    resultsContainer.querySelectorAll('input[type="date"]').forEach((input) => {
      if (input.value) {
        input.setAttribute('data-pdf-text', input.value);
        stamped.push(input);
      }
    });

    // Small delay to ensure DOM updates are rendered
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Add temporary class
    resultsContainer.classList.add('generating-pdf');
    
    // Get dimensions
    const containerWidth = resultsContainer.scrollWidth;
    const containerHeight = resultsContainer.scrollHeight;

    // The blocks a page break must not cut through, as {top, bottom} offsets
    // from the container's top. Measured here because this is the layout the
    // capture below is about to freeze; measuring later, after the clone is
    // torn down, could read a different height.
    let blocks = [];
    if (blockSelector) {
      const containerTop = resultsContainer.getBoundingClientRect().top;
      resultsContainer.querySelectorAll(blockSelector).forEach((el) => {
        const box = el.getBoundingClientRect();
        blocks.push({ el, top: box.top - containerTop, bottom: box.bottom - containerTop });
      });
      // Keep only outermost blocks. A block nested inside another would offer
      // its own top as a cut point, and taking it would split the parent.
      // Nesting is decided by DOM ancestry, NOT by comparing top/bottom:
      // Instrument settings and Entry settings sit side by side in two columns,
      // so one's vertical span can contain the other's while neither encloses
      // it — and a geometric test wrongly discards the block that happens to
      // be shorter.
      blocks = blocks.filter((b) => !blocks.some((other) => other.el !== b.el && other.el.contains(b.el)));
      blocks.sort((a, b) => a.top - b.top);
    }

    // Capture with modern-screenshot
    const dataUrl = await domToPng(resultsContainer, {
      quality: 1,
      scale: 2,
      width: containerWidth,
      height: containerHeight,
      backgroundColor: '#f9fafb',
      onCloneEachNode: flattenClonedColors(makeColorConverter()),
      onCloneNode: substituteClonedControls,
      filter: (node) => {
        if (node.tagName === 'BUTTON') {
          const buttonText = node.textContent?.toLowerCase() || '';
          if (buttonText.includes('delete') || 
              buttonText.includes('apply') || 
              buttonText.includes('zoom') ||
              buttonText.includes('screenshot') ||
              node.classList?.contains('ignore-pdf')) {
            return false;
          }
        }
        if (node.classList?.contains('ignore-pdf')) {
          return false;
        }
        return true;
      }
    });

    // CLEANUP: drop the stamps. Nothing visual was changed, so there is nothing
    // to restore.
    stamped.forEach((el) => el.removeAttribute('data-pdf-text'));
    
    // Remove temporary class
    resultsContainer.classList.remove('generating-pdf');

    // Create image
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    // Calculate PDF dimensions
    const imgWidth = contentWidth;
    const imgHeight = (img.height * imgWidth) / img.width;
    const pageContentHeight = pageHeight - (2 * margin);

    // Single or multi-page
    if (imgHeight <= pageContentHeight) {
      doc.addImage(dataUrl, 'PNG', margin, margin, imgWidth, imgHeight);
    } else {
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      let currentYMM = 0;
      let pageNum = 0;
      const pixelsPerMM = img.width / imgWidth;
      const minSliceHeight = 50;

      while (currentYMM < imgHeight) {
        if (pageNum > 0) {
          doc.addPage();
        }

        const remainingHeightMM = imgHeight - currentYMM;
        let sliceHeightMM = Math.min(pageContentHeight, remainingHeightMM);
        let cutAtBlock = false;

        if (blocks.length && remainingHeightMM > pageContentHeight) {
          // Where this page would otherwise end. CSS px -> mm uses the same
          // ratio the image was scaled by, so this lines up with the pixels.
          const mmPerCssPx = imgWidth / containerWidth;
          const limit = currentYMM + pageContentHeight;

          // Find the block the page boundary would slice through. Looking for
          // the STRADDLING block (rather than the last one that merely starts
          // on this page) is what stops a card being left hanging over the
          // edge — its header on one page, its fields on the next.
          const split = blocks.find((b) => {
            const top = b.top * mmPerCssPx;
            const bottom = b.bottom * mmPerCssPx;
            return top < limit && bottom > limit;
          });

          if (split) {
            const topMM = split.top * mmPerCssPx;
            if (topMM > currentYMM) {
              // Push the whole block to the next page. The page may end short;
              // that is the point — a clean break beats a full page.
              sliceHeightMM = topMM - currentYMM;
              cutAtBlock = true;
            }
            // Otherwise the block already starts at this page's top and is
            // taller than a whole page, so it cannot be kept intact: the hard
            // cut at `limit` below stands.
          }
          // No straddling block means the boundary falls in the gap between
          // blocks, which is exactly where we want it.
        }

        if (!cutAtBlock &&
            remainingHeightMM > pageContentHeight &&
            remainingHeightMM < pageContentHeight + minSliceHeight) {
          sliceHeightMM = pageContentHeight - 20;
        }
        
        const sourceYPx = currentYMM * pixelsPerMM;
        const sliceHeightPx = sliceHeightMM * pixelsPerMM;

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(Math.min(sliceHeightPx, canvas.height - sourceYPx));
        
        const sliceCtx = sliceCanvas.getContext('2d');
        sliceCtx.drawImage(
          canvas,
          0, Math.floor(sourceYPx),
          canvas.width, sliceCanvas.height,
          0, 0,
          canvas.width, sliceCanvas.height
        );

        const sliceImgData = sliceCanvas.toDataURL('image/png', 1.0);
        doc.addImage(sliceImgData, 'PNG', margin, margin, imgWidth, sliceHeightMM);

        currentYMM += sliceHeightMM;
        pageNum++;

        if (pageNum > 100) {
          break;
        }
      }
    }

    const timestamp = new Date().toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/[/: ]/g, '-');

    const filename = `${filePrefix}-${portfolioName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.pdf`;
    doc.save(filename);

    return filename;
  } catch (error) {
    // Cleanup on error — stamps are the only thing left behind.
    document.querySelectorAll('[data-pdf-text]').forEach((el) => el.removeAttribute('data-pdf-text'));
    
    const container = document.getElementById('portfolio-pdf-content');
    if (container) {
      container.classList.remove('generating-pdf');
    }
    throw error;
  }
};

/**
 * Generate PDF by capturing specific sections separately for better control
 */
export const generatePortfolioScreenshotPDFBySection = async (portfolioName, options = {}) => {
  const { filePrefix = 'backtest-portfolio' } = options;
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const contentWidth = pageWidth - (2 * margin);
    let yPos = margin;
    let isFirstSection = true;

    const sections = [
      { selector: '.portfolio-settings', name: 'Portfolio Settings' },
      { selector: '.backtest-result-header', name: 'Backtest Header' },
      { selector: '.cumulative-chart-container', name: 'Cumulative P&L Chart' },
      { selector: '.drawdown-chart-container', name: 'Drawdown Chart' },
      { selector: '.yearwise-returns', name: 'Year-wise Returns' },
      { selector: '.strategy-report', name: 'Strategy-wise Report' },
      { selector: '.full-report-table', name: 'Full Report' },
    ];

    for (const section of sections) {
      const element = document.querySelector(section.selector);
      
      if (!element) {
        console.warn(`Section not found: ${section.name}`);
        continue;
      }

      // Use modern-screenshot
      const dataUrl = await domToPng(element, {
        quality: 1,
        scale: 2,
        backgroundColor: '#ffffff',
        onCloneEachNode: flattenClonedColors(makeColorConverter()),
      });

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      const imgWidth = contentWidth;
      const imgHeight = (img.height * imgWidth) / img.width;

      if (!isFirstSection && yPos + imgHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }

      if (!isFirstSection) {
        yPos += 5;
      }

      doc.addImage(dataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight;
      isFirstSection = false;
    }

    const timestamp = new Date().toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/[/: ]/g, '-');

    const filename = `${filePrefix}-${portfolioName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.pdf`;
    doc.save(filename);

    return filename;
  } catch (error) {
    console.error('Error generating PDF by section:', error);
    throw error;
  }
};
