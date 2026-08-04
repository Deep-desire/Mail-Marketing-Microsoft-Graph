import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  Eye,
  X,
  Mail,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadApi } from '../api/upload.api';
import { Contact } from '../types';
import StatusBadge from '../components/StatusBadge';

type LogItem = Contact & {
  upload: {
    originalName: string;
    fileName: string;
    template: {
      name: string;
      subject: string;
      htmlBody: string;
      plainTextBody: string;
    } | null;
  };
};

export default function DeliveryLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = useMemo(() => {
    const s = searchParams.get('status');
    if (s && ['sent', 'failed', 'pending', 'skipped'].includes(s)) {
      return s as any;
    }
    return 'all';
  }, [searchParams]);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'sent' | 'failed' | 'pending' | 'skipped'>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Detail Modal States
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [iframeHeight, setIframeHeight] = useState('400px');

  const handleStatusChange = (newStatus: typeof status) => {
    setStatus(newStatus);
    if (newStatus === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ status: newStatus });
    }
  };

  const fetchLogs = useCallback(async (
    targetPage: number,
    currentStatus: typeof status,
    currentSearch: string,
    date?: string
  ) => {
    setLoading(true);
    try {
      const res = await uploadApi.getDeliveryLogs({
        page: targetPage,
        limit,
        status: currentStatus,
        search: currentSearch || undefined,
        startDate: date || undefined,
        endDate: date || undefined,
      });
      setLogs(res.data.logs as LogItem[]);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch delivery logs');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLogs(1, status, debouncedSearch, selectedDate);
  }, [status, debouncedSearch, selectedDate, fetchLogs]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setDebouncedSearch(search);
    }
  };

  const handleRefresh = () => {
    fetchLogs(page, status, debouncedSearch, selectedDate);
    toast.success('Logs refreshed');
  };

  const handleClearDateFilter = () => {
    setSelectedDate('');
  };

  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleViewClick = (log: LogItem) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    const updateHeight = () => {
      if (iframe.contentWindow && iframe.contentDocument) {
        const body = iframe.contentDocument.body;
        const html = iframe.contentDocument.documentElement;
        const height = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        );
        setIframeHeight(`${Math.min(height, 500)}px`);
      }
    };

    updateHeight();
    setTimeout(updateHeight, 200);
  };

  // Compile subject and html template on the fly for the preview
  const compiledEmail = useMemo(() => {
    if (!selectedLog || !selectedLog.upload.template) return null;

    const template = selectedLog.upload.template;
    const name = selectedLog.name;
    const email = selectedLog.email;
    const unsubscribeLink = `${window.location.origin}/unsubscribe/preview-token`;

    const replaceVars = (text: string) => {
      return text
        .replace(/\{\{\s*name\s*\}\}/g, name)
        .replace(/\{\{\s*email\s*\}\}/g, email)
        .replace(/\{\{\s*unsubscribeLink\s*\}\}/g, unsubscribeLink);
    };

    return {
      subject: replaceVars(template.subject),
      html: replaceVars(template.htmlBody),
    };
  }, [selectedLog]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Delivery Logs</h1>
          <p className="text-gray-500 mt-1">Track and review sent or failed marketing emails.</p>
        </div>
        <button
          onClick={handleRefresh}
          className="btn-secondary self-start md:self-auto flex items-center gap-2 text-sm py-2 px-4"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'ALL LOGS', icon: Mail },
            { id: 'sent', label: 'SENT', icon: CheckCircle2 },
            { id: 'failed', label: 'FAILED', icon: AlertTriangle },
            { id: 'pending', label: 'PENDING', icon: Clock },
            { id: 'skipped', label: 'SKIPPED', icon: Ban },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = status === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleStatusChange(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 border ${isActive
                    ? 'bg-brand-600/20 text-brand-400 border-brand-500/20 shadow-md shadow-brand-500/5'
                    : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative max-w-sm w-full">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="input-field pr-10 text-sm py-2"
          />
          <button
            onClick={() => setDebouncedSearch(search)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-white/[0.01]">
                <th className="px-6 py-4">Recipient</th>
                <th className="px-6 py-4">Campaign File</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 relative">
                  <div className="flex items-center gap-1.5">
                    {/* Hidden native input to show calendar picker directly */}
                    <input
                      type="date"
                      ref={dateInputRef}
                      value={selectedDate}
                      max={getTodayDateString()}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="absolute opacity-0 pointer-events-none w-0 h-0 [color-scheme:dark]"
                      style={{ colorScheme: 'dark' }}
                    />

                    <button
                      type="button"
                      onClick={() => dateInputRef.current?.showPicker()}
                      className={`flex items-center gap-1.5 uppercase font-semibold text-xs text-left transition-colors ${
                        selectedDate
                          ? 'text-brand-400 hover:text-brand-300'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <span>Sent / Attempted At</span>
                      <Calendar className={`w-3.5 h-3.5 ${
                        selectedDate
                          ? 'text-brand-400 fill-brand-400/10'
                          : 'text-gray-500'
                      }`} />
                    </button>

                    {selectedDate && (
                      <div className="flex items-center gap-1 text-[10px] bg-brand-500/10 border border-brand-500/20 text-brand-400 px-2 py-0.5 rounded-lg">
                        <span>{new Date(selectedDate).toLocaleDateString()}</span>
                        <button
                          type="button"
                          onClick={handleClearDateFilter}
                          className="hover:text-red-400 transition-colors ml-0.5"
                          title="Clear Date Filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
                <th className="px-6 py-4">Error Details</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-gray-300">
              {loading ? (
                // Loading Skeleton Rows
                [...Array(limit)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-4 bg-white/10 rounded w-32 mb-2" />
                      <div className="h-3 bg-white/5 rounded w-44" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-white/10 rounded w-24" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 bg-white/10 rounded w-16" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-white/10 rounded w-36" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-white/5 rounded w-48" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-8 bg-white/10 rounded w-16 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-base font-medium">No logs matching your criteria found</p>
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`transition-colors hover:bg-white/[0.03] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''
                      }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{log.name}</div>
                      <div className="text-xs text-gray-500">{log.email}</div>
                    </td>
                    <td className="px-6 py-4 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-brand-400 shrink-0" />
                      <span className="truncate max-w-[150px]" title={log.upload.originalName}>
                        {log.upload.originalName}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={log.deliveryStatus} />
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {log.sentAt ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(log.sentAt).toLocaleString()}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {log.deliveryError ? (
                        <span className="text-red-400 text-xs font-mono block max-w-[200px] truncate" title={log.deliveryError}>
                          {log.deliveryError}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewClick(log)}
                        className="btn-secondary py-1 px-3 text-xs inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} logs
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs(page - 1, status, debouncedSearch, selectedDate)}
                disabled={page === 1}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 px-3">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => fetchLogs(page + 1, status, debouncedSearch, selectedDate)}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Email Detail View Modal */}
      {isModalOpen && selectedLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-white/10 flex flex-col max-h-[90vh]">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-brand-400" />
                Delivery Log Details
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Campaign File: <span className="font-semibold text-white">{selectedLog.upload.originalName}</span>
              </p>
            </div>

            {/* Error Message banner if failed */}
            {selectedLog.deliveryStatus === 'failed' && selectedLog.deliveryError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs flex gap-3 items-start">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-1">Sending Error Log:</span>
                  <span className="font-mono block break-all">{selectedLog.deliveryError}</span>
                </div>
              </div>
            )}

            {/* Email client container mock */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950 flex flex-col flex-1 min-h-[350px]">
              {/* Email Client Header */}
              <div className="bg-white/5 p-4 border-b border-white/10 space-y-2 text-xs text-gray-300">
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">Subject:</span>
                  <span className="text-white font-medium text-sm">
                    {compiledEmail?.subject || '—'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <span className="text-gray-500 font-semibold inline-block w-16">Recipient:</span>
                    <span className="text-white font-medium">{selectedLog.name}</span>
                    <span className="text-gray-400 ml-1.5">&lt;{selectedLog.email}&gt;</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-semibold inline-block w-16">Status:</span>
                    <span className="inline-block scale-90 origin-left">
                      <StatusBadge status={selectedLog.deliveryStatus} />
                    </span>
                  </div>
                </div>
                {selectedLog.sentAt && (
                  <div>
                    <span className="text-gray-500 font-semibold inline-block w-16">Time:</span>
                    <span>{new Date(selectedLog.sentAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Email Content Frame */}
              <div className="flex-1 bg-slate-900/50 overflow-y-auto p-4 md:p-6 flex justify-center">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-[650px] overflow-hidden self-start">
                  {selectedLog.upload.template && compiledEmail ? (
                    <iframe
                      title="Compiled Html Template Body Preview"
                      onLoad={handleIframeLoad}
                      style={{ height: iframeHeight }}
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <meta charset="utf-8">
                            <style>
                              body {
                                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                                color: #1e293b;
                                line-height: 1.6;
                                background-color: #ffffff;
                                margin: 0;
                                padding: 20px;
                              }
                              ::-webkit-scrollbar {
                                width: 6px;
                                height: 6px;
                              }
                              ::-webkit-scrollbar-track {
                                background: #f1f5f9;
                              }
                              ::-webkit-scrollbar-thumb {
                                background: #cbd5e1;
                                border-radius: 3px;
                              }
                            </style>
                          </head>
                          <body>
                            ${compiledEmail.html}
                          </body>
                        </html>
                      `}
                      className="w-full border-0 block"
                    />
                  ) : (
                    <div className="p-12 text-center text-gray-500 bg-white">
                      <Mail className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No template email content available (Sent in PlainText or Template Deleted)</p>
                      {selectedLog.upload.template?.plainTextBody && (
                        <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-lg text-left text-xs font-mono text-gray-700 whitespace-pre-wrap">
                          {selectedLog.upload.template.plainTextBody}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="btn-secondary text-sm py-2 px-6"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
