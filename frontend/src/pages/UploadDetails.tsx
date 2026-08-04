import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Send,
  XCircle,
  Clock,
  Ban,
  Play,
  Mail,
  X,
  ChevronDown,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import toast from 'react-hot-toast';
import ReportTable from '../components/ReportTable';
import StatusBadge from '../components/StatusBadge';
import StatsCard from '../components/StatsCard';
import { uploadApi } from '../api/upload.api';
import { templateApi } from '../api/template.api';
import { Upload, Contact, Template } from '../types';

const columnHelper = createColumnHelper<Contact>();

export default function UploadDetails() {
  const { id } = useParams<{ id: string }>();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Send Modal States
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [iframeHeight, setIframeHeight] = useState('400px');
  const [sendType, setSendType] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledAt, setScheduledAt] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    date.setMinutes(0);
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  });

  // Edit Contact States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [updatingContact, setUpdatingContact] = useState(false);

  // Delete Contact States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail Modal States
  const [selectedLog, setSelectedLog] = useState<Contact | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed' | 'pending' | 'skipped'>('all');

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleViewLogClick = (contact: Contact) => {
    setSelectedLog(contact);
    setIsLogModalOpen(true);
  };

  const filteredContacts = useMemo(() => {
    if (statusFilter === 'all') return contacts;
    return contacts.filter((c) => c.deliveryStatus === statusFilter);
  }, [contacts, statusFilter]);

  // Compile subject and html template on the fly for the preview
  const compiledEmail = useMemo(() => {
    if (!selectedLog || !upload?.template) return null;

    const template = upload.template;
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
  }, [selectedLog, upload?.template]);

  const handleEditClick = (contact: Contact) => {
    setEditingContact(contact);
    setEditName(contact.name);
    setEditEmail(contact.email);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (contact: Contact) => {
    setDeletingContact(contact);
    setIsDeleteModalOpen(true);
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error('Name and Email are required');
      return;
    }
    setUpdatingContact(true);
    try {
      await uploadApi.updateContact(editingContact.id, {
        name: editName.trim(),
        email: editEmail.trim(),
      });
      toast.success('Contact updated successfully');
      setIsEditModalOpen(false);
      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update contact');
    } finally {
      setUpdatingContact(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deletingContact) return;
    setDeleting(true);
    try {
      await uploadApi.deleteContact(deletingContact.id);
      toast.success('Contact deleted successfully');
      setIsDeleteModalOpen(false);
      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete contact');
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (info) => <span className="font-medium text-white">{info.getValue()}</span>,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('status', {
      header: 'Validation',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor('deliveryStatus', {
      header: 'Delivery Status',
      cell: (info) => {
        const val = info.getValue();
        return val ? <StatusBadge status={val} /> : <span className="text-gray-600">—</span>;
      },
    }),
    columnHelper.accessor('sentAt', {
      header: 'Sent At',
      cell: (info) => {
        const val = info.getValue();
        return val ? new Date(val).toLocaleString() : '—';
      },
    }),
    columnHelper.accessor('deliveryError', {
      header: 'Delivery Error',
      cell: (info) => (
        <span className="text-red-400 text-xs max-w-[200px] truncate block">
          {info.getValue() || '—'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const contact = info.row.original;
        const isProcessing = upload?.status === 'processing';
        return (
          <div className="flex items-center gap-2">
            {contact.deliveryStatus !== 'idle' && (
              <button
                onClick={() => handleViewLogClick(contact)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 hover:text-brand-400 transition-colors text-gray-400"
                title="View Sent/Failed Email"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleEditClick(contact)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 hover:text-brand-400 transition-colors text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={isProcessing}
              title={isProcessing ? "Disabled while sending" : "Edit Contact"}
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteClick(contact)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={isProcessing}
              title={isProcessing ? "Disabled while sending" : "Delete Contact"}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    }),
  ], [upload?.status]);

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
        setIframeHeight(`${height}px`);
      }
    };

    updateHeight();
    setTimeout(updateHeight, 200);
    setTimeout(updateHeight, 1000);
  };

  const fetchDetails = () => {
    if (!id) return;
    Promise.all([
      uploadApi.getOne(id),
      uploadApi.getContacts(id, 1, 500),
    ])
      .then(([uploadRes, contactsRes]) => {
        setUpload(uploadRes.data);
        setContacts(contactsRes.data.contacts);
      })
      .catch((err) => {
        toast.error('Failed to load details');
      });
  };

  useEffect(() => {
    if (!id) return;

    // Initial fetch
    Promise.all([
      uploadApi.getOne(id),
      uploadApi.getContacts(id, 1, 500),
    ])
      .then(([uploadRes, contactsRes]) => {
        setUpload(uploadRes.data);
        setContacts(contactsRes.data.contacts);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;

    // While processing: poll both stats and contacts list every 3s so live status reflects immediately
    const interval = setInterval(async () => {
      if (upload?.status !== 'processing') return;
      try {
        const [statsRes, contactsRes] = await Promise.all([
          uploadApi.getStats(id),
          uploadApi.getContacts(id, 1, 500),
        ]);
        const stats = statsRes.data;
        setUpload((prev) =>
          prev ? { ...prev, ...stats, status: stats.status as Upload['status'] } : prev
        );
        if (contactsRes.data?.contacts) {
          setContacts(contactsRes.data.contacts);
        }
        if (stats.status === 'completed' || stats.status === 'failed') {
          fetchDetails();
        }
      } catch (_err) {
        // silently ignore transient poll errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [id, upload?.status]);

  const handleOpenSendModal = async () => {
    try {
      const res = await templateApi.getAll();
      setTemplates(res.data);
      if (res.data.length > 0) {
        setSelectedTemplateId(res.data[0].id);
      }
      setIsDropdownOpen(false);
      setIsSendModalOpen(true);
    } catch {
      toast.error('Failed to load templates');
    }
  };

  const handleOpenEditScheduleModal = async () => {
    try {
      const res = await templateApi.getAll();
      setTemplates(res.data);
      if (upload?.templateId) {
        setSelectedTemplateId(upload.templateId);
      } else if (res.data.length > 0) {
        setSelectedTemplateId(res.data[0].id);
      }
      if (upload?.scheduledAt) {
        const date = new Date(upload.scheduledAt);
        const tzOffset = date.getTimezoneOffset() * 60000;
        setScheduledAt(new Date(date.getTime() - tzOffset).toISOString().slice(0, 16));
      }
      setSendType('scheduled');
      setIsEditingSchedule(true);
      setIsDropdownOpen(false);
      setIsSendModalOpen(true);
    } catch {
      toast.error('Failed to load templates');
    }
  };

  const handleStartSend = async () => {
    if (!id || !selectedTemplateId) return;

    if (sendType === 'scheduled') {
      if (!scheduledAt) {
        toast.error('Please select a scheduled date and time');
        return;
      }
      const schedDate = new Date(scheduledAt);
      if (schedDate <= new Date()) {
        toast.error('Scheduled time must be in the future');
        return;
      }

      setSending(true);
      try {
        await uploadApi.scheduleSend(id, {
          templateId: selectedTemplateId,
          scheduledAt: schedDate.toISOString(),
        });
        toast.success(isEditingSchedule ? 'Campaign schedule updated successfully!' : 'Campaign scheduled successfully!');
        setIsSendModalOpen(false);
        setIsEditingSchedule(false);
        fetchDetails();
      } catch (err: any) {
        toast.error(err.response?.data?.message || (isEditingSchedule ? 'Failed to update campaign schedule' : 'Failed to schedule campaign'));
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    try {
      const response = await uploadApi.startSend(id, selectedTemplateId);
      const { queuedContacts } = response.data;

      setIsSendModalOpen(false);

      if (queuedContacts && queuedContacts.length > 0) {
        toast.success('Campaign started in the background! Emails are being processed.');
        if (upload) {
          setUpload({ ...upload, status: 'processing' });
        }
      } else {
        await uploadApi.finalizeSend(id);
        toast.success('Campaign finalized (all contacts skipped or unsubscribed).');
      }

      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to initiate send');
      fetchDetails();
    } finally {
      setSending(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!id) return;
    setSending(true);
    try {
      await uploadApi.unscheduleSend(id);
      toast.success('Campaign schedule cancelled');
      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to cancel schedule');
    } finally {
      setSending(false);
    }
  };

  const getMinDateTimeString = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzOffset).toISOString().slice(0, 16);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!upload) {
    return <div className="text-gray-500">Upload not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/uploads" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="page-title">Upload Details</h1>
            <p className="text-gray-500 text-sm mt-1">
              File: {upload.originalName} {upload.template && `• Active Template: ${upload.template.name}`}
            </p>
          </div>
        </div>

        <div>
          {upload.status === 'idle' && (
            <button
              onClick={handleOpenSendModal}
              className="btn-primary flex items-center gap-2 text-sm font-medium"
            >
              <Play className="w-4 h-4" />
              Send / Schedule Campaign
            </button>
          )}
        </div>
      </div>

      {/* Scheduled indicator */}
      {upload.status === 'scheduled' && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Campaign Scheduled</p>
              <p className="text-sm text-purple-300 mt-1">
                This email campaign is scheduled to start automatically on{' '}
                <span className="font-semibold text-white">
                  {new Date(upload.scheduledAt!).toLocaleDateString()}{' '}
                  {new Date(upload.scheduledAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>.
              </p>
              {upload.template && (
                <p className="text-xs text-purple-400/80 mt-1">
                  Template: <span className="font-medium text-purple-300">{upload.template.name}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={handleOpenEditScheduleModal}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_0_12px_rgba(168,85,247,0.3)]"
              disabled={sending}
            >
              Edit Schedule
            </button>
            <button
              onClick={handleCancelSchedule}
              className="px-4 py-2 border border-red-500/30 hover:border-red-500 hover:bg-red-500/10 text-red-400 rounded-xl text-sm font-semibold transition-all"
              disabled={sending}
            >
              Cancel Schedule
            </button>
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {upload.status === 'processing' && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <p className="text-sm text-blue-400 font-medium">
            Sending emails in progress...
          </p>
        </div>
      )}

      {/* File Stats Summary */}
      <div className="space-y-2">
        <h2 className="section-title text-sm text-gray-400">Excel Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <InfoCard label="Total Rows" value={upload.totalRows} />
          <InfoCard label="Valid" value={upload.validEmails} color="text-emerald-400" />
          <InfoCard label="Invalid" value={upload.invalidEmails} color="text-red-400" />
          <InfoCard label="Duplicates" value={upload.duplicateEmails} color="text-amber-400" />
          <InfoCard label="Unsubscribed" value={upload.unsubscribedEmails} color="text-gray-400" />
        </div>
      </div>

      {/* Delivery Progress Stats */}
      {upload.status !== 'idle' && (
        <div className="space-y-2">
          <h2 className="section-title text-sm text-gray-400">Delivery Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatsCard
              title="Total Recipients"
              value={upload.totalCount}
              icon={<Mail className="w-5 h-5" />}
              color="indigo"
              onClick={() => setStatusFilter('all')}
              isActive={statusFilter === 'all'}
            />
            <StatsCard
              title="Sent"
              value={upload.sentCount}
              icon={<Send className="w-5 h-5" />}
              color="emerald"
              onClick={() => setStatusFilter('sent')}
              isActive={statusFilter === 'sent'}
            />
            <StatsCard
              title="Failed"
              value={upload.failedCount}
              icon={<XCircle className="w-5 h-5" />}
              color="rose"
              onClick={() => setStatusFilter('failed')}
              isActive={statusFilter === 'failed'}
            />
            <StatsCard
              title="Pending"
              value={upload.pendingCount}
              icon={<Clock className="w-5 h-5" />}
              color="amber"
              onClick={() => setStatusFilter('pending')}
              isActive={statusFilter === 'pending'}
            />
            <StatsCard
              title="Skipped"
              value={upload.skippedCount}
              icon={<Ban className="w-5 h-5" />}
              color="indigo"
              onClick={() => setStatusFilter('skipped')}
              isActive={statusFilter === 'skipped'}
            />
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Contacts List</h2>
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 underline"
            >
              Clear filter ({statusFilter.toUpperCase()})
            </button>
          )}
        </div>
        <ReportTable data={filteredContacts} columns={columns} pageSize={25} />
      </div>

      {/* Send Template Modal */}
      {isSendModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-6 relative border border-white/10 animate-scale-in">
            <button
              onClick={() => {
                setIsSendModalOpen(false);
                setIsEditingSchedule(false);
              }}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white">
                {isEditingSchedule ? 'Edit Scheduled Campaign' : 'Send Email Template'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {isEditingSchedule
                  ? 'Update the scheduled time or template for this campaign.'
                  : `Select a template to send to the ${upload.validEmails} valid contacts in this list.`}
              </p>
            </div>

            {templates.length === 0 ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-gray-500">You don't have any templates yet.</p>
                <Link
                  to="/templates/create"
                  className="btn-secondary inline-block text-xs"
                >
                  Create a Template
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Choose Template
                  </label>

                  <div className="flex gap-2 items-center relative">
                    <div className="flex-1 relative">
                      {/* Custom Styled Dropdown Trigger */}
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 hover:border-white/20 transition-all text-sm flex items-center justify-between text-left"
                      >
                        <span className="truncate">
                          {selectedTemplate ? selectedTemplate.name : 'Select a template'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Custom Styled Dropdown Options */}
                      {isDropdownOpen && (
                        <>
                          {/* Click Outside Overlay */}
                          <div
                            className="fixed inset-0 z-40 cursor-default"
                            onClick={() => setIsDropdownOpen(false)}
                          />

                          {/* Options List */}
                          <div className="absolute left-0 right-0 mt-1.5 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                            <div className="p-1 divide-y divide-white/5">
                              {templates.map((t) => {
                                const isSelected = t.id === selectedTemplateId;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTemplateId(t.id);
                                      setIsDropdownOpen(false);
                                    }}
                                    className={`w-full px-4 py-3 text-left text-sm rounded-lg transition-colors flex items-center justify-between ${isSelected
                                        ? 'bg-brand-600/30 text-white font-semibold'
                                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                      }`}
                                  >
                                    <span className="truncate">{t.name}</span>
                                    {isSelected && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Preview Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setIframeHeight('400px');
                        setIsPreviewModalOpen(true);
                      }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-center shrink-0 ${selectedTemplateId
                          ? 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20'
                          : 'bg-white/5 border-white/5 text-gray-600 cursor-not-allowed'
                        }`}
                      title="Preview Template"
                      disabled={!selectedTemplateId}
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Send Type Selector */}
                {!isEditingSchedule && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Sending Method
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSendType('immediate')}
                        className={`py-2.5 px-3 text-xs font-semibold rounded-xl border transition-all ${
                          sendType === 'immediate'
                            ? 'bg-brand-600/30 text-white border-brand-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        Send Immediately
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendType('scheduled')}
                        className={`py-2.5 px-3 text-xs font-semibold rounded-xl border transition-all ${
                          sendType === 'scheduled'
                            ? 'bg-brand-600/30 text-white border-brand-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        Schedule for Later
                      </button>
                    </div>
                  </div>
                )}

                {/* Date/Time Picker */}
                {sendType === 'scheduled' && (
                  <div className="space-y-2 animate-slide-down">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Schedule Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={getMinDateTimeString()}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 hover:border-white/20 transition-all text-sm [color-scheme:dark]"
                    />
                    <div className="bg-white/5 border border-white/5 rounded-lg p-2.5 text-[11px] text-gray-400 space-y-1 mt-1.5">
                      <p className="font-semibold text-white">⚠️ Incomplete Date/Time Warning</p>
                      <p>
                        Please fill out **all** fields (Month, Day, Year, Hour, Minute, and AM/PM). If any part shows <span className="text-brand-300 font-mono">--</span>, the system will not receive a valid date.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsSendModalOpen(false);
                      setIsEditingSchedule(false);
                      setSendType('immediate');
                      const date = new Date();
                      date.setHours(date.getHours() + 1);
                      date.setMinutes(0);
                      const tzOffset = date.getTimezoneOffset() * 60000;
                      setScheduledAt(new Date(date.getTime() - tzOffset).toISOString().slice(0, 16));
                    }}
                    className="btn-secondary w-full text-sm py-2.5"
                    disabled={sending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartSend}
                    className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2"
                    disabled={sending}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : sendType === 'scheduled' ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {sendType === 'scheduled' ? (isEditingSchedule ? 'Update Schedule' : 'Schedule Campaign') : 'Send Emails'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Template Modal */}
      {isPreviewModalOpen && selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-white/10 flex flex-col max-h-[90vh]">
            <button
              onClick={() => setIsPreviewModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-brand-400" />
                Email Template Preview
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Visualizing actual send format for template: <span className="font-semibold text-white">{selectedTemplate.name}</span>
              </p>
            </div>

            {/* Email client container mock */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950 flex flex-col flex-1 min-h-[400px]">
              {/* Email Client Header */}
              <div className="bg-white/5 p-4 border-b border-white/10 space-y-2 text-xs text-gray-300">
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">Subject:</span>
                  <span className="text-white font-medium text-sm">{selectedTemplate.subject}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">From:</span>
                  <span>Desire Mail Marketing &lt;marketing@desiremailmarketing.com&gt;</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">To:</span>
                  <span>deep &lt;deep@example.com&gt;</span>
                </div>
              </div>

              {/* Email Content Frame */}
              <div className="flex-1 bg-slate-900/50 overflow-y-auto p-4 md:p-6 flex justify-center">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-[650px] overflow-hidden self-start">
                  <iframe
                    title="Template Html Body Preview"
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
                              padding: 0;
                            }
                            /* Custom scrollbar inside iframe body */
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
                          ${selectedTemplate.htmlBody
                        .replace(/\{\{\s*name\s*\}\}/g, 'deep')
                        .replace(/\{\{\s*email\s*\}\}/g, 'deep@example.com')
                        .replace(/\{\{\s*unsubscribeLink\s*\}\}/g, '#')
                      }
                        </body>
                      </html>
                    `}
                    className="w-full border-0 block"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="btn-secondary text-sm py-2 px-6"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {isEditModalOpen && editingContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <form
            onSubmit={handleUpdateContact}
            className="glass-card max-w-md w-full p-6 space-y-6 relative border border-white/10 animate-scale-in"
          >
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white">Edit Contact</h3>
              <p className="text-sm text-gray-400 mt-1">
                Modify contact information. Validation status will automatically re-evaluate.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 hover:border-white/20 transition-all text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 hover:border-white/20 transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="btn-secondary w-full text-sm py-2.5"
                disabled={updatingContact}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2"
                disabled={updatingContact}
              >
                {updatingContact ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Contact Modal */}
      {isDeleteModalOpen && deletingContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-6 relative border border-white/10 animate-scale-in">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex gap-4 items-start">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Delete Contact</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-white">{deletingContact.name}</span>?
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-2 text-sm text-gray-300">
              <div>
                <span className="text-gray-500 font-medium inline-block w-16">Email:</span>
                <span className="font-mono text-white">{deletingContact.email}</span>
              </div>
              <div>
                <span className="text-gray-500 font-medium inline-block w-16">Status:</span>
                <span className="capitalize">{deletingContact.status}</span>
              </div>
            </div>

            <p className="text-xs text-red-400">
              * This action cannot be undone. Excel upload metrics will automatically update.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-secondary w-full text-sm py-2.5"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteContact}
                className="bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold shadow-[0_0_15px_rgba(220,38,38,0.2)] hover:shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all w-full text-sm py-2.5 flex items-center justify-center gap-2"
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Delete Contact'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Detail View Modal */}
      {isLogModalOpen && selectedLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-white/10 flex flex-col max-h-[90vh]">
            <button
              onClick={() => setIsLogModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-brand-400" />
                Email Delivery Details
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Campaign File: <span className="font-semibold text-white">{upload?.originalName}</span>
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
                  {upload?.template && compiledEmail ? (
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
                      {upload?.template?.plainTextBody && (
                        <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-lg text-left text-xs font-mono text-gray-700 whitespace-pre-wrap">
                          {upload.template.plainTextBody}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsLogModalOpen(false)}
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

function InfoCard({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="glass-card p-4 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
