import { useEffect, useState } from 'react';
import {
  addBroker, loginBroker, getBrokerAccountId, setBrokerLoggedIn,
  setBrokerAccountId, clearBrokerAccount, fetchBrokers, setBrokerNames, deactivateBroker,
  logoutBroker, brokerSessionLive, brokerEntriesFrom, brokerLabel, brokerKey,
} from '../../services/liveTradingApi';
import { ArrowLeft, ArrowRight, Search, Eye, EyeOff, AlertCircle, X } from 'lucide-react';
import { INK, MUTED, BORDER, BLUE, DEEP, DANGER, GREEN, SOFT_BG } from './palette';
import Toggle from './Toggle';
import ConfirmDialog from '../ConfirmDialog';
import BrokerLogo from './BrokerLogo';

/**
 * Broker Login: the catalogue (All Brokers), existing connections (My Brokers),
 * and the form the two brokers share.
 *
 * The form validates first -- a red toast per problem -- and only then posts.
 * Secrets are masked and nothing typed here is logged or kept.
 *
 * THE ONLY SCREEN THAT CALLS GET /live/brokers, so the only writer of the
 * stored broker id, logged-in flag and name cache Algo Trade reads all day.
 */

/*
  Both brokers use the same POST /api/live/brokers with the same XTS-shaped
  payload, on the understanding that ArhamW is a CoLo deployment of Open XTS.
  NO EXTRA FIELD IS SENT -- a `broker_type` was tried and removed; the endpoint
  does not define it and an unexpected field risks a 422. `id` is ours alone.

  `locked` -- fields a broker SHOWS but does not accept input for, sent as null
  (ArhamW's endpoints are fixed backend-side and it takes no dealer id). The
  request still carries all eight keys. DECLARED ONCE, because validation, the
  inputs and the payload all read it -- otherwise a field could end up required
  by one and nulled by another. Symphony declares none.
*/
const BROKERS = [
  { id: 'symphony', name: 'Symphony (Open XTS)', exchanges: ['NSE', 'BSE'] },
  {
    id: 'arham',
    name: 'ArhamW - CoLo',
    exchanges: ['NSE', 'BSE'],
    locked: ['connectionUrl', 'hostLookupUrl', 'dealerId'],
  },
];

/** "2026-10-01 11:03:20.271675" -> "01 Oct 2026, 11:03". */
const stamp = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[3]} ${months[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
};

/**
 * The connection's fields, in the order the reference lists them. `error` is the
 * exact wording its toast uses when the field is left empty.
 */
const FIELDS = [
  { key: 'interactiveApiKey', label: 'Interactive API Key', error: 'Interactive API Key is required' },
  { key: 'interactiveApiSecret', label: 'Interactive API Secret', error: 'Interactive API Secret is required' },
  { key: 'marketDataApiKey', label: 'Market Data API Key', error: 'Market Data API Key is required' },
  { key: 'marketDataApiSecret', label: 'Market Data API Secret', error: 'Market Data API Secret is required' },
  { key: 'connectionUrl', label: 'Connection URL', error: 'Connection URL is required' },
  { key: 'hostLookupUrl', label: 'Host Lookup URL', error: 'Host Lookup URL is required' },
];

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, '']));

/** Green confirmation banner for a completed call, same placement as the
 *  red warnings so the two never fight for the corner. */
const Notice = ({ item, onDismiss }) => (
  item ? (
    <div className="fixed top-20 right-6 z-50 w-[390px]">
      <div
        className="relative flex items-start gap-3 rounded px-4 py-4 text-white shadow-lg"
        style={{ backgroundColor: GREEN }}
      >
        <p className="text-[14px] leading-snug pr-6">{item.text}</p>
        <button type="button" onClick={onDismiss} className="absolute top-3 right-3 text-white/80">
          <X size={16} />
        </button>
      </div>
    </div>
  ) : null
);

