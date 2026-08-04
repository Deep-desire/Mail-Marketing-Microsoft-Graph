export interface Admin {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface LoginResponse {
  access_token: string;
  admin: Admin;
}

export interface Upload {
  id: string;
  fileName: string;
  originalName: string;
  totalRows: number;
  validEmails: number;
  invalidEmails: number;
  duplicateEmails: number;
  unsubscribedEmails: number;
  status: 'idle' | 'scheduled' | 'processing' | 'completed' | 'failed';
  totalCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  templateId: string | null;
  template?: Template;
  scheduledAt?: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  status: 'valid' | 'invalid' | 'duplicate' | 'unsubscribed';
  error: string | null;
  deliveryStatus: 'idle' | 'pending' | 'sent' | 'failed' | 'skipped';
  deliveryError: string | null;
  sentAt: string | null;
  uploadId: string;
  createdAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  uploadId: string;
  templateId: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  upload?: { originalName: string };
  template?: { name: string };
  createdAt: string;
  updatedAt: string;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  messageId: string | null;
  error: string | null;
  sentAt: string | null;
  campaignId: string;
  createdAt: string;
}

export interface CampaignReport {
  campaign: Campaign;
  recipients: Recipient[];
}

export interface DashboardStats {
  totalUploads: number;
  totalTemplates: number;
  totalEmailsSent: number;
  totalFailedEmails: number;
}

