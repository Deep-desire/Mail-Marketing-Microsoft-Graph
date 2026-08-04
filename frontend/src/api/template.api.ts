import api from './axios';
import { Template } from '../types';

export const templateApi = {
  create: (data: {
    name: string;
    subject: string;
    htmlBody: string;
    plainTextBody: string;
  }) => api.post<Template>('/templates', data),

  getAll: () => api.get<Template[]>('/templates'),

  getOne: (id: string) => api.get<Template>(`/templates/${id}`),

  update: (
    id: string,
    data: Partial<{
      name: string;
      subject: string;
      htmlBody: string;
      plainTextBody: string;
    }>,
  ) => api.put<Template>(`/templates/${id}`, data),

  delete: (id: string) => api.delete(`/templates/${id}`),

  sendTest: (id: string, testEmail: string) =>
    api.post(`/templates/${id}/test`, { testEmail }),
};
