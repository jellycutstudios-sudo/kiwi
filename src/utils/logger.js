/**
 * Centralized error tracking and telemetry utility.
 * In production, this can be hooked up to Sentry, Datadog, or LogRocket.
 */

export const logError = (error, context = {}) => {
  // In development, log verbosely
  if (import.meta.env.DEV) {
    console.group('[Error Tracker]');
    console.error(error);
    if (Object.keys(context).length > 0) {
      console.info('Context:', context);
    }
    console.groupEnd();
  }

  // In production, send to your telemetry service
  // Example for Sentry:
  // if (import.meta.env.PROD && typeof Sentry !== 'undefined') {
  //   Sentry.captureException(error, { extra: context });
  // }
};

export const logEvent = (eventName, data = {}) => {
  if (import.meta.env.DEV) {
    console.log(`[Event Tracker] ${eventName}`, data);
  }
  // Hook up Mixpanel, PostHog, or Firebase Analytics here
};
