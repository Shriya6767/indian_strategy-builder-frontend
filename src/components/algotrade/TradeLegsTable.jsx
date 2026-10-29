import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { INK, MUTED, RULE, GREEN, DANGER, HEAD_BG } from './palette';
import { visibleLegColumns } from './legExport';

/**
 * The legs table on View Trades. ONE component for both states -- a closed
 * deployment shows exit columns, a running one shows live SL/Target/LTP --
 * because everything else is identical and duplicating it would mean fixing
 * every change twice.
 *
 * Scrolls horizontally rather than wrapping: the row is a grid of narrow
 * numeric columns and wrapping destroys the alignment that makes it readable.
 */

const money = (n) => (n == null || n === '' ? 'NA' : Number(n).toLocaleString('en-IN'));
const pnlColour = (n) => (Number(n || 0) < 0 ? DANGER : GREEN);

/** A leg's P&L with its sign always written out — "+1,240" / "-5,716". */
const signed = (n) => {
  if (n == null || n === '') return 'NA';
  const value = Number(n);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString('en-IN')}`;
};

/**
 * The buy/sell marker beside a price: a green B or a red S, as the reference
 * draws it. One component for both columns so the two can never disagree about
 * the colours or the size.
 */
const SideBadge = ({ side }) => {
  const sell = String(side).toUpperCase() === 'SELL';
  return (
    // A TINTED badge -- pale fill, coloured letter -- not a solid block with a
    // white letter. The reference draws it this way, and the solid version sat
    // far heavier in the row than the numbers beside it.
    <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded text-[10px] font-semibold"
          style={{
            backgroundColor: sell ? '#FDECEC' : '#E6F4EA',
            color: sell ? DANGER : GREEN,
          }}
          title={sell ? 'Sell' : 'Buy'}>
      {sell ? 'S' : 'B'}
    </span>
  );
};

/**
 * A price with its buy/sell badge.
 *
 * A FIXED-WIDTH two-track grid, centred as a block -- not an inline-flex of
 * badge + number. With inline-flex the PAIR is centred, so a 3-character price
 * pushes its badge right and a 6-character one pushes it left: scan the column
 * and the B/S letters zig-zag. Here the badge track is always 16px at the same
 * x and the number always starts at the same x, whatever either contains.
 */
const PricedSide = ({ side, children }) => (
  /*
    BADGE AND NUMBER CENTRED AS ONE GROUP, so the pair sits under the middle
    of its header exactly as every other value in this table does.

    The consequence, accepted deliberately: the badge's x now moves with the
    width of the price beside it, so the letters do not form a straight line
    down the column -- "515" and "229.2" are different widths, so their
    badges start a few pixels apart. Centring the pair and aligning the
    badges are mutually exclusive; this is the centred choice.
  */
  <span className="inline-flex items-center justify-center gap-1.5">
    <SideBadge side={side} />
    <span className="tabular-nums">{children}</span>
  </span>
);

/** The detail strip revealed under an expanded row. */
const LegDetail = ({ leg }) => (
  <div className="px-4 py-3" style={{ backgroundColor: '#FCFCFC' }}>
    <div className="grid gap-x-8 gap-y-2 text-[12px]"
         style={{ gridTemplateColumns: 'auto repeat(4, minmax(0, 1fr))' }}>
      <span className="font-semibold" style={{ color: INK }}>ENTRY:</span>
      <span style={{ color: MUTED }}>Initial Stop Loss: <span style={{ color: INK }}>{money(leg.initial_sl)}</span></span>
      <span style={{ color: MUTED }}>Updated Stop Loss: <span style={{ color: INK }}>{money(leg.stoploss)}</span></span>
      <span style={{ color: MUTED }}>Target: <span style={{ color: INK }}>{money(leg.target)}</span></span>
      <span style={{ color: MUTED }}>Report time: <span style={{ color: INK }}>{leg.entry_report_time || '--'}</span></span>

      <span className="font-semibold" style={{ color: INK }}>EXIT:</span>
      <span style={{ color: MUTED }}>Underlying: <span style={{ color: INK }}>{money(leg.exit_underlying)}</span></span>
      <span style={{ color: MUTED }}>Trigger Price: <span style={{ color: INK }}>{money(leg.exit_trigger_price)}</span></span>
      <span style={{ color: MUTED }}>Trigger time: <span style={{ color: INK }}>{leg.exit_trigger_time || '--'}</span></span>
      <span style={{ color: MUTED }}>Report time: <span style={{ color: INK }}>{leg.exit_report_time || '--'}</span></span>
    </div>
  </div>
);

const TradeLegsTable = ({ legs = [], running, strategyName = '' }) => {
  const [open, setOpen] = useState(() => new Set());
  const allOpen = legs.length > 0 && open.size === legs.length;

  const toggle = (i) => setOpen((was) => {
    const next = new Set(was);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  // Labels come from the same spec the .csv export uses, so a column can never
  // appear in one and not the other. The trailing '' is the chevron cell.
  const columns = [...visibleLegColumns(running).map((c) => c.label), ''];

  /**
   * Instrument and Strategy Name take what they need; EVERY numeric column
   * after them is one equal fraction, so the gaps between Qty and MTM are
   * identical rather than nine hand-picked widths that drift apart.
   *
   * minmax(0,1fr), not 1fr: a bare fr floors at its content, so one long value
   * would widen its column and knock the header out of step with the row.
   */
  const dataCols = running ? 9 : 8;
  /**
   * FIXED widths for Instrument and Strategy Name, wide enough that neither is
   * cut -- NOT max-content.
   *
   * The header and every row are SEPARATE grid containers, so a content-based
   * track sizes each one to its own text: the header to the word "Instrument",
   * a row to "SENSEX 08OCT2026 CE 73800". The tracks then differ and every
   * column after them sits offset from its own label. Only a fixed width is
   * identical in both grids.
   */
  const template = `250px 150px repeat(${dataCols}, minmax(0,1fr)) 32px`;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px]" style={{ color: INK }}>
          {running ? 'Running Legs' : 'Closed Legs'}
        </h3>
        <button type="button"
                onClick={() => setOpen(allOpen ? new Set() : new Set(legs.map((_, i) => i)))}
                className="text-[13px] font-medium"
                style={{ color: '#0782DA' }}>
          {allOpen ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div style={{ minWidth: running ? 1360 : 1240 }}>
          <div className="grid items-center gap-x-5 px-0 py-2.5 text-[12px] rounded-t"
               style={{ gridTemplateColumns: template, backgroundColor: HEAD_BG, color: MUTED }}>
            {columns.map((c, i) => (
              // EVERY column centred, Instrument included -- its header sits
              // over the middle of its own values rather than at the far left
              // of a 250px track with the symbols adrift beneath it.
              <span key={c || `blank-${i}`} className="text-center">{c}</span>
            ))}
          </div>

          {legs.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-center" style={{ color: MUTED }}>No legs yet</p>
          ) : legs.map((leg, i) => (
            <div key={`${leg.leg_number}-${leg.attempt ?? 0}-${i}`}
                 className="border-b" style={{ borderColor: RULE }}>
              <div className="grid items-center gap-x-5 px-0 py-3 text-[13px]"
                   style={{ gridTemplateColumns: template, color: INK }}>
                <span className="whitespace-nowrap text-center">{leg.symbol}</span>
                <span className="whitespace-nowrap text-center">{strategyName || '--'}</span>
                <span className="text-center">{leg.qty}</span>
                <PricedSide side={leg.side}>{money(leg.entry_price)}</PricedSide>
                <span className="text-center">{leg.entry_date || '--'}</span>
                <span className="text-center">{leg.entry_time || '--'}</span>

                {running ? (
                  <>
                    <span className="text-center">{money(leg.initial_sl)}</span>
                    <span className="text-center">{money(leg.stoploss)}</span>
                    <span className="text-center">{money(leg.target)}</span>
                    <span className="text-center">{money(leg.ltp)}</span>
                  </>
                ) : (
                  <>
                    {/* The exit is the opposite side of the entry: a leg
                        entered BUY is closed by a SELL. This was hardcoded to
                        a red S, which was right only while every leg was a
                        buy -- a SELL leg's exit is a BUY, and showed wrong. */}
                    <PricedSide side={leg.side === 'SELL' ? 'BUY' : 'SELL'}>
                      {money(leg.exit_price)}
                    </PricedSide>
                    <span className="text-center">{leg.exit_date || '--'}</span>
                    <span className="text-center">{leg.exit_time || '--'}</span>
                  </>
                )}

                <span className="text-center" style={{ color: pnlColour(leg.pnl) }}>
                  {signed(leg.pnl)}
                </span>

                <button type="button" onClick={() => toggle(i)}
                        title={open.has(i) ? 'Hide detail' : 'Show detail'}
                        style={{ color: MUTED }}>
                  {open.has(i) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {open.has(i) && <LegDetail leg={leg} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TradeLegsTable;
