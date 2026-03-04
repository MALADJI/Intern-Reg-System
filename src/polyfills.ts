/**
 * Polyfills for the application
 */

// Polyfill for 'global' which is needed by sockjs-client
// This must be defined before any imports that rely on it
(window as any).global = window;
