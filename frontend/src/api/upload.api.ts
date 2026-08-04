import api from './axios';
import { Upload, ContactsResponse, DashboardStats, Contact, Template } from '../types';

export const uploadApi = {
  uploadExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<Upload>('/uploads/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getAll: () => api.get<Upload[]>('/uploads'),

  getOne: (id: string) => api.get<Upload>(`/uploads/${id}`),

  getContacts: (id: string, page = 1, limit = 50) =>
    api.get<ContactsResponse>(`/uploads/${id}/contacts`, {
      params: { page, limit },
    }),

  getDashboardStats: () => api.get<DashboardStats>('/uploads/stats/dashboard'),

  startSend: (id: string, templateId: string, smtpConfigId?: string) =>
    api.post<{
      message: string;
      totalCount: number;
      queuedCount: number;
      skippedCount: number;
      queuedContacts: Array<{ id: string; name: string; email: string }>;
      batchSize?: number;
      batchDelayMs?: number;
    }>(`/uploads/${id}/send`, { templateId, smtpConfigId }),

  sendBatch: (id: string, data: { templateId: string; contactIds: string[] }) =>
    api.post<{ sent: number; failed: number }>(`/uploads/${id}/send-batch`, data),

  finalizeSend: (id: string) =>
    api.post<{ status: string }>(`/uploads/${id}/finalize`),

  scheduleSend: (id: string, data: { templateId: string; scheduledAt: string }) =>
    api.post<{ message: string }>(`/uploads/${id}/schedule`, data),

  unscheduleSend: (id: string) =>
    api.post<{ message: string }>(`/uploads/${id}/unschedule`),

  update: (id: string, data: Partial<{ fileName: string; originalName: string }>) =>
    api.put<Upload>(`/uploads/${id}`, data),

  delete: (id: string) => api.delete(`/uploads/${id}`),

  updateContact: (id: string, data: { name: string; email: string }) =>
    api.put<Contact>(`/contacts/${id}`, data),

  deleteContact: (id: string) =>
    api.delete<{ message: string }>(`/contacts/${id}`),

  getStats: (id: string) =>
    api.get<{
      id: string;
      status: string;
      totalCount: number;
      sentCount: number;
      failedCount: number;
      pendingCount: number;
      skippedCount: number;
    }>(`/uploads/${id}/stats`),

  getDeliveryLogs: (params: { page?: number; limit?: number; search?: string; status?: string; startDate?: string; endDate?: string }) =>
    api.get<{
      logs: Array<Contact & { upload: { originalName: string; fileName: string; template: Template | null } }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>('/contacts/logs', { params }),
};
