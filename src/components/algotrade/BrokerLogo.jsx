import { useState } from 'react';
import SymphonyLogo from './SymphonyLogo';
import { brokerKey } from '../../services/liveTradingApi';

/**
 * src/components/algotrade/BrokerLogo.jsx
 *
 * One place that decides which mark a broker shows, so the two places that
 * draw a broker card (All Brokers and My Brokers) cannot drift apart.
 *
 * Symphony's is an inlined SVG; ArhamW's is a supplied PNG. A missing or
 * unreadable file falls back to the broker's initials rather than a broken
 * image icon -- the card still reads correctly while the asset is being
 * added.
 */

/**
 * TWO VOCABULARIES REACH THIS COMPONENT and both have to work:
 *
 *   the catalogue  'symphony' | 'arham'           (our own BROKERS list)
 *   the API        'open_xts' | 'arham_wealth'    (account.broker)
 *
 * Folding them onto one id is why a connected ArhamW account shows its own
 * mark rather than Symphony's -- the connected card reads the API's value, the
 * catalogue card reads ours, and neither has to know about the other.
 *
 * `brokerKey` is imported rather than repeated here: the label and the
 * catalogue's connection count ask the same question, and a second copy of
 * the mapping is a second chance for the mark to disagree with the name.
 */

/** id -> imported asset. Vite resolves these at build time. */
const FILES = {
  arham: new URL('../../assets/arhamw-colo.png', import.meta.url).href,
};

const initialsOf = (name) => String(name || '?')
  .replace(/\(.*?\)/g, ' ')          // drop "(Open XTS)"-style suffixes
  .split(/[\s-]+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((w) => w[0].toUpperCase())
  .join('');

/** The placeholder mark — used for an unknown broker and for a file that will
 *  not load, which are the same thing as far as the card is concerned. */
const Initials = ({ name, size }) => (
  <span
    aria-hidden="true"
    className="inline-flex items-center justify-center rounded font-semibold"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.38), backgroundColor: '#EEF4F8', color: '#0B619B' }}
  >
    {initialsOf(name)}
  </span>
);

const BrokerLogo = ({ brokerId, name, size = 38 }) => {
  const [failed, setFailed] = useState(false);
  const id = brokerKey(brokerId);

  if (id === 'symphony') return <SymphonyLogo size={size} />;

  /*
    AN UNRECOGNISED BROKER FALLS THROUGH TO INITIALS, NOT TO SYMPHONY.

    Defaulting to Symphony's mark made any unknown value -- a third broker, or
    a spelling of ArhamW nobody here has seen -- claim to be Symphony, while
    the name beside it said otherwise. Initials are plainly a placeholder, so
    the card stays honest and the mismatch is visible instead of plausible.
  */
  if (!id) return <Initials name={name} size={size} />;

  const src = FILES[id];
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        // `contain`: the mark is square-ish but must never be cropped or
        // stretched if the supplied file is not exactly square.
        style={{ width: size, height: size, objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    );
  }

  return <Initials name={name} size={size} />;
};

export default BrokerLogo;
