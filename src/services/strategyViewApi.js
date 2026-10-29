/**
 * src/services/strategyViewApi.js
 *
 * One read of a saved strategy, for the read-only viewer.
 *
 * It calls the SAME endpoint the builder's loader uses (GET /api/get-strategy)
 * and runs the response through the SAME decoder, so the viewer can never show
 * a different shape from what opening the strategy would give you.
 */

import { API_URL } from '../config/constants';
import { decodeBackendStrategy } from '../utils/backendStrategyDecode';
import logger from '../utils/logger';

/** A saved strategy as the builder's config object, or null if it cannot load. */
export const fetchStrategyConfig = async (strategyId, strategyName, version = null) => {
  let url = `${API_URL}/get-strategy?strategy_id=${encodeURIComponent(strategyId)}`
    + `&strategy_name=${encodeURIComponent(strategyName || '')}`;
  if (version !== null && version !== undefined) url += `&version=${encodeURIComponent(version)}`;

  /*
    `no-store`: this GET is what tells the Algo Trade execution dialog the
    strategy's CURRENT entry time, seconds after the builder changed it. The
    URL does not change between the old version and the new one, so without
    this a browser holding a cached copy answers with the entry time from
    before the edit -- the exact "I updated it and the popup still shows the
    old time" failure. Always go to the server.
  */
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
  if (response.status === 401) throw new Error('Your session has expired — please sign in again.');
  if (!response.ok) throw new Error(`This strategy could not be loaded (${response.status}).`);

  const body = await response.json();
  const data = body?.data ?? body;
  if (!data || body?.status === false) {
    throw new Error(body?.message || 'This strategy could not be loaded.');
  }
  logger.request('[VIEW STRATEGY] Loaded', { strategyId, version });
  return decodeBackendStrategy(data, strategyName);
};
