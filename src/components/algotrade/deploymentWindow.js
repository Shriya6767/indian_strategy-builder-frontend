/**
 * Entry/exit TIMES a deployment was activated with, keyed by deployment id.
 *
 * GET /live/deployments/{id} returns the dates but not the times, and the
 * socket carries only deployments still being monitored -- so a finished
 * deployment that never traded has no time anywhere. Display text only; no id
 * here is ever used to act. Delete this once the response carries the times.
 */

const KEY = 'live_deployment_windows';

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    // Corrupt storage must not stop a screen rendering; without it the times
    // simply fall back to "--", which is what they did before.
    return {};
  }
};

/** `{ entryTime, exitTime }` for a deployment, or null. */
export const getDeploymentWindow = (deploymentId) => {
  if (deploymentId == null) return null;
  return read()[String(deploymentId)] || null;
};

/** Record what a newly created deployment was activated with. */
export const rememberDeploymentWindow = (deploymentId, { entryTime, exitTime } = {}) => {
  if (deploymentId == null || (!entryTime && !exitTime)) return;
  try {
    const all = read();
    all[String(deploymentId)] = { entryTime: entryTime || null, exitTime: exitTime || null };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* best effort: the times fall back to "--" */ }
};
