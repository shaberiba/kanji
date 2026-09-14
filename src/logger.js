import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'access_token',
      'page_access_token',
      'long_lived_user_token',
      '*.access_token',
      '*.page_access_token',
      '*.long_lived_user_token',
    ],
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
});