/** Red validation toasts, stacked top-right, each dismissible. */
const Warnings = ({ items, onDismiss }) => (
  <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 w-[390px]">
    {items.map((item) => (
      <div
        key={item.id}
        className="relative flex items-start gap-3 rounded px-4 py-4 text-white shadow-lg"
        style={{ backgroundColor: DANGER }}
      >
        <AlertCircle size={18} className="shrink-0 mt-0.5" />
        <p className="text-[15px] leading-snug">{item.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center"
          style={{ color: DANGER }}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    ))}
  </div>
);

/**
 * One masked field with its own reveal control.
 *
 * `disabled` dims it to 0.55 and blocks typing — the same treatment Dealer ID
 * already gets when its toggle is off, so a locked field looks like something
 * the form deliberately switched off rather than something broken.
 */
const SecretField = ({ label, value, onChange, shown, onToggle, placeholder, disabled = false }) => (
  <div className="mb-4">
    <p className="text-[13px] mb-1.5" style={{ color: INK }}>{label}:</p>
    <div
      className="flex items-center h-10 px-3 rounded border bg-white"
      style={{ borderColor: BORDER, opacity: disabled ? 0.55 : 1 }}
    >
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-[13px] outline-none bg-transparent"
        style={{ color: INK }}
      />
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={shown ? 'Hide' : 'Show'}
        style={{ color: MUTED }}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  </div>
);

/**
 * One connected broker account, as GET /live/brokers describes it.
 *
 * Separate from the catalogue card above: that one offers a broker to set up,
 * this one is a connection that already exists and reports its own session. The
 * session is the API's, not a flag kept here, so a session that expired
 * overnight shows as logged out without anything in the browser having to know.
 */
const AccountCard = ({ account, saving, live, onLogin, onLogout, onDeactivate }) => {
  const label = brokerLabel(account.broker);
  const expires = stamp(account.session?.expires_at);

  return (
    <div className="border rounded-md bg-white overflow-hidden transition-shadow hover:shadow-[0_1px_10px_0_rgba(0,0,0,0.09)]"
         style={{ borderColor: BORDER }}>
      <div className="p-5">
        <div className="flex items-center gap-4">
          <span className="w-[54px] h-[54px] rounded-md border flex items-center justify-center shrink-0 bg-white"
                style={{ borderColor: BORDER }}>
            {/* `account.broker` is the API's own field -- the same one the
                label above is read from. It was `broker_id`, which the
                response does not carry, so every connected account fell back
                to Symphony's mark. */}
            <BrokerLogo brokerId={account.broker} name={label} size={38} />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] truncate" style={{ color: INK }}>
              {account.connection_name || label}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>{label}</p>
          </div>
          <span className="ml-auto inline-flex items-center h-[22px] px-2 rounded text-[11px] font-medium shrink-0"
                style={live
                  ? { color: GREEN, backgroundColor: '#E6F3EB' }
                  : { color: MUTED, backgroundColor: SOFT_BG }}>
            {live ? 'LOGGED IN' : 'LOGGED OUT'}
          </span>
        </div>

        <div className="mt-4 grid gap-1.5 text-[12px]" style={{ color: MUTED }}>
          <p>Interactive key: <span style={{ color: INK }}>{account.interactive_key_masked || '--'}</span></p>
          <p>Market data keys: <span style={{ color: INK }}>{account.has_marketdata_keys ? 'Yes' : 'No'}</span></p>
          {account.dealer_client_id && (
            <p>Dealer ID: <span style={{ color: INK }}>{account.dealer_client_id}</span></p>
          )}
          <p className="truncate" title={account.connection_url || ''}>
            Connection: <span style={{ color: INK }}>{account.connection_url || '--'}</span>
          </p>
          {expires && (
            <p>Session {live ? 'expires' : 'expired'}: <span style={{ color: INK }}>{expires}</span></p>
          )}
          {account.session?.last_error && (
            <p style={{ color: DANGER }}>{account.session.last_error}</p>
          )}
        </div>
      </div>

      {live ? (
        <div className="w-full grid grid-cols-2 border-t" style={{ borderColor: BORDER }}>
          <button type="button" onClick={() => onLogout(account)}
                  className="py-3 text-[14px] font-medium border-r bg-white"
                  style={{ borderColor: BORDER, color: DANGER }}>
            Logout
          </button>
          <button type="button" disabled={saving} onClick={() => onLogin(account)}
                  className="py-3 text-[14px] font-medium bg-white disabled:opacity-60"
                  style={{ color: DEEP }}>
            {saving ? 'Please wait…' : 'Re-login'}
          </button>
        </div>
      ) : (
        /*
          LOGGED OUT: Login, and Deactivate Broker beside it. Two halves of one
          strip, split the same way the logged-in state splits Logout /
          Re-login, so the card has one footer shape in both states.

          Deactivate is destructive and wears DANGER; it never acts directly --
          it raises a confirm first.
        */
        <div className="grid grid-cols-2 border-t" style={{ borderColor: BORDER }}>
          <button type="button" disabled={saving} onClick={() => onLogin(account)}
                  className="group py-3 text-[14px] font-medium border-r bg-white disabled:opacity-60"
                  style={{ borderColor: BORDER, color: DEEP }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="group-hover:underline group-focus:underline underline-offset-4">
                {saving ? 'Please wait…' : 'Login'}
              </span>
              <ArrowRight size={14}
                          className="opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </span>
          </button>
          {/*
            A destructive control needs a destructive hover: red TEXT on plain
            white gave no feedback at all, so the button read as a label. The
            tint and its darker press are the same pair "Square off all" uses,
            which is the app's existing destructive-hover language.
          */}
          <button type="button" disabled={saving} onClick={() => onDeactivate?.(account)}
                  className="py-3 text-[14px] font-medium transition-colors disabled:opacity-60"
                  style={{ color: DANGER, backgroundColor: '#FFFFFF' }}
                  onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#FBF3F3'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
                  onMouseDown={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#F8E4E4'; }}
                  onMouseUp={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#FBF3F3'; }}>
            Deactivate Broker
          </button>
        </div>
      )}
    </div>
  );
};

const BrokerSetup = ({ onBack, onNotify }) => {
  const [tab, setTab] = useState('All Brokers');
  const [query, setQuery] = useState('');
  const [setupFor, setSetupFor] = useState(null);

  const [connectionName, setConnectionName] = useState('');
  const [values, setValues] = useState(EMPTY);
  const [dealerOn, setDealerOn] = useState(false);
  const [dealerId, setDealerId] = useState('');
  const [shown, setShown] = useState(() => new Set());
  const [warnings, setWarnings] = useState([]);
  // A broker id in localStorage means setup is already done on this machine,
  // so the card offers Login rather than Setup.
  const [brokerId, setBrokerId] = useState(() => getBrokerAccountId());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  /**
   * The account awaiting a deactivate confirmation, else null.
   *
   * Deactivating is destructive and irreversible, so the button only ever
   * RAISES this -- the DELETE is sent from the confirm, never from the card.
   */
  const [deactivateAsk, setDeactivateAsk] = useState(null);
  /** True while the DELETE is in flight, so the dialog cannot be fired twice. */
  const [deactivating, setDeactivating] = useState(false);
  // Every broker connection this user has, from GET /live/brokers. The list is
  // the authority on which are logged in -- the stored flag only covers the one
  // account this browser added, and says nothing about the others.
  const [accounts, setAccounts] = useState([]);

  /**
   * Whether an account counts as logged in: the server's session, full stop.
   *
   * This used to subtract a set of "logged out in this browser" ids, because
   * there was no logout endpoint and the server kept reporting logged_in
   * true afterwards. POST /brokers/{id}/logout exists now and returns the
   * account with the session closed, so the server's word is the only word
   * and that local note is gone.
   */
  const isLive = (account) => brokerSessionLive(account);

  /** Re-read the connections. Called on open and after every login. */
  const loadAccounts = () => fetchBrokers()
    .then((body) => {
      const rows = body?.data || [];
      setAccounts(rows);
      /*
        STORE THE WHOLE ANSWER. This screen is the only place that calls
        GET /live/brokers, and the only place a login happens -- so what it
        writes here is what Algo Trade reads for the rest of the day: each
        connection's name, whether it is logged in, and the server's own
        `expires_at`.

        The expiry is the part that matters tomorrow morning. Without it a
        stored `live: true` would still read as connected after the session
        had lapsed; with it the same stored entry judges itself correctly
        and Algo Trade needs no request to find out.
      */
      setBrokerNames(brokerEntriesFrom(rows));

      // Keep the single-account shortcuts the rest of the app reads in step
      // with what the server has. The ACTIVE account is the first one actually
      // logged in -- not simply rows[0], which pointed Algo Trade at a
      // connection the user had logged out of as soon as a second one existed.
      if (rows.length > 0) {
        const active = rows.find(brokerSessionLive) || rows[0];
        setBrokerAccountId(active.broker_account_id);
        setBrokerId(active.broker_account_id);
        setBrokerLoggedIn(rows.some(brokerSessionLive));
      } else {
        /*
          NO CONNECTIONS LEFT -- forget the stored pair.

          Without this, deactivating the last broker left both the id and the
          `logged_in` flag behind, because this block only ever ran when there
          WAS a row to read them from. Algo Trade asks exactly that pair
          whether a broker is available, so it went on reporting "Broker Login
          1/1" and would have let a strategy be activated against an account
          the server had already deleted.
        */
        clearBrokerAccount();
        setBrokerId(null);
      }
      return rows;
    })
    // Non-fatal: the catalogue card still works off the stored id.
    .catch(() => []);

  // Mount-only: this screen is unmounted when it is left, so the next visit
  // refetches rather than showing a session state that has since changed.
  useEffect(() => { loadAccounts(); }, []);

  /**
   * POST /brokers/{id}/logout.
   *
   * THE SERVER DECIDES. It refuses while deployments are still live on that
   * broker, and then nothing changes here -- the session genuinely is open.
   * On success the reply carries the account back with logged_in:false and the
   * card is rebuilt from THAT, not from an assumption made here.
   */
  const doLogout = (accountId) => {
    if (accountId == null) return;
    setSaving(true);
    logoutBroker(accountId)
      .then((body) => {
        const row = body?.data;
        const id = String(row?.broker_account_id ?? accountId);

        // Replace just this account with the one the server returned.
        setAccounts((was) => {
          const next = was.map((r) => (String(r.broker_account_id) === id ? { ...r, ...row } : r));
          // The stored copy Algo Trade reads is rebuilt from the same rows,
          // so the board sees the logout without asking anyone.
          setBrokerNames(brokerEntriesFrom(next));
          setBrokerLoggedIn(next.some(brokerSessionLive));
          return next;
        });

        const text = body?.message || 'Logged out.';
        setNotice({ kind: 'success', text });
        onNotify?.(text, 'success');
      })
      .catch((err) => {
        // Still logged in: say why, and leave every button where it was.
        setNotice({ kind: 'error', text: err.message });
        onNotify?.(err.message, 'error');
      })
      .finally(() => setSaving(false));
  };

  /** Opens a broker's form on a clean slate, keeping no secrets from a previous
   *  attempt in memory. */
  const openSetup = (broker) => {
    setConnectionName('');
    setValues(EMPTY);
    setDealerOn(false);
    setDealerId('');
    setShown(new Set());
    setWarnings([]);
    // Also the notice: adding one broker leaves a green "Broker added." behind,
    // and it used to still be sitting at the top of the NEXT broker's empty
    // form, which reads as though that one had already saved.
    setNotice(null);
    setSetupFor(broker);
  };

  /** Leaves the form and clears everything typed into it. */
  const closeSetup = () => {
    setConnectionName('');
    setValues(EMPTY);
    setDealerOn(false);
    setDealerId('');
    setShown(new Set());
    setWarnings([]);
    setSetupFor(null);
  };

  const reveal = (key) => setShown((was) => {
    const next = new Set(was);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const visible = BROKERS.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()));

  /*
    catalogue id -> how many connections exist for it.

    Counted from `accounts`, the GET /live/brokers rows this screen already
    holds, so the number cannot disagree with the list under My Brokers and
    costs no extra request. A connection whose `broker` we do not recognise
    counts towards no card -- it still appears under My Brokers, where it is
    read from the API's own value rather than matched against our catalogue.
  */
  const setupCount = accounts.reduce((acc, a) => {
    const key = brokerKey(a.broker);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  /*
    The fields this broker shows but does not accept input for. Empty for
    Symphony, so everything below behaves exactly as it always has.
  */
  const locked = new Set(setupFor?.locked || []);

  const submit = () => {
    // An untouched form gets one message — seven at once for a form nobody has
    // typed in is noise. Once anything is filled, the report becomes specific:
    // one message per field still missing.
    const touched = Boolean(connectionName.trim())
      || FIELDS.some((field) => values[field.key].trim())
      || (dealerOn && dealerId.trim());

    if (!touched) {
      setWarnings([{ id: `${Date.now()}`, message: 'Please fill the details' }]);
      return;
    }

    const missing = [];
    if (!connectionName.trim()) missing.push('Please enter a connection name');
    // A locked field is never reported missing: it is not fillable, so demanding
    // it would make the form impossible to submit.
    FIELDS.forEach((field) => {
      if (!locked.has(field.key) && !values[field.key].trim()) missing.push(field.error);
    });
    if (!locked.has('dealerId') && dealerOn && !dealerId.trim()) missing.push('Dealer ID is required');

    if (missing.length) {
      // Stamped ids so repeat submissions add fresh toasts rather than merging.
      setWarnings(missing.map((message, index) => ({ id: `${Date.now()}-${index}`, message })));
      return;
    }
    setSaving(true);
    addBroker({
      connectionName: connectionName.trim(),
      interactiveKey: values.interactiveApiKey.trim(),
      interactiveSecret: values.interactiveApiSecret.trim(),
      marketdataKey: values.marketDataApiKey.trim(),
      marketdataSecret: values.marketDataApiSecret.trim(),
      // LOCKED FIELDS GO AS null, not as an empty string -- the request still
      // carries all eight keys, and null says "this broker has no value for
      // this" rather than "the user left it blank".
      connectionUrl: locked.has('connectionUrl') ? null : values.connectionUrl.trim(),
      hostLookupUrl: locked.has('hostLookupUrl') ? null : values.hostLookupUrl.trim(),
      // Unlocked: only sent when the toggle is on AND something was typed;
      // otherwise the field still rides along, as an empty string.
      dealerClientId: locked.has('dealerId') ? null : (dealerOn ? dealerId.trim() : ''),
    })
      .then((body) => {
        setBrokerId(getBrokerAccountId());
        const text = body?.message || 'Broker added successfully';
        setNotice({ kind: 'success', text });
        // The app's own toast as well, exactly as doLogin does -- adding a
        // broker used to report itself ONLY through the in-page banner, so the
        // two halves of the same journey confirmed themselves differently.
        onNotify?.(text, 'success');
        setSetupFor(null);
        // The new connection should appear in the list without a reload.
        loadAccounts();
      })
      .catch((err) => {
        setWarnings([{ id: `${Date.now()}`, message: err.message }]);
        onNotify?.(err.message || 'Could not add the broker.', 'error');
      })
      .finally(() => setSaving(false));
  };

  /** POST one broker account to /login, then re-read the list so its session
   *  state comes from the server rather than from an assumption made here. */
  const doLogin = (accountId = brokerId) => {
    setSaving(true);
    loginBroker(accountId)
      .then(() => {
        setNotice({ kind: 'success', text: 'Login successfully.' });
        onNotify?.('Login successfully', 'success');
        return loadAccounts();
      })
      .catch((err) => setWarnings([{ id: `${Date.now()}`, message: err.message }]))
      .finally(() => setSaving(false));
  };

  // ── The connection form ───────────────────────────────────────────────────
  if (setupFor) {
    return (
      <div className="px-6 py-5">
        <Warnings items={warnings} onDismiss={(id) => setWarnings((w) => w.filter((x) => x.id !== id))} />
        <Notice item={notice} onDismiss={() => setNotice(null)} />

        <div className="flex items-start gap-6">
          {/* Filled grey disc, as the reference draws it — no outline. */}
          <button
            type="button"
            onClick={closeSetup}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1"
            style={{ backgroundColor: SOFT_BG, color: INK }}
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex-1 flex justify-center min-w-0">
          <div className="w-full max-w-[1204px] border rounded-md bg-white px-10 pt-11 pb-12" style={{ borderColor: BORDER }}>
            <h2 className="text-[22px] font-semibold" style={{ color: INK }}>Setup {setupFor.name}</h2>

            <p className="text-[13px] mt-6 mb-1.5" style={{ color: INK }}>Connection Name</p>
            <input
              value={connectionName}
              onChange={(e) => setConnectionName(e.target.value)}
              placeholder="Name this API connection"
              className="w-full max-w-[665px] h-10 px-3 rounded border text-[13px] outline-none"
              style={{ borderColor: BORDER, color: INK }}
            />

            <div className="flex flex-wrap gap-10 mt-8">
              <p className="text-[14px] flex-1 min-w-[260px]" style={{ color: INK }}>
                <span style={{ color: BLUE }}>1.</span> Enter all the following details.
              </p>

              <div className="w-[434px] border rounded-md p-5 shrink-0" style={{ borderColor: BORDER }}>
                {FIELDS.map((field) => (
                  <SecretField
                    key={field.key}
                    label={field.label}
                    placeholder={`Enter ${field.label}`}
                    value={values[field.key]}
                    onChange={(v) => setValues((was) => ({ ...was, [field.key]: v }))}
                    shown={shown.has(field.key)}
                    onToggle={() => reveal(field.key)}
                    disabled={locked.has(field.key)}
                  />
                ))}

                <div className="mb-4">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-[13px]" style={{ color: INK }}>Dealer ID:</span>
                    <Toggle
                      on={dealerOn}
                      // Locked: the toggle is inert too, otherwise flipping it
                      // would re-enable the input underneath.
                      onClick={() => { if (!locked.has('dealerId')) setDealerOn((was) => !was); }}
                      title="Dealer ID"
                    />
                  </div>
                  <div
                    className="flex items-center h-10 px-3 rounded border bg-white"
                    style={{ borderColor: BORDER, opacity: dealerOn && !locked.has('dealerId') ? 1 : 0.55 }}
                  >
                    <input
                      type={shown.has('dealerId') ? 'text' : 'password'}
                      value={dealerId}
                      disabled={!dealerOn || locked.has('dealerId')}
                      onChange={(e) => setDealerId(e.target.value)}
                      placeholder="Please Input Dealer Id For DMA Accounts"
                      className="flex-1 text-[13px] outline-none bg-transparent"
                      style={{ color: INK }}
                    />
                    <button type="button" onClick={() => reveal('dealerId')} style={{ color: MUTED }}
                            title={shown.has('dealerId') ? 'Hide' : 'Show'}>
                      {shown.has('dealerId') ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={submit}
                  className="w-full h-11 rounded-md text-[14px] font-medium text-white"
                  style={{ backgroundColor: DEEP }}
                >
                  Add {setupFor.name}
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  // ── The broker list ───────────────────────────────────────────────────────
  return (
    <div className="px-6 py-5">
      {/*
        Deactivate confirmation. The endpoint has not been supplied yet, so
        confirming closes the dialog and says so rather than pretending to
        have deactivated anything.
      */}
      <ConfirmDialog
        isOpen={deactivateAsk !== null}
        title="Deactivate broker?"
        message={`Are you sure you want to deactivate ${deactivateAsk?.broker_name || deactivateAsk?.name || 'this broker'}?`}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        busy={deactivating}
        onCancel={() => { if (!deactivating) setDeactivateAsk(null); }}
        onConfirm={() => {
          const id = deactivateAsk?.broker_account_id;
          if (id == null || deactivating) return;
          setDeactivating(true);
          deactivateBroker(id)
            .then((body) => {
              onNotify?.(body?.message || 'Deactivated successfully', 'success');
              setDeactivateAsk(null);
              // The account is gone: refetch rather than patching the list, so
              // what is on screen is what the server actually has.
              loadAccounts();
            })
            .catch((err) => onNotify?.(err.message, 'error'))
            .finally(() => setDeactivating(false));
        }}
      />

      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full border flex items-center justify-center bg-white shrink-0"
          style={{ borderColor: BORDER, color: INK }}
          title="Back to Algo Trade"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-8 ml-2">
          {/* The count is what the API reports, not a hardcoded 0. */}
          {['All Brokers', `My Brokers (${accounts.length})`].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name.startsWith('My Brokers') ? 'My Brokers' : name)}
              className="pb-2.5 pt-2 text-[15px] border-b-2"
              style={(name.startsWith('My Brokers') ? 'My Brokers' : name) === tab
                ? { color: INK, borderColor: INK, fontWeight: 500 }
                : { color: MUTED, borderColor: 'transparent' }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="h-px -mx-6 mb-6" style={{ backgroundColor: BORDER }} />

      <div
        className="inline-flex items-center gap-2 h-10 px-3.5 rounded-md border bg-white w-[240px] mb-7"
        style={{ borderColor: BORDER }}
      >
        <Search size={15} style={{ color: MUTED }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your broker"
          className="flex-1 text-[13px] outline-none bg-transparent"
          style={{ color: INK }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} style={{ color: MUTED }} title="Clear">
            <X size={14} />
          </button>
        )}
      </div>

      {tab === 'My Brokers' ? (
        accounts.length === 0 ? (
          <p className="text-[14px] mt-10" style={{ color: MUTED }}>No brokers connected yet.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-5 max-w-[1800px]">
            {accounts.map((account) => (
              <AccountCard key={account.broker_account_id} account={account} saving={saving}
                           live={isLive(account)}
                           onLogin={(a) => doLogin(a.broker_account_id)}
                           onDeactivate={(a) => setDeactivateAsk(a)}
                           onLogout={(a) => doLogout(a.broker_account_id)} />
            ))}
          </div>
        )
      ) : (
        <>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-5 max-w-[1800px]">
          {visible.map((broker) => (
            <div
              key={broker.id}
              className="border rounded-md bg-white overflow-hidden transition-shadow hover:shadow-[0_1px_10px_0_rgba(0,0,0,0.09)]"
              style={{ borderColor: BORDER }}
            >
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <span
                    className="w-[54px] h-[54px] rounded-md border flex items-center justify-center shrink-0 bg-white"
                    style={{ borderColor: BORDER }}
                  >
                    <BrokerLogo brokerId={broker.id} name={broker.name} size={38} />
                  </span>
                  <p className="text-[16px]" style={{ color: INK }}>{broker.name}</p>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  {broker.exchanges.map((ex) => (
                    <span
                      key={ex}
                      className="inline-flex items-center justify-center h-[22px] min-w-[48px] px-2.5 rounded-full border text-[11px] font-medium"
                      style={ex === 'NSE'
                        ? { borderColor: BORDER, color: INK }
                        : { borderColor: '#A9D4F2', color: BLUE }}
                    >
                      {ex}
                    </span>
                  ))}
                </div>

                {/* THE REAL COUNT, not a hardcoded 0. Every connection the
                    server reports for this broker -- the same rows My Brokers
                    lists -- so setting one up makes this card say so instead
                    of claiming none exist. `brokerKey` folds the API's
                    `broker` value onto this catalogue's id, which is how an
                    `arham_wealth` connection is counted under ArhamW. */}
                <p className="text-[13px] mt-4" style={{ color: INK }}>
                  APIs setup: {setupCount[broker.id] || 0}
                </p>
              </div>

              {/* ALWAYS "Setup". All Brokers is the catalogue of brokers that
                  can be connected; a connection that already exists lives in
                  My Brokers, with its own Logout / Re-login. Showing the
                  logged-in state here too put the same account on two tabs.
                  Underline and arrow on hover are pure CSS -- no state, no
                  re-render. */}
              <button
                type="button"
                onClick={() => openSetup(broker)}
                className="group w-full py-3 text-[14px] font-medium border-t bg-white"
                style={{ borderColor: BORDER, color: DEEP }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="group-hover:underline group-focus:underline underline-offset-4">
                    Setup
                  </span>
                  <ArrowRight
                    size={14}
                    className="opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
                  />
                </span>
              </button>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="text-[14px]" style={{ color: MUTED }}>No brokers match your search.</p>
          )}
        </div>

        </>
      )}
    </div>
  );
};

export default BrokerSetup;
