import { useEffect, useRef, useState } from 'react';
import { X, Download, Funnel } from 'lucide-react';
import {
  Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { INK, MUTED, BORDER, BLUE, BLUE_TINT, GREEN, DANGER, RULE, DEEP } from './palette';
import { useLiveSnapshot } from '../../services/liveSnapshot';
import { downloadNodePng } from './chartPng';
import Toggle from './Toggle';

/**
 * "Daily MTM Graph" — opened from the Total MTM card, or a broker's card.
 *
 * THE CURVE IS BUILT HERE, from the socket: the backend sends the current
 * total once a second and nothing sends the day's history, so the line honestly
 * begins when the dialog opened, not at 09:15.
 *
 * Capped at MAX_POINTS, oldest dropped. Samples live in a ref and reach state
 * only when a new second arrives, so nothing re-renders between ticks.
 * Drawdown is derived: each point's MTM minus the highest MTM seen so far.
 */

const VENUES = ['NSE/BSE', 'DELTA', 'COINSWITCH'];

/** 09:15 to 15:30 is 6h15m; one point a second is 22,500 at most. Capped well
 *  under that — the chart cannot resolve more than a few hundred anyway. */
const MAX_POINTS = 900;

const clock = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "₹ -56,103" — Indian grouping, sign written out. */
const rupees = (n) => {
  const value = Number(n || 0);
  return `${value < 0 ? '-' : ''}₹ ${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

/** One of the four figures above the chart. */
const Stat = ({ label, value, at, tone }) => (
  <div>
    <p className="text-[12px]" style={{ color: MUTED }}>{label}</p>
    <p className="text-[15px] font-medium mt-1" style={{ color: tone }}>{value}</p>
    {at && <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>at {at}</p>}
  </div>
);

/**
 * `brokerName` is whose card was clicked — the dialog is titled by it, as the
 * reference chips the broker beside "Total". `deploymentId` narrows the curve
 * to one deployment; omitted, it plots the account total.
 */
const MtmGraphDialog = ({ onClose, brokerName, deploymentId = null }) => {
  const [venue, setVenue] = useState('NSE/BSE');
  const [showDrawdown] = useState(true);
  const [showIndex, setShowIndex] = useState(false);
  const [series, setSeries] = useState([]);
  const { snapshot } = useLiveSnapshot();

  // The samples themselves. A ref, so arriving snapshots do not each trigger a
  // render pass of their own before the series is rebuilt.
  const points = useRef([]);
  const lastTs = useRef(null);
  const chartRef = useRef(null);
  const [naming, setNaming] = useState(false);
  const [fileName, setFileName] = useState(
    () => `Data for ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}`,
  );

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * One sample per snapshot, deduplicated on the server's own timestamp so a
   * re-render cannot add a point the socket did not send.
   */
  useEffect(() => {
    if (!snapshot) return;
    const ts = snapshot.ts ? Math.round(snapshot.ts * 1000) : Date.now();
    if (lastTs.current === ts) return;
    lastTs.current = ts;

    const mtm = deploymentId == null
      ? Number(snapshot.total_mtm || 0)
      : Number((snapshot.deployments || [])
        .find((d) => String(d.deployment_id) === String(deploymentId))?.mtm || 0);

    const next = [...points.current, { ts, mtm, sensex: Number(snapshot.sensex) || null }];
    // Oldest first out, so the array is bounded however long this stays open.
    points.current = next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;

    // Drawdown at each point: how far below the running peak it sits.
    let peak = -Infinity;
    setSeries(points.current.map((p) => {
      peak = Math.max(peak, p.mtm);
      return { time: clock(p.ts), mtm: p.mtm, sensex: p.sensex, drawdown: p.mtm - peak };
    }));
  }, [snapshot, deploymentId]);

  const values = series.map((p) => p.mtm);
  const current = values.length ? values[values.length - 1] : 0;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const maxDrawdown = series.length ? Math.min(...series.map((p) => p.drawdown)) : 0;
  const at = (target) => series.find((p) => p.mtm === target)?.time;

  /**
   * The samples as a .csv, in the reference export's shape: every field quoted,
   * figures to two decimals, one row a minute.
   */
  const downloadCsv = () => {
    const q = (v) => `"${v}"`;
    const csv = [
      ['Time', 'MTM', 'Drawdown'].map(q).join(','),
      ...series.map((p) => [
        p.time, Number(p.mtm).toFixed(2), Number(p.drawdown).toFixed(2),
      ].map(q).join(',')),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(fileName || 'Daily MTM').trim().replace(/[\\/:*?"<>|]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNaming(false);
  };

  /** The chart panel as a .png. The tooltip is excluded by data-png-hide, so
   *  it only appears in the image if the pointer is genuinely over the chart. */
  const downloadPng = () => {
    downloadNodePng(chartRef.current, `Daily MTM ${new Date().toISOString().slice(0, 10)}`)
      .catch(() => { /* nothing to report: the button simply did not capture */ });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />

      {naming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNaming(false)}
               role="presentation" />
          <div className="relative w-[340px] rounded-md bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h4 className="text-[15px] font-semibold" style={{ color: INK }}>Enter file name</h4>
              <button type="button" onClick={() => setNaming(false)} title="Close"
                      style={{ color: MUTED }}>
                <X size={18} />
              </button>
            </div>
            <div className="px-5 pb-5">
              <p className="text-[13px] mb-2" style={{ color: INK }}>File Name:</p>
              <input value={fileName} onChange={(e) => setFileName(e.target.value)}
                     className="w-full h-9 px-3 rounded border text-[13px] outline-none"
                     style={{ borderColor: BORDER, color: INK }} aria-label="File name" />
              <div className="text-right mt-5">
                <button type="button" onClick={downloadCsv}
                        className="h-9 px-5 rounded text-[13px] font-medium text-white"
                        style={{ backgroundColor: DEEP }}>
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-[720px] rounded-lg bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h3 className="text-[17px] font-semibold" style={{ color: INK }}>Daily MTM Graph</h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6">
          {/* Scope on the left, venue tabs on the right. */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="inline-flex items-center gap-3">
              <span className="text-[13px]" style={{ color: INK }}>Total</span>
              {brokerName && (
                <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12px]"
                      style={{ backgroundColor: BLUE_TINT, color: BLUE }}>
                  <Funnel size={12} style={{ color: GREEN }} />
                  {brokerName}
                </span>
              )}
            </div>

            <span className="inline-flex items-center rounded-md border overflow-hidden bg-white"
                  style={{ borderColor: BORDER }}>
              {VENUES.map((name) => (
                <button key={name} type="button" onClick={() => setVenue(name)}
                        className="h-[28px] px-3.5 text-[12px]"
                        style={name === venue
                          ? { backgroundColor: BLUE_TINT, color: BLUE, fontWeight: 500 }
                          : { backgroundColor: '#FFFFFF', color: INK }}>
                  {name}
                </button>
              ))}
            </span>
          </div>

          {/* The four figures, and the two exports. No share buttons: this is
              a trading record, not something to post. */}
          <div className="flex items-start justify-between gap-6 flex-wrap mt-5">
            <div className="flex items-start gap-10 flex-wrap">
              <Stat label="Today's MTM" value={rupees(current)}
                    tone={current < 0 ? DANGER : GREEN} />
              <Stat label="Min MTM" value={rupees(min)} at={at(min)} tone={DANGER} />
              <Stat label="Max MTM" value={rupees(max)} at={at(max)} tone={GREEN} />
              <Stat label="Max Drawdown" value={rupees(maxDrawdown)} tone={DANGER} />
            </div>

            <div className="flex items-center gap-2" data-png-hide>
              {/* A circular ".csv" badge, as the reference draws it — the word
                  itself, not a document glyph. */}
              <button type="button" onClick={() => setNaming(true)} title="Download the samples as .csv"
                      className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-full border bg-white text-[10px] font-semibold"
                      style={{ borderColor: BORDER, color: MUTED }}>
                .csv
              </button>
              <button type="button" onClick={downloadPng} title="Download this graph as a .png"
                      className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-full border bg-white"
                      style={{ borderColor: BORDER, color: MUTED }}>
                <Download size={14} />
              </button>
            </div>
          </div>

          {/* Legend, with the drawdown band switchable. */}
          <div className="flex items-center gap-6 mt-5 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: INK }}>
              <span className="w-[11px] h-[11px] rounded-sm" style={{ backgroundColor: BLUE }} />
              MTM
            </span>
            <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: INK }}>
              <span className="w-[11px] h-[11px] rounded-sm" style={{ backgroundColor: '#F6C9C6' }} />
              Drawdown
            </span>
            <span className="inline-flex items-center gap-2" data-png-hide>
              {/* The toggle adds the index's own line; the select names which
                  index, and SENSEX is the only one offered today. */}
              <Toggle on={showIndex} onClick={() => setShowIndex((v) => !v)}
                      title="Show the index line" />
              <select value="SENSEX" onChange={() => {}}
                      className="h-[28px] pl-3 pr-7 rounded border text-[12px] bg-white outline-none"
                      style={{ borderColor: BORDER, color: INK }}
                      aria-label="Index">
                <option value="SENSEX">SENSEX</option>
              </select>
            </span>
          </div>

          <div className="mt-5" ref={chartRef}>
            {/* The message shows only while there is genuinely NOTHING to draw.
                Once a curve exists it stays on screen even if the feed goes
                quiet -- wiping a chart back to "waiting" the moment a snapshot
                is late loses the very data the user opened this to see. */}
            {series.length < 2 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-center">
                <p className="text-[14px]" style={{ color: INK }}>Waiting for live data</p>
                <p className="text-[12px] mt-2 max-w-sm" style={{ color: MUTED }}>
                  The curve is drawn from the live feed as it arrives, so it starts
                  when this graph is opened.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={series} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F6C9C6" stopOpacity={0.75} />
                      <stop offset="100%" stopColor="#F6C9C6" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={RULE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: MUTED }} tickMargin={8}
                         stroke={BORDER} interval="preserveStartEnd" minTickGap={48} />
                  <YAxis yAxisId="mtm" tick={{ fontSize: 11, fill: MUTED }} width={76}
                         stroke={BORDER}
                         tickFormatter={(v) => Number(v).toLocaleString('en-IN')} />
                  {/* The index moves in tens of thousands while MTM moves in
                      hundreds, so it needs its own scale or one of them is a
                      flat line against the other. */}
                  {showIndex && (
                    <YAxis yAxisId="index" orientation="right" width={66} stroke={BORDER}
                           domain={['dataMin - 20', 'dataMax + 20']}
                           tick={{ fontSize: 11, fill: MUTED }}
                           tickFormatter={(v) => Number(v).toLocaleString('en-IN')} />
                  )}
                  <ReferenceLine yAxisId="mtm" y={0} stroke={MUTED} strokeDasharray="4 4" />
                  <Tooltip wrapperStyle={{ outline: 'none' }}
                           contentStyle={{ fontSize: 12, borderColor: BORDER, borderRadius: 6 }}
                           formatter={(v, key) => [
                             key === 'sensex' ? Number(v).toLocaleString('en-IN') : rupees(v),
                             key === 'mtm' ? 'MTM' : key === 'sensex' ? 'SENSEX' : 'Drawdown',
                           ]} />
                  {showDrawdown && (
                    <Area yAxisId="mtm" type="monotone" dataKey="drawdown" stroke="none"
                          fill="url(#ddFill)" isAnimationActive={false} />
                  )}
                  <Line yAxisId="mtm" type="monotone" dataKey="mtm" stroke={BLUE}
                        strokeWidth={1.75} dot={false} isAnimationActive={false} />
                  {showIndex && (
                    <Line yAxisId="index" type="monotone" dataKey="sensex" stroke="#B4791F"
                          strokeWidth={1.75} dot={false} isAnimationActive={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MtmGraphDialog;
