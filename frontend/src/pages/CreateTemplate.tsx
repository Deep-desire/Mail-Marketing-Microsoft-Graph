import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, SendHorizontal, Loader2, Maximize2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import TemplateEditor from '../components/TemplateEditor';
import { templateApi } from '../api/template.api';

interface TemplateForm {
  name: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
}

export default function CreateTemplate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [plainTextBody, setPlainTextBody] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<TemplateForm>();

  useEffect(() => {
    if (id) {
      templateApi.getOne(id).then((res) => {
        const t = res.data;
        setValue('name', t.name);
        setValue('subject', t.subject);
        setHtmlBody(t.htmlBody);
        setPlainTextBody(t.plainTextBody);
      });
    }
  }, [id]);

  const onSubmit = async (data: TemplateForm) => {
    setSaving(true);
    try {
      const payload = { ...data, htmlBody, plainTextBody };
      if (isEdit && id) {
        await templateApi.update(id, payload);
        toast.success('Template updated!');
      } else {
        await templateApi.create(payload);
        toast.success('Template created!');
      }
      navigate('/templates');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!id || !testEmail) {
      toast.error('Save template first and enter a test email');
      return;
    }
    setTesting(true);
    try {
      await templateApi.sendTest(id, testEmail);
      toast.success('Test email sent!');
    } catch {
      toast.error('Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/templates')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <h1 className="page-title">{isEdit ? 'Edit Template' : 'Create Template'}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column - Template Information */}
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-5">
            {/* Template Name */}
            <div>
              <label htmlFor="template-name" className="label-text">Template Name</label>
              <input
                id="template-name"
                className="input-field"
                placeholder="e.g. Monthly Newsletter"
                {...register('name', { required: 'Name is required' })}
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>

            {/* Subject */}
            <div>
              <label htmlFor="template-subject" className="label-text">Email Subject</label>
              <input
                id="template-subject"
                className="input-field"
                placeholder="e.g. Hello {{name}}, check out our latest update!"
                {...register('subject', { required: 'Subject is required' })}
              />
              {errors.subject && <p className="text-red-400 text-xs mt-1">{errors.subject.message}</p>}
            </div>

            {/* HTML Body */}
            <div>
              <label className="label-text">HTML Body</label>
              <TemplateEditor
                value={htmlBody}
                onChange={setHtmlBody}
                placeholder="<h1>Hello {{name}}</h1><p>Your email content here...</p><p><a href='{{unsubscribeLink}}'>Unsubscribe</a></p>"
              />
            </div>

            {/* Plain Text Body */}
            <div>
              <label className="label-text">Plain Text Body</label>
              <textarea
                value={plainTextBody}
                onChange={(e) => setPlainTextBody(e.target.value)}
                placeholder="Hello {{name}}, your email content here... Unsubscribe: {{unsubscribeLink}}"
                rows={5}
                className="input-field resize-y"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Update Template' : 'Save Template'}
            </button>
          </div>

          {/* Send Test (only for existing templates) */}
          {isEdit && (
            <div className="glass-card p-6">
              <h3 className="section-title mb-4">Send Test Email</h3>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="test-email" className="label-text">Test Email Address</label>
                  <input
                    id="test-email"
                    type="email"
                    className="input-field"
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testing || !testEmail}
                  className="btn-secondary flex items-center gap-2 whitespace-nowrap"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
                  Send Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Live Preview */}
        <div className="sticky top-6 flex flex-col border border-white/10 rounded-2xl bg-[#0b0c16] overflow-hidden h-[calc(100vh-140px)] min-h-[500px]">
          <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Preview</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Real-time template rendering</p>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="p-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 hover:text-white transition-colors text-gray-400 flex items-center gap-1.5 text-xs font-semibold"
              title="Full Screen Preview"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>
          </div>
          <div className="flex-1 bg-white p-4">
            <iframe
              srcDoc={htmlBody || `<div style="color: #666; font-family: sans-serif; text-align: center; padding: 60px; font-size: 14px;">No HTML content. Type code on the left to preview...</div>`}
              title="HTML Email Preview"
              className="w-full h-full border-0 rounded-lg"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </form>

      {/* Full Screen Preview Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-8 animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div>
                <h3 className="text-lg font-bold text-white">Full Screen Template Preview</h3>
                <p className="text-xs text-gray-400 mt-0.5">Rendered email layout</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 hover:text-white transition-colors text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 bg-white p-4">
              <iframe
                srcDoc={htmlBody || `<div style="color: #666; font-family: sans-serif; text-align: center; padding: 40px; font-size: 14px;">No HTML content. Type code in the editor to preview...</div>`}
                title="Full Screen Email Preview"
                className="w-full h-full border-0 rounded-lg"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
