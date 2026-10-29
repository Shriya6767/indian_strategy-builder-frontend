import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * heightClass: overrides the size preset's height (the Leg Builder row pins its
 * whole row to one height); everything else follows `size`.
 * size: 'sm' (default) matches the h-8 square-cornered controls inside a leg
 * card; 'md' matches the h-10 rounded controls used by the Leg Builder row and
 * the Lazy / Sequential leg modals, so the trigger lines up with the selects
 * and inputs beside it.
 */
const StrikeSelector = ({ value, onChange, size = 'sm', heightClass }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const strikeOptions = [
    'ITM-20', 'ITM-19', 'ITM-18', 'ITM-17', 'ITM-16',
    'ITM-15', 'ITM-14', 'ITM-13', 'ITM-12', 'ITM-11',
    'ITM-10', 'ITM-9', 'ITM-8', 'ITM-7', 'ITM-6',
    'ITM-5', 'ITM-4', 'ITM-3', 'ITM-2', 'ITM-1',
    'ATM',
    'OTM-1', 'OTM-2', 'OTM-3', 'OTM-4', 'OTM-5',
    'OTM-6', 'OTM-7', 'OTM-8', 'OTM-9', 'OTM-10',
    'OTM-11', 'OTM-12', 'OTM-13', 'OTM-14', 'OTM-15',
    'OTM-16', 'OTM-17', 'OTM-18', 'OTM-19', 'OTM-20'
  ];

  const displayValue = value ? value.toUpperCase().replace('_', '-') : 'ATM';

  const handleSelect = (option) => {
    const optionValue = option.toLowerCase().replace('-', '_');
    onChange(optionValue);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    const active = list?.querySelector('[data-active="true"]');
    if (!list || !active) return;
    // Rect-based so it does not depend on which ancestor is the offsetParent.
    const delta = active.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += delta - (list.clientHeight - active.offsetHeight) / 2;
  }, [isOpen]);

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 bg-white font-normal outline-none transition-all w-full flex items-center justify-between ${
          heightClass
            ? `${heightClass} text-[13px] rounded-md border border-[#e3e3e3]`
            : size === 'md'
              ? 'h-10 text-[14px] rounded-md border border-[#e3e3e3]'
              : 'h-[34px] text-[12px] rounded border border-[#d4d4d4]'
        }`}
      >
        <span>{displayValue}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Inline Dropdown */}
      {isOpen && (
        <div ref={listRef} className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {strikeOptions.map((option) => {
            const optionValue = option.toLowerCase().replace('-', '_');
            const isSelected = value === optionValue;

            return (
              <button
                key={option}
                data-active={isSelected ? 'true' : undefined}
                onClick={() => handleSelect(option)}
                className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {option}
                {isSelected && (
                  <span className="float-right">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StrikeSelector;
