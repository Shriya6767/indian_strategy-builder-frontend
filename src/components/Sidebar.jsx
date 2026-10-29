import { useState } from 'react';
import { ChevronsLeft, ChevronRight, ChevronDown } from 'lucide-react';
import SavedStrategiesTree from './SavedStrategiesTree';

const Sidebar = ({ onToggleSidebar, onCreateNewStrategy,
  onOpenStrategy, onNotify, className = '' }) => {
  // The tree is closed until asked for: it reads folders from storage and
  // renders a row per strategy, which is work an unopened panel need not do.
  const [treeOpen, setTreeOpen] = useState(false);

  return (
    <div
      className={`${className} w-[192px] shrink-0 min-h-0 bg-[#f5f5f5] border-r shadow-2xl flex flex-col relative z-10`}
      style={{ borderColor: '#ececec', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      <button
        onClick={onToggleSidebar}
        className="absolute -right-3 top-9 w-7 h-7 rounded-full flex items-center justify-center z-20 text-gray-700 border transition-colors"
        style={{ backgroundColor: '#F5F5F5', borderColor: '#E7E7E7' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#0B619B';
          e.currentTarget.style.color = '#FFFFFF';
          e.currentTarget.style.borderColor = '#0B619B';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#F5F5F5';
          e.currentTarget.style.color = '';
          e.currentTarget.style.borderColor = '#E7E7E7';
        }}
        title="Collapse sidebar"
      >
        <ChevronsLeft size={14} />
      </button>

      <div className="border-b" style={{ borderColor: '#f3f3f3' }}>
        <p className="px-4 pt-7 pb-2 text-[14px]" style={{ color: '#3a3a3a' }}>Saved Strategies</p>
        <button
          type="button"
          onClick={() => setTreeOpen((was) => !was)}
          aria-expanded={treeOpen}
          className="w-full flex items-center gap-2 p-2.5 text-[14px] font-medium border-t transition-colors hover:bg-[#ececec] active:bg-[#e3e3e3]"
          style={{ borderColor: '#f3f3f3', color: '#3a3a3a' }}
        >
          {treeOpen
            ? <ChevronDown size={15} className="text-gray-500 shrink-0" />
            : <ChevronRight size={15} className="text-gray-500 shrink-0" />}
          <span>920Straddle</span>
        </button>
      </div>

      {/* The scrolling region: the heading and 920Straddle above stay put. */}
      {treeOpen ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
        <SavedStrategiesTree
          onOpenStrategy={onOpenStrategy}
          onNewStrategy={onCreateNewStrategy}
          onNotify={onNotify}
        />
        </div>
      ) : null}

    </div>
  );
};

export default Sidebar;
