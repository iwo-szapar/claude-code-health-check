/**
 * PDF Generator
 *
 * Generates a PDF report by rendering the HTML dashboard with headless Chrome/Chromium.
 * No npm dependencies — uses Node.js built-in child_process and fs.
 */
import { execFile } from 'node:child_process';
import { writeFile, unlink, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runHealthCheck } from '../health-check.js';
import { generateDashboardHtml } from '../dashboard/generate.js';

/**
 * Chrome/Chromium candidate paths, checked in order.
 */
const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
    'chrome',
];

/**
 * Find the first available Chrome/Chromium binary.
 * For absolute paths, checks file existence.
 * For bare commands, tries `which` to resolve them.
 */
async function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        if (candidate.startsWith('/')) {
            try {
                await access(candidate);
                return candidate;
            } catch {
                continue;
            }
        } else {
            // Bare command — check if it's on PATH
            const found = await new Promise((res) => {
                execFile('which', [candidate], (err, stdout) => {
                    if (err || !stdout.trim()) return res(null);
                    return res(stdout.trim());
                });
            });
            if (found) return found;
        }
    }
    return null;
}

/**
 * Convert an HTML string to PDF using headless Chrome.
 *
 * @param {string} html       Full HTML document string
 * @param {string} outputPath Absolute path for the PDF file
 * @returns {Promise<string>} Resolves with the output path on success
 */
async function htmlToPdf(html, outputPath) {
    const chromePath = await findChrome();
    if (!chromePath) {
        throw new Error(
            'Chrome/Chromium not found. Install Google Chrome or Chromium and make sure it is on your PATH.\n' +
            'Checked: ' + CHROME_CANDIDATES.join(', ')
        );
    }

    // Write HTML to a temp file
    const tmpName = `sbhc-${randomBytes(8).toString('hex')}.html`;
    const tmpPath = join(tmpdir(), tmpName);

    try {
        await writeFile(tmpPath, html, 'utf-8');

        await new Promise((res, reject) => {
            const args = [
                '--headless',
                '--disable-gpu',
                '--no-pdf-header-footer',
                `--print-to-pdf=${outputPath}`,
                tmpPath,
            ];

            execFile(chromePath, args, { timeout: 30_000 }, (err, _stdout, stderr) => {
                if (err) {
                    return reject(new Error(
                        `Chrome PDF generation failed: ${err.message}${stderr ? '\n' + stderr : ''}`
                    ));
                }
                return res();
            });
        });

        return outputPath;
    } finally {
        // Clean up temp HTML file
        try { await unlink(tmpPath); } catch { /* ignore */ }
    }
}

/**
 * Run a health check and generate a PDF report.
 *
 * @param {string} projectPath  Absolute path to the project directory
 * @returns {Promise<string>}   Path to the generated PDF file
 */
export async function generatePdf(projectPath) {
    const resolvedPath = resolve(projectPath);

    // Run health check
    const report = await runHealthCheck(resolvedPath);

    // Generate HTML dashboard
    const html = generateDashboardHtml(report);

    // Output PDF next to the project
    const pdfPath = join(resolvedPath, 'health-check-report.pdf');

    // Security: enforce home-directory boundary
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
        throw new Error('Cannot determine home directory: HOME environment variable is not set.');
    }
    if (!pdfPath.startsWith(homeDir + '/') && pdfPath !== homeDir) {
        throw new Error(`Output path "${pdfPath}" is outside the home directory.`);
    }

    await htmlToPdf(html, pdfPath);
    return pdfPath;
}
