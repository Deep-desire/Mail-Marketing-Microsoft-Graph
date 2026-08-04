import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Eye, FileSpreadsheet, Calendar, List, ArrowRight, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import FileUpload from '../components/FileUpload';
import { uploadApi } from '../api/upload.api';
import { Upload } from '../types';
import StatusBadge from '../components/StatusBadge';

export default function UploadExcel() {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Upload | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit and Delete states
  const [editingUpload, setEditingUpload] = useState<Upload | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingUpload, setDeletingUpload] = useState<Upload | null>(null);

  const fetchUploads = async () => {
    try {
      const res = await uploadApi.getAll();
      setUploads(res.data);
    } catch (err) {
      toast.error('Failed to load previous uploads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadApi.uploadExcel(file);
      setResult(res.data);
      toast.success('File uploaded and processed!');
      fetchUploads(); // Refresh history list
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async () => {
    if (!editingUpload || !editName.trim()) return;
    try {
      await uploadApi.update(editingUpload.id, {
        fileName: editName.trim(),
        originalName: editName.trim(),
      });
      toast.success('Upload renamed successfully');
      setEditingUpload(null);
      fetchUploads();
    } catch (err) {
      toast.error('Failed to rename upload');
    }
  };

  const handleDelete = async () => {
    if (!deletingUpload) return;
    try {
      await uploadApi.delete(deletingUpload.id);
      toast.success('Upload deleted successfully');
      setDeletingUpload(null);
      fetchUploads();
    } catch (err) {
      toast.error('Failed to delete upload');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Upload Contacts</h1>
        <p className="text-gray-500 mt-1">Upload a .xlsx spreadsheet with contact lists and view history</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Container */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6">
            <h2 className="section-title mb-4">New Upload</h2>
            <FileUpload onFileSelect={handleUpload} isUploading={uploading} />
          </div>

          {/* Upload Result Summary */}
          {result && (
            <div className="animate-slide-up">
              <div className="glass-card p-6 space-y-4 border border-emerald-500/20 bg-emerald-500/5">
                <h2 className="section-title flex items-center gap-2 text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                  Latest Upload Summary
                </h2>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white/5 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-gray-400">Total Rows</p>
                    <p className="text-lg font-bold text-white mt-0.5">{result.totalRows}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-emerald-400">Valid</p>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5">{result.validEmails}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-red-400">Invalid</p>
                    <p className="text-lg font-bold text-red-400 mt-0.5">{result.invalidEmails}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-amber-400">Duplicates</p>
                    <p className="text-lg font-bold text-amber-400 mt-0.5">{result.duplicateEmails}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => navigate(`/uploads/${result.id}`)}
                    className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 w-full justify-center"
                  >
                    View Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setResult(null)}
                    className="btn-secondary text-xs py-2 px-3 w-full justify-center"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Uploads History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-6 overflow-hidden">
            <h2 className="section-title flex items-center gap-2 mb-4">
              <List className="w-5 h-5 text-brand-400" />
              Upload History
            </h2>

            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/5 rounded-lg" />
                ))}
              </div>
            ) : uploads.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                <p className="text-sm">No spreadsheets uploaded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3">File Details</th>
                      <th className="px-4 py-3 text-center">Total Rows</th>
                      <th className="px-4 py-3 text-center">Valid</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm text-gray-300">
                    {uploads.map((u) => (
                      <tr key={u.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white max-w-[200px] truncate" title={u.originalName}>
                            {u.originalName}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(u.createdAt).toLocaleDateString()} {new Date(u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">{u.totalRows}</td>
                        <td className="px-4 py-3 text-center text-emerald-400 font-semibold">{u.validEmails}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/uploads/${u.id}`)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 hover:text-brand-400 text-gray-400 transition-all inline-flex items-center gap-1 text-xs"
                              title="View Upload Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Details
                            </button>
                            <button
                              onClick={() => {
                                setEditingUpload(u);
                                setEditName(u.originalName);
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 hover:text-amber-400 text-gray-400 transition-all inline-flex items-center"
                              title="Rename Upload"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingUpload(u)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-400 transition-all inline-flex items-center"
                              title="Delete Upload"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUpload && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-white/10 animate-fade-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Rename Upload</h3>
              <button
                onClick={() => setEditingUpload(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-gray-400">File Display Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder="Enter new name"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingUpload(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="btn-primary text-xs px-4 py-2"
                disabled={!editName.trim()}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingUpload && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-500/20 bg-red-950/20 animate-fade-in">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Upload History?
            </h3>
            <p className="text-sm text-gray-400">
              Are you sure you want to delete <strong className="text-white">"{deletingUpload.originalName}"</strong>? This will permanently delete this upload history along with all of its associated contacts. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingUpload(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs px-4 py-2 font-medium transition-all"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
