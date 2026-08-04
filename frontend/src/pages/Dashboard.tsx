import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Send, AlertTriangle } from 'lucide-react';
import StatsCard from '../components/StatsCard';
import { uploadApi } from '../api/upload.api';
import { DashboardStats } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    uploadApi
      .getDashboardStats()
      .then((res) => setStats(res.data))
      .catch(() => setStats({ totalUploads: 0, totalTemplates: 0, totalEmailsSent: 0, totalFailedEmails: 0 }))
      .finally(() => setLoading(false));
  }, []);

  const admin = JSON.parse(localStorage.getItem('desire_admin') || '{}');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome back, <span className="text-brand-400">{admin.name || 'Admin'}</span>
        </p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-24 mb-4" />
              <div className="h-8 bg-white/10 rounded w-16" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Uploads"
            value={stats.totalUploads}
            icon={<Upload className="w-6 h-6" />}
            color="indigo"
            onClick={() => navigate('/uploads')}
          />
          <StatsCard
            title="Templates"
            value={stats.totalTemplates}
            icon={<FileText className="w-6 h-6" />}
            color="amber"
            onClick={() => navigate('/templates')}
          />
          <StatsCard
            title="Emails Sent"
            value={stats.totalEmailsSent}
            icon={<Send className="w-6 h-6" />}
            color="emerald"
            onClick={() => navigate('/delivery-logs?status=sent')}
          />
          <StatsCard
            title="Failed Emails"
            value={stats.totalFailedEmails}
            icon={<AlertTriangle className="w-6 h-6" />}
            color="rose"
            onClick={() => navigate('/delivery-logs?status=failed')}
          />
        </div>
      ) : null}

      {/* Quick Actions */}
      <div>
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/uploads" className="glass-card-hover p-6 group block">
            <Upload className="w-8 h-8 text-brand-400 mb-3 transition-transform group-hover:scale-110" />
            <h3 className="font-semibold text-white">Upload Contacts</h3>
            <p className="text-sm text-gray-500 mt-1">Upload an Excel file with contacts</p>
          </a>
          <a href="/templates/create" className="glass-card-hover p-6 group block">
            <FileText className="w-8 h-8 text-emerald-400 mb-3 transition-transform group-hover:scale-110" />
            <h3 className="font-semibold text-white">Create Template</h3>
            <p className="text-sm text-gray-500 mt-1">Design a new email template</p>
          </a>
        </div>
      </div>
    </div>
  );
}
