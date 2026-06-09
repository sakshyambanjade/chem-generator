import api from '@/services/api';

export type GenerationJobRequest = {
  constraints?: Record<string, unknown>;
  count?: number;
  engine: 'molvis_graph' | 'molvis_grammar' | 'molvis_chem_ge';
  objective?: {
    direction?: 'minimize' | 'maximize' | 'target';
    target_property?: string;
    target_value?: number;
  };
  seed?: string;
};

export async function createGenerationJob(payload: GenerationJobRequest, signal?: AbortSignal) {
  const response = await api.post('/generation/jobs', payload, { signal });
  return response.data;
}

export async function getGenerationJob(jobId: string, signal?: AbortSignal) {
  const response = await api.get(`/generation/jobs/${encodeURIComponent(jobId)}`, { signal });
  return response.data;
}

export async function waitForGenerationJob(jobId: string, timeoutMs = 60000, signal?: AbortSignal) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) {
      throw new DOMException('Generation request was canceled.', 'AbortError');
    }
    const response = await getGenerationJob(jobId, signal);
    const status = response?.job?.status;
    if (status === 'completed' || status === 'failed') {
      return response;
    }
    await abortableDelay(900, signal);
  }

  throw new Error('Generation is still running. Check the generation job again in a moment.');
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Generation request was canceled.', 'AbortError'));
      return;
    }
    const timeoutId = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Generation request was canceled.', 'AbortError'));
    }, { once: true });
  });
}
