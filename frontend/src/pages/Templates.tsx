import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { templateApi } from '../api/template.api';
import { Template } from '../types';

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = () => {
    templateApi
      .getAll()
      .then((res) => setTemplates(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(fetchTemplates, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await templateApi.delete(id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Email Templates</h1>
          <p className="text-gray-500 mt-1">{templates.length} templates</p>
        </div>
        <Link to="/templates/create" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No templates yet</p>
          <p className="text-sm text-gray-600 mt-1">Create your first email template to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="glass-card-hover p-6 group">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-brand-500/15">
                  <FileText className="w-5 h-5 text-brand-400" />
                </div>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-white mb-1">{t.name}</h3>
              <p className="text-sm text-gray-500 mb-3 truncate">Subject: {t.subject}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  {new Date(t.createdAt).toLocaleDateString()}
                </span>
                <Link
                  to={`/templates/${t.id}/edit`}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Edit →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
