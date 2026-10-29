import { useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

/**
 * Toast notification component
 * Shows success, error, or info messages with auto-dismiss
 */
const DEFAULT_DURATION = { success: 3000, info: 4000, error: 6000 };

const Toast = ({ message, type = 'success', onClose, duration }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const ms = duration ?? DEFAULT_DURATION[type] ?? DEFAULT_DURATION.success;

  useEffect(() => {
    if (!ms || ms <= 0) return undefined;
    const timer = setTimeout(() => onCloseRef.current?.(), ms);
    return () => clearTimeout(timer);
    // A NEW message restarts the clock; a re-render does not.
  }, [message, type, ms]);

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <XCircle size={20} className="shrink-0 mt-px" />;
      case 'info':
        return <AlertCircle size={20} className="shrink-0 mt-px" />;
      default:
        return <CheckCircle size={20} className="shrink-0 mt-px" />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'error':
        return 'bg-red-600';
      case 'info':
        return 'bg-blue-600';
      default:
        return 'bg-green-600';
    }
  };

  return (
    <div className="fixed top-6 right-6 z-[200] animate-toast-in">
      <div className={`flex items-start gap-3 pl-4 pr-3 py-3 rounded-lg shadow-lg text-white text-[14px] font-medium min-w-[280px] max-w-[440px] ${getBackgroundColor()}`}>
        {getIcon()}
        <p className="flex-1 leading-snug">{message}</p>
        <button
          onClick={onClose}
          className="shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-white/20 transition-colors"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default Toast;
