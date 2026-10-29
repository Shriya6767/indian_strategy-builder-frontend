import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Folder, MoreVertical, ArrowLeft } from 'lucide-react';
import { FolderPlusIcon } from './NavIcons';
import { useSavedStrategies } from '../context/SavedStrategiesContext';
import {
  listFolders, createFolder, renameFolder, deleteFolder,
  addToFolder, removeFromFolder, forgetStrategy, foldedNames, normalise,
  subscribeFolders,
} from '../services/strategyFolders';
import { deleteStrategy } from '../services/strategyApi';
import { loadPortfolios, findAffected, impactMessage, applyCascade } from '../services/portfolioCascade';
import { usePortfolio } from '../context/PortfolioContext';
import { getLibrary, subscribeLibrary, refreshLibrary } from '../services/strategyLibrary';
import ConfirmDialog from './ConfirmDialog';
import {
  CreateFolderDialog, AddToFolderDialog, RenameFolderDialog,
} from './FolderDialogs';


const INK = '#3a3a3a';
const MUTED = '#9CA3AF';
const BLUE = '#0782DA';
const BORDER = '#f3f3f3';

/** A kebab and the menu it opens. Closes on outside click or Escape. */
const Kebab = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); setOpen((was) => !was); }}
        className="w-[22px] h-[22px] inline-flex items-center justify-center rounded transition-colors hover:bg-[#e3e3e3]"
        style={{ color: MUTED }}
      >
        <MoreVertical size={15} />
      </button>

      {open ? (
        <span
          className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-white rounded-md border py-1 shadow-lg block"
          style={{ borderColor: '#e5e5e5' }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.disabled ? item.disabledHint : undefined}
              onClick={() => { setOpen(false); item.onClick?.(); }}
              className="w-full text-left px-3 py-2 text-[13px] transition-colors hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
              style={{ color: item.danger ? '#C81E1E' : INK }}
            >
              {item.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
};

/** One row: a label, an optional leading icon, and a kebab. */
const Row = ({ icon: Icon, label, onClick, menu, menuLabel, indent = false }) => (
  <div className={`flex items-center gap-2 pr-1.5 border-b transition-colors hover:bg-[#ececec] ${indent ? 'pl-5' : 'pl-2.5'}`}
       style={{ borderColor: BORDER }}>
    <button type="button" onClick={onClick}
            className="flex-1 min-w-0 flex items-center gap-2 py-2.5 text-left text-[14px]"
            style={{ color: INK }}>
      {Icon ? <Icon size={15} className="shrink-0" style={{ color: MUTED }} /> : null}
      <span className="truncate">{label}</span>
    </button>
    {menu ? <Kebab items={menu} label={menuLabel} /> : null}
  </div>
);

const SavedStrategiesTree = ({ onOpenStrategy, onNewStrategy, onNotify }) => {
  const { strategies: cards, removeStrategy } = useSavedStrategies();
  const { refreshFromBackend } = usePortfolio();
  const [library, setLibrary] = useState(() => getLibrary());
  const [folders, setFolders] = useState([]);
  const [openFolder, setOpenFolder] = useState(null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listFolders().then(setFolders).catch(() => setFolders([]));
    return subscribeFolders(setFolders);
  }, []);

  useEffect(() => {
    refreshLibrary().then(setLibrary);
    return subscribeLibrary(setLibrary);
  }, []);

  const strategies = useMemo(() => {
    const rows = [];
    const seen = new Set();
    const add = (name, id, version) => {
      const key = normalise(name);
      if (!name || seen.has(key)) return;
      seen.add(key);
      rows.push({ name, id, version });
    };
    (library || []).forEach((r) => add(r.name, r.id, r.version));
    (cards || []).forEach((c) => add(c.name, c.id, c.version));
    return rows;
  }, [library, cards]);

  const allNames = useMemo(
    () => strategies.map((s) => s.name).filter(Boolean),
    [strategies],
  );

  /** Loose strategies: everything not claimed by a folder. */
  const loose = useMemo(() => {
    const inside = foldedNames(folders);
    return allNames.filter((n) => !inside.has(normalise(n)));
  }, [allNames, folders]);

  const match = (n) => {
    const q = query.trim().toLowerCase();
    return !q || n.toLowerCase().includes(q);
  };

  const current = openFolder ? folders.find((f) => f.id === openFolder) || null : null;
  if (openFolder && !current) setOpenFolder(null);

  const open = (name) => {
    const card = strategies.find((s) => normalise(s.name) === normalise(name));
    if (!card) { onNotify?.('That strategy could not be found.', 'error'); return; }
    // The real loader: GET /get-strategy, through the app's own path.
    onOpenStrategy?.(card.id, card.name, card.version);
  };
  const askDeleteStrategy = async (name) => {
    setDialog({ kind: 'deleteStrategy', name, impact: null, checking: true });
    const card = strategies.find((s) => normalise(s.name) === normalise(name));
    const portfolios = await loadPortfolios();
    const affected = portfolios ? findAffected(portfolios, { id: card?.id, name }) : null;
    setDialog({
      kind: 'deleteStrategy',
      name,
      affected,
      impact: affected
        ? impactMessage(affected, name)
        : 'Its portfolios could not be checked, so any portfolio using it may need fixing by hand.',
      checking: false,
    });
  };

  /* ── Strategy delete: the strategy FIRST, then its portfolios ───────── */
  const doDeleteStrategy = (name, affected) => {
    const card = strategies.find((s) => normalise(s.name) === normalise(name));
    setBusy(true);
    deleteStrategy(card?.id, name)
      .then(async () => {
        // Only now are the portfolios touched. A failed delete above leaves
        // every one of them exactly as it was.
        let failed = [];
        if (affected && affected.length > 0) {
          const result = await applyCascade(affected);
          failed = result.failed;
          await refreshFromBackend?.().catch(() => {});
        }

        await forgetStrategy(name).then(setFolders).catch(() => {});
        removeStrategy({ id: card?.id, name });
        setDialog(null);
        onNotify?.(`${name} deleted successfully`, 'success');
        if (failed.length > 0) {
          onNotify?.(
            `${failed.join(', ')} could not be updated and may still list ${name}.`,
            'error',
          );
        }
      })
      .catch((err) => onNotify?.(err.message || 'Could not delete the strategy.', 'error'))
      .finally(() => setBusy(false));
  };

  const doDeleteFolder = (folder) => {
    setBusy(true);
    const names = [...folder.strategyNames];
    Promise.allSettled(names.map((n) => {
      const card = strategies.find((s) => normalise(s.name) === normalise(n));
      return deleteStrategy(card?.id, n).then(() => removeStrategy({ id: card?.id, name: n }));
    }))
      .then(async (results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          onNotify?.(`${failed} strateg${failed === 1 ? 'y' : 'ies'} could not be deleted — the folder was kept.`, 'error');
          return;
        }
        await deleteFolder(folder.id).then(setFolders);
        setOpenFolder(null);
        onNotify?.(`${folder.name} deleted successfully`, 'success');
      })
      .finally(() => { setBusy(false); setDialog(null); });
  };

  const guard = (promise, done) => promise
    .then((next) => { setFolders(next); done?.(); })
    .catch((err) => onNotify?.(err.message, 'error'));

  return (
    <div className="border-b" style={{ borderColor: BORDER }}>
      {/* ── Header strip: new strategy + create folder ──────────────── */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-b" style={{ borderColor: BORDER }}>
        <button type="button" onClick={onNewStrategy}
                className="flex-1 text-left text-[14px] font-medium"
                style={{ color: BLUE }}>
          + New Strategy
        </button>
        <button type="button"
                onClick={() => setDialog({ kind: 'create' })}
                title="Create a folder"
                aria-label="Create a folder"
                className="h-[20px] w-[49px] inline-flex items-center justify-center border-l transition-opacity hover:opacity-70"
                style={{ borderColor: '#e5e7eb', color: BLUE }}>
          <FolderPlusIcon size={20} />
        </button>
      </div>

      <div className="px-2.5 py-2">
        <span className="relative block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
          <input
            type="text"
            value={query}
            placeholder="Search Strategies"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-[30px] pl-8 pr-2 text-[13px] rounded border bg-white outline-none focus:border-[#0782DA]"
            style={{ borderColor: '#e5e5e5', color: INK }}
          />
        </span>
      </div>

      {current ? (
        /* ── Inside a folder ──────────────────────────────────────── */
        <>
          <div className="flex items-center gap-2 pl-2.5 pr-1.5 border-y" style={{ borderColor: BORDER }}>
            <button type="button" onClick={() => setOpenFolder(null)}
                    aria-label="Back to all strategies"
                    className="shrink-0" style={{ color: MUTED }}>
              <ArrowLeft size={15} />
            </button>
            <span className="flex-1 min-w-0 flex items-center gap-2 py-2.5 text-[14px]" style={{ color: INK }}>
              <Folder size={15} className="shrink-0" style={{ color: MUTED }} />
              <span className="truncate">{current.name}</span>
            </span>
            <Kebab
              label={`${current.name} menu`}
              items={[
                { label: 'Add strategy to folder', onClick: () => setDialog({ kind: 'add', folder: current }) },
                { label: 'Rename', onClick: () => setDialog({ kind: 'rename', folder: current }) },
                { label: 'Delete Folder', danger: true, onClick: () => setDialog({ kind: 'deleteFolder', folder: current }) },
              ]}
            />
          </div>

          {current.strategyNames.filter(match).map((n) => (
            <Row key={n} label={n} indent onClick={() => open(n)}
                 menuLabel={`${n} menu`}
                 menu={[
                   {
                     label: 'Remove from folder',
                     onClick: () => guard(
                       removeFromFolder(current.id, n),
                       () => onNotify?.(`${n} removed from ${current.name}`, 'success'),
                     ),
                   },
                   { label: 'Delete', danger: true, onClick: () => askDeleteStrategy(n) },
                 ]} />
          ))}
          {current.strategyNames.filter(match).length === 0 ? (
            <p className="px-3 py-3 text-[12px]" style={{ color: MUTED }}>No strategies in this folder</p>
          ) : null}
        </>
      ) : (
        /* ── Root: folders, then loose strategies ─────────────────── */
        <>
          <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-center"
             style={{ color: MUTED }}>
            MY STRATEGIES
          </p>

          {folders.filter((f) => match(f.name)).map((f) => (
            <Row key={f.id} icon={Folder} label={f.name}
                 onClick={() => setOpenFolder(f.id)}
                 menuLabel={`${f.name} menu`}
                 menu={[
                   { label: 'Add strategy to folder', onClick: () => setDialog({ kind: 'add', folder: f }) },
                   { label: 'Rename', onClick: () => setDialog({ kind: 'rename', folder: f }) },
                   { label: 'Delete Folder', danger: true, onClick: () => setDialog({ kind: 'deleteFolder', folder: f }) },
                 ]} />
          ))}

          {loose.filter(match).map((n) => (
            <Row key={n} label={n} onClick={() => open(n)}
                 menuLabel={`${n} menu`}
                 menu={[
                   {
                     label: 'Add to folder',
                     // Nothing to add it TO until a folder exists -- greyed,
                     // with the reason on hover, rather than hidden.
                     disabled: folders.length === 0,
                     disabledHint: 'Create a folder first',
                     onClick: () => setDialog({ kind: 'addOne', name: n }),
                   },
                   { label: 'Delete', danger: true, onClick: () => askDeleteStrategy(n) },
                 ]} />
          ))}

          {folders.length === 0 && loose.filter(match).length === 0 ? (
            <p className="px-3 py-3 text-[12px]" style={{ color: MUTED }}>No saved strategies</p>
          ) : null}
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      {dialog?.kind === 'create' ? (
        <CreateFolderDialog
          names={allNames}
          onClose={() => setDialog(null)}
          onCreate={(name, picked, setError) => {
            createFolder(name, picked)
              .then((next) => {
                setFolders(next);
                setDialog(null);
                onNotify?.(`${name.trim()} created successfully`, 'success');
              })
              .catch((err) => {
                // "Please give the name" is a toast (it is about the action);
                // "Name already exists" belongs under the field.
                if (err.message === 'Name already exists') setError(err.message);
                else onNotify?.(err.message, 'error');
              });
          }}
        />
      ) : null}

      {dialog?.kind === 'add' ? (
        <AddToFolderDialog
          folderName={dialog.folder.name}
          names={allNames.filter((n) => !dialog.folder.strategyNames.some((x) => normalise(x) === normalise(n)))}
          onClose={() => setDialog(null)}
          onUpdate={(picked) => guard(
            addToFolder(dialog.folder.id, picked),
            () => {
              setDialog(null);
              onNotify?.(`Added to ${dialog.folder.name}`, 'success');
            },
          )}
        />
      ) : null}

      {dialog?.kind === 'addOne' ? (
        <AddToFolderDialog
          folderName="a folder"
          names={folders.map((f) => f.name)}
          onClose={() => setDialog(null)}
          onUpdate={(pickedFolders) => {
            const target = folders.find((f) => f.name === pickedFolders[0]);
            if (!target) { setDialog(null); return; }
            guard(addToFolder(target.id, [dialog.name]), () => {
              setDialog(null);
              onNotify?.(`${dialog.name} added to ${target.name}`, 'success');
            });
          }}
        />
      ) : null}

      {dialog?.kind === 'rename' ? (
        <RenameFolderDialog
          current={dialog.folder.name}
          onClose={() => setDialog(null)}
          onRename={(name, setError) => {
            renameFolder(dialog.folder.id, name)
              .then((next) => {
                setFolders(next);
                setDialog(null);
                onNotify?.('Folder renamed successfully', 'success');
              })
              .catch((err) => {
                if (err.message === 'Name already exists') setError(err.message);
                else onNotify?.(err.message, 'error');
              });
          }}
        />
      ) : null}

      <ConfirmDialog
        isOpen={dialog?.kind === 'deleteFolder'}
        title={`Delete ${dialog?.folder?.name || ''}?`}
        message="This will permanently delete the folder & all strategies inside. You will not be able to access them in the future."
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => { if (!busy) setDialog(null); }}
        onConfirm={() => doDeleteFolder(dialog.folder)}
      />

      <ConfirmDialog
        isOpen={dialog?.kind === 'deleteStrategy'}
        title={`Are you sure you want to delete ${dialog?.name || ''} strategy?`}
        message={[
          'You will not have access to this strategy anymore.',
          dialog?.checking ? 'Checking its portfolios…' : dialog?.impact,
        ].filter(Boolean).join(' ')}
        confirmLabel="Delete"
        busy={busy || Boolean(dialog?.checking)}
        onCancel={() => { if (!busy) setDialog(null); }}
        onConfirm={() => doDeleteStrategy(dialog.name, dialog.affected)}
      />
    </div>
  );
};

export default SavedStrategiesTree;
