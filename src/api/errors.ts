export type ErrorKind = 'retryable' | 'permanent';

export class ApiError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}