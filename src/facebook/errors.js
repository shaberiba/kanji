export class FacebookApiError extends Error {
  constructor(message, { code, errorSubcode, type, fbtraceId, httpStatus } = {}) {
    super(message);
    this.name = 'FacebookApiError';
    this.code = code;
    this.errorSubcode = errorSubcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
    this.httpStatus = httpStatus;
  }

  get isAuthError() {
    return this.code === 190;
  }

  get isPermissionError() {
    return this.code === 200 || this.code === 10;
  }

  get isRateLimited() {
    return this.code === 4 || this.code === 17 || this.code === 32;
  }

  get isValidationError() {
    return this.code === 100;
  }
}

export function parseGraphError(httpStatus, body) {
  const error = body?.error ?? {};
  return new FacebookApiError(error.message || 'Unknown Facebook API error', {
    code: error.code,
    errorSubcode: error.error_subcode,
    type: error.type,
    fbtraceId: error.fbtrace_id,
    httpStatus,
  });
}
