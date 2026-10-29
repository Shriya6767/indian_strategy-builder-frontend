import { Tooltip as ReactTooltip } from 'react-tooltip';
import { HelpCircle } from 'lucide-react';
import { colors } from '../theme/colors';

const Tooltip = ({ id, content, children, place = "top" }) => {
  return (
    <>
      <span data-tooltip-id={id} data-tooltip-content={content}>
        {children || <HelpCircle size={16} className="text-gray-400 hover:text-gray-600 cursor-help inline-block ml-1" />}
      </span>
      <ReactTooltip 
        id={id} 
        place={place}
        className="max-w-xs z-50"
        style={{
          backgroundColor: colors.tooltip.background,
          color: colors.tooltip.text,
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '13px',
          lineHeight: '1.4',
          boxShadow: colors.tooltip.shadow
        }}
      />
    </>
  );
};

export default Tooltip;
