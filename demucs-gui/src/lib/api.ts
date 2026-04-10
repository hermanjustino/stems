interface JobResponse {
  message: string;
  session_id: string;
  status: 'processing' | 'completed' | 'queued';
}

interface StatusResponse {
  status: 'processing' | 'completed';
  stems?: {
    vocals: string;
    drums: string;
    bass: string;
    other: string;
  };
}

export interface ProcessedStems {
  vocals: string;
  drums: string;
  bass: string;
  other: string;
  session_id: string;
}

export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  url: string;
}

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:5001');

export async function uploadAudio(file: File): Promise<string> {
  if (!file) throw new Error('No file provided');
  if (!file.type.includes('audio')) throw new Error('Invalid file type');

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/process`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  const data = await response.json() as JobResponse;
  return data.session_id;
}

export async function pollJobStatus(sessionId: string): Promise<ProcessedStems> {
  const maxAttempts = 120; // 10 minutes at 5s intervals
  const interval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${API_URL}/status/${sessionId}`);
    if (!response.ok) throw new Error('Status check failed');

    const data = await response.json() as StatusResponse;
    if (data.status === 'completed' && data.stems) {
      return {
        ...data.stems,
        session_id: sessionId
      };
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Processing timed out. This often happens on first-run as the worker boots up.');
}

export async function checkServerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function cleanupSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/cleanup/${sessionId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn('Failed to cleanup session:', error);
  }
}

export async function searchSoundCloud(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(`${API_URL}/soundcloud/search?q=${encodeURIComponent(query)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to search SoundCloud');
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('SoundCloud Search Error:', error);
    throw error;
  }
}

export async function downloadSoundCloud(url: string): Promise<JobResponse> {
  try {
    const response = await fetch(`${API_URL}/soundcloud/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to queue SoundCloud track');
    }

    return await response.json();
  } catch (error) {
    console.error('SoundCloud Download Error:', error);
    throw error;
  }
}
