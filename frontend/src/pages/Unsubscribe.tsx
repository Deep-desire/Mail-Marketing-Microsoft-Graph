import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MailX, CheckCircle, Loader2, Mail } from 'lucide-react';
import api from '../api/axios';

export default function Unsubscribe() {
  const { token } = useParams<{ token: string }>();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleUnsubscribe = async () => {
    if (!email || !token) return;
    setStatus('loading');
    try {
      const res = await api.post(`/unsubscribe/${token}`, { email });
      setMessage(res.data.message);
      setStatus('success');
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to unsubscribe. Invalid link.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-mesh px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="glass-card p-8 text-center">
          {status === 'success' ? (
            <>
              <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Unsubscribed</h1>
              <p className="text-gray-400">{message}</p>
              <p className="text-sm text-gray-600 mt-4">
                You will no longer receive marketing emails from Desire Mail Marketing
              </p>
            </>
          ) : status === 'error' ? (
            <>
              <MailX className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Error</h1>
              <p className="text-gray-400">{message}</p>
              <button
                onClick={() => setStatus('idle')}
                className="btn-secondary mt-4"
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Unsubscribe</h1>
              <p className="text-gray-400 mb-6">
                Enter your email address to unsubscribe from Desire Mail Marketing emails.
              </p>

              <div className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="input-field text-center"
                />
                <button
                  onClick={handleUnsubscribe}
                  disabled={!email || status === 'loading'}
                  className="btn-danger w-full flex items-center justify-center gap-2"
                >
                  {status === 'loading' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <MailX className="w-4 h-4" />
                      Unsubscribe
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          © {new Date().getFullYear()} Desire Mail Marketing — All rights reserved
        </p>
      </div>
    </div>
  );
}
