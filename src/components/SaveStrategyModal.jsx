import { useState, useEffect } from 'react';
import { X, Save, CheckCircle, Loader } from 'lucide-react';
import logger from '../utils/logger';
import { useSavedStrategies } from '../context/SavedStrategiesContext';
import { refreshLibrary } from '../services/strategyLibrary';
import { listFolders, addToFolder } from '../services/strategyFolders';
import { colors } from '../theme/colors';

/** Same comparison the saved list uses, so "KOKO" and "koko " are one name. */
const normalise = (name) => String(name || '').trim().toLowerCase();

const SaveStrategyModal = ({ isOpen, onClose, onSave, currentStrategyName = '', saveStatus = null, saveMessage = '' }) => {
  const [strategyName, setStrategyName] = useState(currentStrategyName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /**
   * The folders a new strategy can be dropped straight into.
   *
   * Loaded when the dialog OPENS, not on mount: a folder created a minute ago
   * in the sidebar has to appear here, and a list captured at mount would be
   * stale. The picker is hidden entirely when there are none -- an empty
   * dropdown is a dead control.
   */
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // Both setStates live inside the promise callback, which is what the
    // "no setState in an effect body" rule asks for -- and the reset rides
    // along with the fetch so the two can never disagree.
    listFolders()
      .then((rows) => { setFolders(rows); setFolderId(''); })
      .catch(() => { setFolders([]); setFolderId(''); });
  }, [isOpen]);

  // The saved list, from context — current even for a strategy saved a
  // moment ago on another screen, which a localStorage re-read could miss.
  const { hasName } = useSavedStrategies();

  /*
    Ask the server for its current list when the dialog opens.

    hasName() reads the library cache; if nothing has refreshed it this
    session it may be empty or stale, and the duplicate check would pass on a
    name the backend already holds. Never awaited and never fatal -- a failed
    refresh just leaves the check on whatever was already cached.
  */
  useEffect(() => { if (isOpen) refreshLibrary(); }, [isOpen]);

  /*
    Checked ON EVERY KEYSTROKE, not only on submit. The warning has to be
    visible while the name is being typed -- finding out only after clicking
    Save is what let a duplicate name feel accepted.
  */
  const trimmedName = strategyName.trim();
  const isDuplicate = Boolean(trimmedName) && hasName(trimmedName)
    // Re-saving the strategy already open under its own name is an UPDATE,
    // not a duplicate, so it must not be blocked.
    && normalise(trimmedName) !== normalise(currentStrategyName);

  useEffect(() => {
    if (saveStatus === 'loading') {
      setSaving(true);
      setError('');
    } else if (saveStatus === 'error') {
      setSaving(false);
      setError(saveMessage || 'Failed to save strategy');
    } else if (saveStatus === 'success') {
      setSaving(false);
      setError('');
    }
  }, [saveStatus, saveMessage]);

  const handleSave = async () => {
    if (!strategyName.trim()) {
      setError('Please enter a strategy name');
      return;
    }

    if (isDuplicate) {
      setError('This name already exists. Please give a different name.');
      return;
    }

    setSaving(true);
    setError('');
    
    try {
      const name = strategyName.trim();
      await onSave(name);
      /*
        Filed only AFTER the save succeeded. Putting the name in a folder
        first would leave the folder pointing at a strategy that does not
        exist if the save then failed.
      */
      if (folderId) {
        await addToFolder(folderId, [name]).catch((err) => logger.error('[save] folder:', err));
      }
      setStrategyName('');
    } catch (error) {
      logger.error('Save error:', error);
      if (!saveMessage) {
        setError(error.message || 'Failed to save strategy');
      }
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Save Strategy</h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Strategy Name Input */}
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Strategy Name
          </label>
          <input
            type="text"
            value={strategyName}
            onChange={(e) => {
              setStrategyName(e.target.value);
              setError('');
            }}
            placeholder="e.g., My BTST Strategy"
            disabled={saving}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed transition ${
              isDuplicate
                ? 'border-red-400 focus:ring-red-400'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !saving && strategyName.trim() && !isDuplicate) {
                handleSave();
              }
            }}
          />
          {/* The warning, while typing. Red text under the field rather than a
              toast on submit: the name is right there to be corrected. */}
          {isDuplicate && (
            <p className="mt-2 text-sm text-red-600">
              This name already exists. Please give a different name.
            </p>
          )}
          {/*
            SELECT FOLDER — only when at least one folder exists.

            A native select, so its list is exactly as tall as the number of
            folders: the reference's custom dropdown leaves a tall empty box
            under two entries, which is the blank space to avoid.
          */}
          {folders.length > 0 ? (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Folder
              </label>
              <select
                value={folderId}
                disabled={saving}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 transition"
              >
                {/* Staying on "Select" saves it loose, which must stay possible. */}
                <option value="">Select</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          ) : null}

          {/* Inline Error Message */}
          {error && !saving ? (
            <p className="text-sm text-red-600 font-medium mt-2">
              {error}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-2">
              Give your strategy a memorable name to easily find it later
            </p>
          )}

          {/* Loading State */}
          {saving && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
              <Loader size={16} className="text-blue-600 animate-spin" />
              <p className="text-sm text-blue-700">
                {saveMessage || 'Saving strategy to server...'}
              </p>
            </div>
          )}

          {/* Success State */}
          {saveStatus === 'success' && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700 mb-1">Success!</p>
                <p className="text-sm text-green-600">{saveMessage || 'Strategy saved'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'success' ? 'Close' : 'Cancel'}
          </button>
          {saveStatus !== 'success' && (
            <button
              onClick={handleSave}
              disabled={saving || !strategyName.trim() || isDuplicate}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: colors.legBuilder.addLegBg }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
            >
              {saving ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>Save Strategy</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaveStrategyModal;
