export type LogLevel = 'normal' | 'debug' | 'silent';

export let currentLogLevel: LogLevel = 'normal'; // Change to 'silent' to disable logging

export function setLogLevel(level: LogLevel) {
  currentLogLevel = level;
}

export function log(message: string, level: 'log' | 'warn' | 'error' | 'debug' = 'log') {
  if (currentLogLevel === 'silent') return;
  if (level === 'debug' && currentLogLevel !== 'debug') return;

  console[level](`🗄️ [Cache] ${message}`);
}

