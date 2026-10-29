import { useState, useEffect } from 'react';
import { FileText, Download, Trash2, Calendar, RefreshCw } from 'lucide-react';
import { ReportCardSkeleton } from './SkeletonLoader';
import Tooltip from './Tooltip';
import Breadcrumb from './Breadcrumb';
import { API_URL } from '../services/api';
import logger from '../utils/logger';

const Reports = ({ onSwitchToBuilder }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const formatIndianDateTime = (dateString) => {
    try {
      const date = new Date(dateString);
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      const formattedHours = String(hours).padStart(2, '0');
      
      return `${day}-${month}-${year} ${formattedHours}:${minutes} ${ampm}`;
    } catch (e) {
      return dateString;
    }
  };

  const formatPeriod = (periodString) => {
    try {
      if (!periodString || periodString === 'N/A') return 'N/A';
      
      const parts = periodString.split(' to ');
      if (parts.length !== 2) return periodString;
      
      const [startPart, endPart] = parts;
      
      const [startYear, startMonth] = startPart.split('-');
      const startDate = `01-${startMonth}-${startYear.slice(-2)}`;
      
      const [endYear, endMonth] = endPart.split('-');
      const lastDay = new Date(parseInt(endYear), parseInt(endMonth), 0).getDate();
      const endDate = `${String(lastDay).padStart(2, '0')}-${endMonth}-${endYear.slice(-2)}`;
      
      return `${startDate} to ${endDate}`;
    } catch (e) {
      return periodString;
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/reports/list`);
      const data = await response.json();
      
      
      if (data.status === 'success') {
        setReports(data.reports || []);
      } else {
        setError(data.error || 'Failed to load reports');
      }
    } catch (err) {
      setError('Failed to connect to backend');
      logger.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDownload = async (filename, format) => {
    try {
      const response = await fetch(`${API_URL}/reports/download?filename=${filename}&format=${format}`);
      
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Download failed');
      }
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const downloadFilename = filename.replace('.json', format === 'xlsx' ? '.xlsx' : '.csv');
      a.download = downloadFilename;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Download error:', error);
      alert(`Failed to download report:\n\n${error.message}`);
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/reports/delete?filename=${filename}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        fetchReports();
      } else {
        alert(data.error || 'Failed to delete report');
      }
    } catch (error) {
      logger.error('Delete error:', error);
      alert('Failed to delete report');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL ${reports.length} reports?\n\nThis action cannot be undone!`)) {
      return;
    }

    if (!window.confirm(`FINAL WARNING\n\nThis will permanently delete all ${reports.length} reports.\n\nClick OK to proceed.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/reports/delete-all`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        alert(`Successfully deleted ${data.deleted_count} reports`);
        fetchReports();
      } else {
        alert(data.error || 'Failed to delete reports');
      }
    } catch (error) {
      logger.error('Delete all error:', error);
      alert('Failed to delete reports');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Reports' }]} />
        
        {/* Header Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Reports Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-red-600">
          <p className="text-xl mb-2">Error Loading Reports</p>
          <p className="text-sm">{error}</p>
          <button 
            onClick={fetchReports}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500 max-w-md">
          <FileText size={64} className="mx-auto mb-4 text-gray-300" />
          <p className="text-xl mb-2 font-semibold">No Reports Yet</p>
          <p className="mb-4">Reports are automatically saved when you export backtest results.</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-4">
            <p className="text-sm text-blue-900 font-medium mb-2">How to save a report:</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Run a backtest in Strategy Builder</li>
              <li>View results in the Results tab</li>
              <li>Click "Export CSV" or "Export XLSX"</li>
              <li>Report automatically appears here</li>
            </ol>
          </div>
          <button 
            onClick={fetchReports}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: 'Reports' }]} />
      
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Saved Reports</h2>
            <p className="text-sm text-gray-500 mt-1">
              {reports.length} report{reports.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleDeleteAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 size={18} />
              Delete All
            </button>
            <button 
              onClick={fetchReports}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report, index) => (
          <div 
            key={index}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            {/* Report Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{(report.strategy_type || 'Backtest').toUpperCase()}</h3>
                <p className="text-xs text-gray-500">{formatIndianDateTime(report.timestamp)}</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 flex items-center">
                  Total P&L
                  <Tooltip id={`pnl-${index}`} content="Total profit/loss from all trades in this backtest" />
                </span>
                <span className={`text-lg font-bold ${report.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${report.total_pnl?.toLocaleString()}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 flex items-center">
                  Win Rate
                  <Tooltip id={`winrate-${index}`} content="Percentage of profitable trades out of total trades executed" />
                </span>
                <span className="text-lg font-bold text-blue-600">
                  {report.win_rate?.toFixed(1)}%
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 flex items-center">
                  Total Trades
                  <Tooltip id={`trades-${index}`} content="Total number of trades (legs) executed in this backtest" />
                </span>
                <span className="text-lg font-bold text-gray-900">
                  {report.total_trades}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 flex items-center">
                  ROI
                  {/* Reported by the backend on the saved report — the frontend
                      does not compute it, and there is no capital to base it on. */}
                  <Tooltip id={`roi-${index}`} content="Return on Investment, as reported by the backend for this backtest" />
                </span>
                <span className={`text-lg font-bold ${report.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {report.roi?.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Period */}
            <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar size={14} />
                <span><strong>Data Period:</strong> {formatPeriod(report.period)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleDownload(report.filename, 'csv')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                onClick={() => handleDownload(report.filename, 'xlsx')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm"
              >
                <Download size={16} />
                XLSX
              </button>
              <button
                onClick={() => handleDelete(report.filename)}
                className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Reports;
