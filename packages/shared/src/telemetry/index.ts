/**
 * Barrel do módulo de telemetria.
 */

export {
  configureTelemetry,
  getTelemetryConfig,
  logEvent,
  logEvents,
  logCustom,
  makeContext,
  consoleSink,
  noopSink,
  type TelemetryConfig,
  type TelemetryContext,
  type TelemetrySink,
  type TelemetryEvent,
} from './telemetry.js';
