import { NextResponse } from 'next/server';

/**
 * Liveness probe for the container healthcheck and for nginx's upstream check.
 *
 * Deliberately does NOT touch MongoDB. A database blip should not make the
 * orchestrator restart a healthy web server; readiness of the data layer is a
 * separate concern with its own error surface in the app.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', at: new Date().toISOString() });
}
