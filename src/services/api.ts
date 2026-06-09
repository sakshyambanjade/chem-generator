const api = {
  async post(
    _url?: string,
    _payload?: unknown,
    config?: {
      headers?: Record<string, string>;
      onUploadProgress?: (event: { loaded: number; total?: number }) => void;
    },
  ) {
    config?.onUploadProgress?.({ loaded: 1, total: 1 });
    return { data: { ok: true, job: { job_id: 'standalone-demo', status: 'completed' } } };
  },
  async get(_url?: string, _config?: unknown) {
    return { data: { ok: true, job: { job_id: 'standalone-demo', status: 'completed' } } };
  },
};

export const API_BASE_URL = '';
export default api;
