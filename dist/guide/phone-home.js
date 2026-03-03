/**
 * Phone-home — POST anonymized health check scores to Factory.
 *
 * Sends: timestamp, version, overallPct, setup/usage/fluency scores,
 *        maturity, CE patterns, layer scores.
 * NEVER sends: file contents, file paths, directory structure, CLAUDE.md content, PII.
 *
 * Only runs for authenticated users (SBF_TOKEN set).
 * Silent skip on network failure — never blocks check_health.
 */
import { VERSION } from '../version.js';

const FACTORY_SCORES_URL = 'https://www.iwoszapar.com/api/health-check/submit';
const PHONE_HOME_TIMEOUT_MS = 5000;

/**
 * Extract anonymized score payload from a health check report.
 * This is the ONLY data that leaves the user's machine.
 */
function buildScorePayload(report) {
    const setupPts = report.setup?.totalPoints || 0;
    const usagePts = report.usage?.totalPoints || 0;
    const fluencyPts = report.fluency?.totalPoints || 0;
    const setupMax = report.setup?.maxPoints || 0;
    const usageMax = report.usage?.maxPoints || 0;
    const fluencyMax = report.fluency?.maxPoints || 0;
    const totalMax = setupMax + usageMax + fluencyMax;

    return {
        timestamp: report.timestamp || new Date().toISOString(),
        version: VERSION,
        overallPct: totalMax > 0 ? Math.round(((setupPts + usagePts + fluencyPts) / totalMax) * 100) : 0,
        setup: report.setup?.normalizedScore ?? 0,
        usage: report.usage?.normalizedScore ?? 0,
        fluency: report.fluency?.normalizedScore ?? 0,
        maturity: report.brainState?.maturity || 'unknown',
        cePatterns: (report.cePatterns || []).map(p => ({
            name: p.name,
            pct: p.percentage
        })),
        checks: [
            ...(report.setup?.layers || []).map(l => ({ dim: 'setup', name: l.name, pts: l.points, max: l.maxPoints })),
            ...(report.usage?.layers || []).map(l => ({ dim: 'usage', name: l.name, pts: l.points, max: l.maxPoints })),
            ...(report.fluency?.layers || []).map(l => ({ dim: 'fluency', name: l.name, pts: l.points, max: l.maxPoints })),
        ]
    };
}

/**
 * POST anonymized scores to Factory.
 *
 * @param {object} report - Health check report from runHealthCheck()
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export async function phoneHome(report) {
    // Only send if user has an authenticated account (SBF_TOKEN is the canonical env var)
    const token = process.env.SBF_TOKEN;
    if (!token) {
        return { sent: false, reason: 'no_token' };
    }

    // User can opt out via environment variable
    if (process.env.SBF_PHONE_HOME === 'false' || process.env.SBF_PHONE_HOME === '0') {
        return { sent: false, reason: 'opted_out' };
    }

    const payload = buildScorePayload(report);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PHONE_HOME_TIMEOUT_MS);

        const response = await fetch(FACTORY_SCORES_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Client-Version': VERSION,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
            return { sent: true };
        }

        // 409 = scores already submitted for this timestamp — treat as success
        if (response.status === 409) {
            return { sent: true, reason: 'duplicate' };
        }

        return { sent: false, reason: `http_${response.status}` };
    } catch (error) {
        // Network failure, timeout, or any other error — silently skip
        const isAbort = (error instanceof DOMException && error.name === 'AbortError') ||
                        (error instanceof Error && error.name === 'AbortError');
        return { sent: false, reason: isAbort ? 'timeout' : 'network_error' };
    }
}
