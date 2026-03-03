#!/usr/bin/env node
/**
 * CLI entry point for Second Brain Health Check.
 *
 * Routing logic:
 *   - "setup" subcommand → interactive setup wizard
 *   - Any CLI flag (--help, --pdf, --no-open, or a path arg) → CLI mode
 *   - No args AND stdin is not a TTY (piped by Claude Code) → MCP server mode
 *   - No args AND stdin IS a TTY (user ran it bare) → CLI mode (runs health check)
 *
 * Usage:
 *   npx second-brain-health-check                        Text report + dashboard (default)
 *   npx second-brain-health-check setup                  Configure MCP servers + token
 *   npx second-brain-health-check [path]                 Text report + dashboard
 *   npx second-brain-health-check --no-open [path]       Text report only, no browser
 *   npx second-brain-health-check --pdf [path]           PDF report (needs Chrome)
 *   npx second-brain-health-check --help                 Show usage
 */

const args = process.argv.slice(2);
const hasCliArgs = args.length > 0;

// MCP mode: no CLI args and stdin is piped (spawned by Claude Code as MCP server).
// Delegate to index.js which starts the actual MCP stdio transport.
if (!hasCliArgs && !process.stdin.isTTY) {
    await import('./index.js');
} else if (args[0] === 'setup') {
    // Setup wizard: configure MCPs + token
    const { runSetup } = await import('./setup.js');
    await runSetup();
} else {
    // CLI mode: run health check interactively
    const { runHealthCheck } = await import('./health-check.js');
    const { formatReport } = await import('./report-formatter.js');
    const { saveDashboard } = await import('./dashboard/generate.js');
    const { generatePdf } = await import('./tools/generate-pdf.js');

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`Second Brain Health Check

Usage:
  npx second-brain-health-check                        Text report + open dashboard (default)
  npx second-brain-health-check setup                  Configure MCP servers + token
  npx second-brain-health-check [path]                 Text report + dashboard for path
  npx second-brain-health-check --no-open [path]       Text report only, skip browser
  npx second-brain-health-check --pdf [path]           PDF report via headless Chrome

Options:
  setup           Interactive setup wizard — configures Health Check + Guide MCPs
  --no-open       Skip opening the HTML dashboard in browser
  --pdf           Generate PDF report via headless Chrome
  --help, -h      Show this help

Path defaults to current directory. Must contain a CLAUDE.md file.

MCP Server:
  claude mcp add second-brain-health -- npx second-brain-health-check`);
        process.exit(0);
    }

    const flags = ['--pdf', '--no-open', '--dashboard'];
    const pdfFlag = args.includes('--pdf');
    const noOpenFlag = args.includes('--no-open');
    const pathArgs = args.filter((a) => !flags.includes(a));
    let path = pathArgs[0] || process.cwd();

    // Auto-detect: if no CLAUDE.md in the given path, search immediate subdirectories
    if (!pathArgs[0]) {
        const { stat: statFs, readdir } = await import('node:fs/promises');
        const { resolve: resolvePath, join } = await import('node:path');
        const resolvedPath = resolvePath(path);
        const hasClaude = await statFs(join(resolvedPath, 'CLAUDE.md')).then(() => true).catch(() => false);
        if (!hasClaude) {
            const entries = await readdir(resolvedPath, { withFileTypes: true }).catch(() => []);
            const matches = [];
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const sub = join(resolvedPath, entry.name);
                    const subHas = await statFs(join(sub, 'CLAUDE.md')).then(() => true).catch(() => false);
                    if (subHas) matches.push(sub);
                }
            }
            if (matches.length === 1) {
                process.stderr.write(`Auto-detected Second Brain at: ${matches[0]}\n\n`);
                path = matches[0];
            } else if (matches.length > 1) {
                process.stderr.write(`Multiple Second Brains found. Please specify a path:\n`);
                for (const m of matches) process.stderr.write(`  npx second-brain-health-check ${m}\n`);
                process.stderr.write('\n');
            }
        }
    }

    // Privacy notice — printed once before analysis begins
    process.stderr.write(
        '\nHealth check runs entirely locally. Zero telemetry.\n' +
        'Paid features (Guide MCP) connect to the Guide server for onboarding and optimization.\n' +
        'Reads file structure and config metadata — never logs, stores, or transmits secret values.\n' +
        'Secret detection reports "found/not found" only — your actual keys are never shown in output.\n\n'
    );

    try {
        if (pdfFlag) {
            const pdfPath = await generatePdf(path);
            console.log(`PDF report saved to: ${pdfPath}`);
        } else {
            const report = await runHealthCheck(path);
            console.log(formatReport(report));

            // Always generate dashboard and open in browser unless --no-open
            const filePath = await saveDashboard(report);
            console.log(`\nDashboard: ${filePath}`);

            if (!noOpenFlag) {
                const { execFile } = await import('node:child_process');
                execFile('open', [filePath], (err) => {
                    if (err) {
                        execFile('xdg-open', [filePath], () => { /* no-op on failure */ });
                    }
                });
            }
        }
    } catch (error) {
        console.error(`Health check failed: ${error.message}`);
        process.exit(1);
    }
}
