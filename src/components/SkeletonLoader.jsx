import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

export const ReportCardSkeleton = () => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <Skeleton width={150} height={24} className="mb-2" />
          <Skeleton width={200} height={16} />
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <Skeleton width={80} height={16} />
          <Skeleton width={100} height={24} />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton width={80} height={16} />
          <Skeleton width={100} height={24} />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton width={80} height={16} />
          <Skeleton width={100} height={24} />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton width={80} height={16} />
          <Skeleton width={100} height={24} />
        </div>
      </div>

      <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
        <Skeleton width="100%" height={16} />
      </div>

      <div className="flex gap-2">
        <Skeleton width="33%" height={40} />
        <Skeleton width="33%" height={40} />
        <Skeleton width="33%" height={40} />
      </div>
    </div>
  );
};

export const StrategyCardSkeleton = () => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-3">
      <div className="flex items-center gap-3">
        <Skeleton width={40} height={40} circle />
        <div className="flex-1">
          <Skeleton width={150} height={20} className="mb-2" />
          <Skeleton width={100} height={14} />
        </div>
      </div>
    </div>
  );
};

export default { ReportCardSkeleton, StrategyCardSkeleton };
