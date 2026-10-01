export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error ?? 'Something went wrong. Try again.', response.status);
  return data as T;
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
