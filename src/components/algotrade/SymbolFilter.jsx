import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { INK, MUTED, BORDER, BLUE } from './palette';

/**
 * The "0 Selected" control above the Activation table: a searchable
 * multi-select. Closed, it names one symbol or counts several.
 *
 * ORDER IS DELIBERATE, not alphabetical: the four index symbols lead, then
 * constituents in the reference's order, then the wider F&O universe -- an A-Z
 * sort would put ADANIPORTS above AXISBANK, which is not what it shows.
 */

// Indices first, then the constituents in the reference's own order.
const SYMBOLS = [
  'BANKNIFTY', 'NIFTY', 'MIDCPNIFTY', 'FINNIFTY',
  'ADANIENT', 'AXISBANK', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT',
  'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BPCL', 'BHARTIARTL',
  'BRITANNIA', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL',
  'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO',
  'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INDUSINDBK', 'INFY', 'ITC',
  'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'MAXHEALTH',
  'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN',
  'SHRIRAMFIN', 'SUNPHARMA', 'TATACONSUM', 'TATAMOTORS', 'TATASTEEL', 'TCS',
  'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO',
  // The rest of the F&O universe, alphabetically, as the reference continues.
  'AARTIIND', 'ABB', 'ABCAPITAL', 'ABFRL', 'ACC', 'ADANIGREEN', 'ALKEM',
  'AMBUJACEM', 'ANGELONE', 'APLAPOLLO', 'ASHOKLEY', 'ASTRAL', 'ATGL',
  'AUBANK', 'AUROPHARMA', 'BALKRISIND', 'BANDHANBNK', 'BANKBARODA',
  'BHARATFORG', 'BHEL', 'BIOCON', 'BOSCHLTD', 'BSE', 'BSOFT', 'CAMS',
  'CANBK', 'CDSL', 'CESC', 'CGPOWER', 'CHAMBLFERT', 'CHOLAFIN', 'COFORGE',
  'COLPAL', 'CONCOR', 'CROMPTON', 'CUMMINSIND', 'CYIENT', 'DABUR',
  'DALBHARAT', 'DEEPAKNTR', 'DELHIVERY', 'DIVISLAB', 'DIXON', 'DLF',
  'DMART', 'EXIDEIND', 'FEDERALBNK', 'GAIL', 'GLENMARK', 'GMRAIRPORT',
  'GODREJCP', 'GODREJPROP', 'GRANULES', 'HAL', 'HAVELLS', 'HFCL',
  'HINDCOPPER', 'HINDPETRO', 'HUDCO', 'ICICIGI', 'ICICIPRULI', 'IDEA',
  'IDFCFIRSTB', 'IEX', 'IGL', 'INDHOTEL', 'INDIANB', 'INDUSTOWER',
  'IOC', 'IRB', 'IRCTC', 'IRFC', 'JINDALSTEL', 'JSWENERGY', 'JUBLFOOD',
  'KALYANKJIL', 'KEI', 'KPITTECH', 'LAURUSLABS', 'LICHSGFIN', 'LICI',
  'LODHA', 'LTF', 'LTIM', 'LUPIN', 'MANAPPURAM', 'MARICO', 'MCX',
  'MFSL', 'MGL', 'MOTHERSON', 'MPHASIS', 'MRF', 'MUTHOOTFIN', 'NATIONALUM',
  'NAUKRI', 'NBCC', 'NCC', 'NHPC', 'NMDC', 'NYKAA', 'OBEROIRLTY',
  'OFSS', 'OIL', 'PAGEIND', 'PATANJALI', 'PAYTM', 'PEL', 'PERSISTENT',
  'PETRONET', 'PFC', 'PIDILITIND', 'PIIND', 'PNB', 'POLICYBZR',
  'POLYCAB', 'POONAWALLA', 'PRESTIGE', 'RBLBANK', 'RECLTD', 'SAIL',
  'SIEMENS', 'SJVN', 'SONACOMS', 'SRF', 'SUPREMEIND', 'SYNGENE',
  'TATACHEM', 'TATACOMM', 'TATAELXSI', 'TATAPOWER', 'TIINDIA', 'TORNTPHARM',
  'TORNTPOWER', 'TVSMOTOR', 'UBL', 'UNIONBANK', 'UNITDSPR', 'UPL',
  'VBL', 'VEDL', 'VOLTAS', 'YESBANK', 'ZYDUSLIFE',
];

/** One checkbox line. Defined at module level, NOT inside the component: a
 *  component created during render is a new type every keystroke, so React
 *  remounts the whole list and the search field loses focus mid-word. */
const Row = ({ checked, onChange, children }) => (
  <label
    className="flex items-center gap-2.5 px-3 h-[37px] text-[13px] cursor-pointer hover:bg-[#F5F5F5]"
    style={{ color: INK }}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 shrink-0 accent-[#0782DA]"
    />
    {children}
  </label>
);

const SymbolFilter = ({ picked, onPicked }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  // Present only while the panel is open — nothing to pay for the rest of the time.
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const term = query.trim().toUpperCase();
    return term ? SYMBOLS.filter((s) => s.includes(term)) : SYMBOLS;
  }, [query]);

  // "All" means every symbol the search is currently showing, not the whole
  // universe — ticking it after a search would otherwise select things the
  // person cannot see.
  const allShown = shown.length > 0 && shown.every((s) => picked.has(s));

  const toggle = (symbol) => onPicked((was) => {
    const next = new Set(was);
    if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
    return next;
  });

  const toggleAll = () => onPicked((was) => {
    const next = new Set(was);
    if (allShown) shown.forEach((s) => next.delete(s));
    else shown.forEach((s) => next.add(s));
    return next;
  });

  // One pick reads by name; more than one reads as a count, as the reference does.
  const label = picked.size === 1 ? [...picked][0] : `${picked.size} Selected`;
  const active = open || picked.size > 0;

  return (
    <span ref={boxRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center justify-between gap-2 h-[33px] px-3 rounded-md border text-[13px] bg-white min-w-[118px]"
        style={{ borderColor: active ? BLUE : BORDER, color: INK }}
      >
        {label}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-30 w-[218px] rounded-md border bg-white shadow-lg overflow-hidden"
          style={{ borderColor: BORDER }}
        >
          <div className="flex items-center gap-2 px-3 h-[41px] border-b" style={{ borderColor: BORDER }}>
            <Search size={15} style={{ color: MUTED }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search instruments"
              className="flex-1 min-w-0 text-[13px] outline-none bg-transparent"
              style={{ color: INK }}
            />
          </div>

          <div className="max-h-[248px] overflow-y-auto">
            <Row checked={allShown} onChange={toggleAll}>Select All</Row>
            {shown.map((symbol) => (
              <Row key={symbol} checked={picked.has(symbol)} onChange={() => toggle(symbol)}>
                {symbol}
              </Row>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-4 text-[13px] text-center" style={{ color: MUTED }}>
                No instrument matches “{query}”
              </p>
            )}
          </div>
        </div>
      )}
    </span>
  );
};

export default SymbolFilter;
