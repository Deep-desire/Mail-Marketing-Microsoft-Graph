import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';

interface Props {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
}




export default function FileUpload({ onFileSelect, isUploading }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setError(null);
    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are accepted');
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
      return false;
    }
    return true;
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-4">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex flex-col items-center justify-center w-full h-52 
                     rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300
                     ${isDragging
            ? 'border-brand-500 bg-brand-500/10 scale-[1.02]'
            : 'border-white/10 bg-white/5 hover:border-brand-500/50 hover:bg-white/10'
          }
                     ${isUploading ? 'pointer-events-none opacity-60' : ''}
                   `}
      >
        <input
          type="file"
          accept=".xlsx"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={isUploading}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Uploading & processing...</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet className="w-12 h-12 text-emerald-400" />
            <p className="text-sm text-white font-medium">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-gray-500" />
            <div className="text-center">
              <p className="text-sm text-gray-400">
                <span className="text-brand-400 font-medium">Click to upload</span>{' '}
                or drag and drop
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Only .xlsx files • Max 10MB
              </p>
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Required format info */}
      <div className="glass-card p-4">
        <p className="text-sm font-medium text-gray-300 mb-2">Required Excel Format:</p>
        <div className="overflow-x-auto">
          <table className="text-xs text-gray-400">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 px-4 text-left font-semibold text-brand-400">name</th>
                <th className="py-2 px-4 text-left font-semibold text-brand-400">email</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1.5 px-4">John Doe</td>
                <td className="py-1.5 px-4">john@example.com</td>
              </tr>
              <tr>
                <td className="py-1.5 px-4">Jane Smith</td>
                <td className="py-1.5 px-4">jane@example.com</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
