import api from './axios';
import { LoginResponse } from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  getMe: () => api.get('/auth/me'),
};
