/**
 * « ‹ 1 2 3 › » — the pager under every Full Report.
 *
 * ONE COMPONENT, BOTH REPORTS. The Strategy Builder's report and the portfolio
 * result page had separate copies that drifted apart; a fix to one silently
 * left the other behind. They now render this.
 *
 * STYLING MEASURED FROM THE REFERENCE, not guessed:
 *   button      ~26 x 22, padding-driven rather than a fixed square
 *   border      1px solid #0C4A6E on EVERY button, active or not
 *   active      filled #0C4A6E with white text
 *   inactive    transparent, text #0C4A6E
 * The old version used a grey #e5e7eb border and a 32px square, which is what
 * made it read as a different control.
 */

/** Six page numbers centred on the current one, clamped to the ends. */
const PAGE_WINDOW = 6;

const windowFor = (page, total) => {
  if (total <= PAGE_WINDOW) {
    return Array.from({ length: Math.max(total, 0) }, (_, i) => i + 1);
  }
  let first = page - Math.floor((PAGE_WINDOW - 1) / 2);
  first = Math.max(1, Math.min(first, total - PAGE_WINDOW + 1));
  return Array.from({ length: PAGE_WINDOW }, (_, i) => first + i);
};

const NAVY = '#0C4A6E';

/* 26x22 with the number centred; min-width so "10" and "100" grow instead of
   clipping, which a fixed w-8 square would do. */
const CHIP = 'inline-flex items-center justify-center rounded border text-[13px]'
  + ' leading-none transition-colors select-none';
const CHIP_SIZE = { minWidth: '26px', height: '22px', padding: '0 5px' };

export default function ReportPager({ page, totalPages, onChange }) {
  const safePage = Math.min(Math.max(1, page), Math.max(totalPages, 1));

  /*
    Change page WITHOUT moving the view.

    The clicked button keeps focus and the table beneath it re-renders at a
    different height, so the browser scrolls the focused element back into
    view -- which read as the report jumping to the top on every page change.
    Pinning the scrolling ancestor's offset across the update stops that, and
    works whether the page scrolls on `window` or inside the app shell's own
    overflow container.
  */
  const go = (target, fromEl) => {
    const next = Math.min(Math.max(1, target), Math.max(totalPages, 1));
    if (next === safePage) return;

    let box = fromEl?.parentElement || null;
    while (box) {
      const style = window.getComputedStyle(box);
      if (/(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    const top = box ? box.scrollTop : window.scrollY;

    onChange(next);

    // After the commit, before the next paint, so the restored position is
    // never drawn wrong.
    requestAnimationFrame(() => {
      if (box) box.scrollTop = top; else window.scrollTo({ top, behavior: 'instant' });
    });
  };

  const arrow = ({ label, target, disabled, title }) => (
    <button
      key={title}
      type="button"
      onClick={(e) => go(target, e.currentTarget)}
      disabled={disabled}
      title={title}
      className={`${CHIP} hover:bg-[#0C4A6E]/5 disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ ...CHIP_SIZE, borderColor: NAVY, color: NAVY }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1 flex-wrap justify-end mt-4">
      {[
        { label: '«', target: 1, disabled: safePage === 1, title: 'First Page' },
        { label: '‹', target: safePage - 1, disabled: safePage === 1, title: 'Previous Page' },
      ].map(arrow)}

      {windowFor(safePage, totalPages).map((p) => (
        <button
          key={p}
          type="button"
          onClick={(e) => go(p, e.currentTarget)}
          className={`${CHIP} ${p === safePage ? '' : 'hover:bg-[#0C4A6E]/5'}`}
          style={p === safePage
            ? { ...CHIP_SIZE, backgroundColor: NAVY, borderColor: NAVY, color: '#FFFFFF' }
            : { ...CHIP_SIZE, borderColor: NAVY, color: NAVY }}
        >
          {p}
        </button>
      ))}

      {[
        { label: '›', target: safePage + 1, disabled: safePage === totalPages, title: 'Next Page' },
        { label: '»', target: totalPages, disabled: safePage === totalPages, title: 'Last Page' },
      ].map(arrow)}
    </div>
  );
}
