#!/usr/bin/env node
/**
 * Setup CLI for Second Brain Health Check + Guide.
 *
 * Flow:
 *   1. Banner + version
 *   2. Token (free/paid gate)
 *   3. Configure MCPs
 *   4. Profile: role (single), experience (single), goals (multi-select)
 *   5. Health check + dashboard
 *   6. Personalized next steps
 *
 * Run via: npx second-brain-health-check setup
 */

import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const REMOTE_MCP_URL = 'https://factory.secondbrain.dev/api/mcp';
const LOCAL_MCP_NAME = 'second-brain-health';
const REMOTE_MCP_NAME = 'second-brain-guide';

// ── Profile Options ──────────────────────────────────────────────────────────

const ROLES = [
    { key: 'developer',        label: 'Developer / Engineer' },
    { key: 'pm',               label: 'Product Manager' },
    { key: 'founder',          label: 'Founder / Executive' },
    { key: 'consultant',       label: 'Consultant / Advisor' },
    { key: 'content_creator',  label: 'Content Creator / Writer' },
    { key: 'sales',            label: 'Sales / Business Development' },
    { key: 'ops',              label: 'Operations / Project Manager' },
    { key: 'researcher',       label: 'Researcher / Analyst' },
];

const EXPERIENCE_LEVELS = [
    { key: 'beginner',     label: 'Beginner — just getting started with Claude Code' },
    { key: 'intermediate', label: 'Intermediate — use it regularly' },
    { key: 'power_user',   label: 'Power User — custom skills, hooks, MCPs' },
];

const GOALS = [
    { key: 'ship_faster',       label: 'Ship code faster' },
    { key: 'better_docs',       label: 'Better documentation & knowledge management' },
    { key: 'automate',          label: 'Automate repetitive workflows' },
    { key: 'organize',          label: 'Organize knowledge & reduce context switching' },
];

// ── ANSI Helpers ─────────────────────────────────────────────────────────────

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }

function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

function section(title) {
    return '\n' + dim('  ') + cyan(bold(title)) + dim(' ─'.repeat(28));
}

// ── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
    const { version } = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    );

    const art = `
  ┌─────────────────────────────────────────────────────┐
  │  ███████ ███████  ██████  ██████  ███    ██ ██████  │
  │  ██      ██      ██      ██    ██ ████   ██ ██   ██ │
  │  ███████ █████   ██      ██    ██ ██ ██  ██ ██   ██ │
  │       ██ ██      ██      ██    ██ ██  ██ ██ ██   ██ │
  │  ███████ ███████  ██████  ██████  ██   ████ ██████  │
  │                                                     │
  │              ██████  ██████   █████  ██ ███    ██    │
  │              ██   ██ ██   ██ ██   ██ ██ ████   ██   │
  │              ██████  ██████  ███████ ██ ██ ██  ██   │
  │              ██   ██ ██   ██ ██   ██ ██ ██  ██ ██   │
  │              ██████  ██   ██ ██   ██ ██ ██   ████   │
  └─────────────────────────────────────────────────────┘`;

    console.log(bold(art));
    console.log('');
    console.log(`  ${bold('Second Brain')} ${dim(`v${version}`)} ${dim('—')} ${dim('Your knowledge, scored and optimized.')}`);
    console.log('');
}

// ── Shared ANSI constants ────────────────────────────────────────────────────

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const MOVE_UP = (n) => `\x1b[${n}A`;
const CLEAR_LINE = '\x1b[2K\r';

// ── Single-Select ────────────────────────────────────────────────────────────

async function askChoice(rl, question, options, defaultIndex = 0) {
    if (!process.stdin.isTTY) {
        console.log(bold(question));
        for (let i = 0; i < options.length; i++) {
            const marker = i === defaultIndex ? green('>') : ' ';
            console.log(`  ${marker} ${i + 1}. ${options[i].label}`);
        }
        const input = await ask(rl, '  > ');
        const num = parseInt(input.trim(), 10);
        if (num >= 1 && num <= options.length) return options[num - 1];
        return options[defaultIndex];
    }

    rl.pause();
    const result = await new Promise((resolve) => {
        let selected = defaultIndex;
        const headerLines = 2;

        function render(firstTime) {
            if (!firstTime) process.stdout.write(MOVE_UP(options.length));
            for (let i = 0; i < options.length; i++) {
                process.stdout.write(CLEAR_LINE);
                if (i === selected) {
                    process.stdout.write(`    ${cyan('>')} ${bold(options[i].label)}\n`);
                } else {
                    process.stdout.write(`      ${dim(options[i].label)}\n`);
                }
            }
        }

        function collapse() {
            const totalLines = options.length + headerLines;
            process.stdout.write(MOVE_UP(totalLines));
            for (let i = 0; i < totalLines; i++) process.stdout.write(CLEAR_LINE + '\n');
            process.stdout.write(MOVE_UP(totalLines));
            process.stdout.write(CLEAR_LINE);
            process.stdout.write(`    ${bold(question)} ${green(options[selected].label)}\n`);
        }

        process.stdout.write('\n');
        console.log(`    ${bold(question)}`);
        console.log(dim('    Arrow keys to move, Enter to select'));
        process.stdout.write(HIDE_CURSOR);
        render(true);

        process.stdin.setRawMode(true);
        process.stdin.resume();

        function onData(key) {
            if (key[0] === 0x1b && key[1] === 0x5b && key[2] === 0x41) {
                selected = selected > 0 ? selected - 1 : options.length - 1;
                render(false);
            } else if (key[0] === 0x1b && key[1] === 0x5b && key[2] === 0x42) {
                selected = selected < options.length - 1 ? selected + 1 : 0;
                render(false);
            } else if (key[0] === 0x0d) {
                collapse(); cleanup(); resolve(options[selected]);
            } else if (key[0] >= 0x31 && key[0] <= 0x39) {
                const num = key[0] - 0x30;
                if (num >= 1 && num <= options.length) {
                    selected = num - 1;
                    collapse(); cleanup(); resolve(options[selected]);
                }
            } else if (key[0] === 0x03) {
                process.stdout.write(SHOW_CURSOR); cleanup(); process.exit(0);
            }
        }

        function cleanup() {
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write(SHOW_CURSOR);
        }

        process.stdin.on('data', onData);
    });
    rl.resume();
    return result;
}

// ── Multi-Select ─────────────────────────────────────────────────────────────

async function askMultiChoice(rl, question, options) {
    if (!process.stdin.isTTY) {
        console.log(bold(question));
        for (let i = 0; i < options.length; i++) {
            console.log(`    ${i + 1}. ${options[i].label}`);
        }
        const input = await ask(rl, '  Comma-separated numbers: ');
        const nums = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= options.length);
        return nums.length > 0 ? nums.map(n => options[n - 1]) : [options[0]];
    }

    rl.pause();
    const result = await new Promise((resolve) => {
        let cursor = 0;
        const checked = new Set();
        const headerLines = 2;

        function render(firstTime) {
            if (!firstTime) process.stdout.write(MOVE_UP(options.length));
            for (let i = 0; i < options.length; i++) {
                process.stdout.write(CLEAR_LINE);
                const check = checked.has(i) ? green('[x]') : dim('[ ]');
                if (i === cursor) {
                    process.stdout.write(`    ${cyan('>')} ${check} ${bold(options[i].label)}\n`);
                } else {
                    process.stdout.write(`      ${check} ${dim(options[i].label)}\n`);
                }
            }
        }

        function collapse() {
            const totalLines = options.length + headerLines;
            process.stdout.write(MOVE_UP(totalLines));
            for (let i = 0; i < totalLines; i++) process.stdout.write(CLEAR_LINE + '\n');
            process.stdout.write(MOVE_UP(totalLines));
            process.stdout.write(CLEAR_LINE);
            const selected = [...checked].sort().map(i => options[i].label);
            const label = selected.length > 0 ? selected.join(', ') : options[cursor].label;
            process.stdout.write(`    ${bold(question)} ${green(label)}\n`);
        }

        process.stdout.write('\n');
        console.log(`    ${bold(question)}`);
        console.log(dim('    Space to toggle, Enter to confirm'));
        process.stdout.write(HIDE_CURSOR);
        render(true);

        process.stdin.setRawMode(true);
        process.stdin.resume();

        function onData(key) {
            if (key[0] === 0x1b && key[1] === 0x5b && key[2] === 0x41) {
                cursor = cursor > 0 ? cursor - 1 : options.length - 1;
                render(false);
            } else if (key[0] === 0x1b && key[1] === 0x5b && key[2] === 0x42) {
                cursor = cursor < options.length - 1 ? cursor + 1 : 0;
                render(false);
            } else if (key[0] === 0x20) {
                if (checked.has(cursor)) checked.delete(cursor);
                else checked.add(cursor);
                render(false);
            } else if (key[0] === 0x0d) {
                collapse(); cleanup();
                const selected = [...checked].sort().map(i => options[i]);
                resolve(selected.length > 0 ? selected : [options[cursor]]);
            } else if (key[0] === 0x03) {
                process.stdout.write(SHOW_CURSOR); cleanup(); process.exit(0);
            }
        }

        function cleanup() {
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write(SHOW_CURSOR);
        }

        process.stdin.on('data', onData);
    });
    rl.resume();
    return result;
}

// ── Yes/No Prompt ────────────────────────────────────────────────────────────

async function askYesNo(rl, question, defaultYes = true) {
    if (!process.stdin.isTTY) {
        const answer = await ask(rl, `  ${question} (${defaultYes ? 'Y/n' : 'y/N'}) `);
        if (defaultYes) return answer.toLowerCase() !== 'n';
        return answer.toLowerCase() === 'y';
    }

    rl.pause();
    const result = await new Promise((resolve) => {
        let yes = defaultYes;

        function render(firstTime) {
            if (!firstTime) process.stdout.write(MOVE_UP(1));
            process.stdout.write(CLEAR_LINE);
            const yLabel = yes ? green(bold('Yes')) : dim('Yes');
            const nLabel = !yes ? green(bold('No')) : dim('No');
            process.stdout.write(`    ${yLabel}  /  ${nLabel}\n`);
        }

        console.log(`\n  ${cyan(bold(question))}`);
        process.stdout.write(HIDE_CURSOR);
        render(true);

        process.stdin.setRawMode(true);
        process.stdin.resume();

        function onData(key) {
            if (key[0] === 0x1b && key[1] === 0x5b && (key[2] === 0x44 || key[2] === 0x43)) {
                yes = !yes; render(false);
            } else if (key[0] === 0x79) { yes = true; render(false); }
            else if (key[0] === 0x6e) { yes = false; render(false); }
            else if (key[0] === 0x0d) {
                process.stdout.write(MOVE_UP(2));
                process.stdout.write(CLEAR_LINE + '\n');
                process.stdout.write(CLEAR_LINE);
                process.stdout.write(MOVE_UP(1));
                process.stdout.write(CLEAR_LINE);
                process.stdout.write(`    ${question} ${green(yes ? 'Yes' : 'No')}\n`);
                cleanup(); resolve(yes);
            } else if (key[0] === 0x03) {
                process.stdout.write(SHOW_CURSOR); cleanup(); process.exit(0);
            }
        }

        function cleanup() {
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write(SHOW_CURSOR);
        }

        process.stdin.on('data', onData);
    });
    rl.resume();
    return result;
}

// ── Utility Functions ────────────────────────────────────────────────────────

function claudeCliAvailable() {
    try { execFileSync('claude', ['--version'], { stdio: 'pipe' }); return true; }
    catch { return false; }
}

function execClaude(args) {
    try { return execFileSync('claude', args, { stdio: 'pipe', encoding: 'utf-8' }).trim(); }
    catch { return null; }
}

function readClaudeSettings() {
    for (const p of [join(process.cwd(), '.claude', 'settings.json'), join(homedir(), '.claude', 'settings.json')]) {
        if (existsSync(p)) {
            try { return { path: p, data: JSON.parse(readFileSync(p, 'utf-8')) }; } catch { /* skip */ }
        }
    }
    return null;
}

function findExistingToken() {
    if (process.env.SBF_TOKEN) return process.env.SBF_TOKEN;
    if (process.env.GUIDE_TOKEN) return process.env.GUIDE_TOKEN;
    const s = readClaudeSettings();
    return s?.data?.env?.SBF_TOKEN || null;
}

function saveTokenToSettings(token) {
    const projectDir = join(process.cwd(), '.claude');
    const settingsPath = join(projectDir, 'settings.json');
    let data = {};
    if (existsSync(settingsPath)) {
        try { data = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* fresh */ }
    }
    if (!data.env) data.env = {};
    data.env.SBF_TOKEN = token;
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(data, null, 2) + '\n');
    return settingsPath;
}

// ── Personalized Next Steps ──────────────────────────────────────────────────

function getNextSteps(profile, isPaid) {
    const { role, experience } = profile;
    const lines = [];

    if (isPaid) {
        if (role === 'developer' || role === 'researcher') {
            lines.push(cyan('  "Run context_pressure to see what eats your context window"'));
            lines.push(cyan('  "Run audit_config to find dead references and security issues"'));
        } else if (role === 'content_creator' || role === 'sales') {
            lines.push(cyan('  "Run context_pressure to see what eats your context window"'));
            lines.push(cyan('  "Run optimize_brain to improve my knowledge organization"'));
        } else if (role === 'founder' || role === 'ops') {
            lines.push(cyan('  "Run weekly_pulse to track my productivity trends"'));
            lines.push(cyan('  "Run context_pressure to see what eats your context window"'));
        } else {
            lines.push(cyan('  "Run context_pressure to see what eats your context window"'));
            lines.push(cyan('  "Run weekly_pulse to see my progress over time"'));
        }
        if (experience === 'beginner') {
            lines.push(cyan('  "Show me fix suggestions for my weakest area"'));
        } else {
            lines.push(cyan('  "Run optimize_brain to level up my Second Brain"'));
        }
    } else {
        lines.push(cyan('  "Run check_health on this project"'));
        lines.push(cyan('  "Show me fix suggestions for my weakest area"'));
        lines.push(cyan('  "Generate a health dashboard"'));
        lines.push('');
        lines.push(dim('  Upgrade: https://www.iwoszapar.com/second-brain-ai'));
    }

    return lines;
}

// ── Main Setup Flow ─────────────────────────────────────────────────────────

export async function runSetup() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // ── Banner ──
    printBanner();

    // ── Prerequisites ──
    if (!claudeCliAvailable()) {
        console.log(red('  Error: Claude Code CLI not found.'));
        console.log('  Install: https://docs.anthropic.com/en/docs/claude-code/overview');
        console.log(dim('  Manual: add "second-brain-health" to .claude/settings.json mcpServers'));
        rl.close();
        process.exit(1);
    }

    // ── Authentication ──
    console.log(section('Authentication'));
    console.log('');

    const existingToken = findExistingToken();
    let token = existingToken;

    if (existingToken) {
        console.log(`    ${green('Found token:')} ${dim(existingToken.slice(0, 8) + '...')}`);
        const keepToken = await askYesNo(rl, 'Use this token?', true);
        if (!keepToken) token = null;
    }

    if (!token) {
        console.log('');
        console.log('    Enter your account token from the purchase email.');
        console.log(dim('    Press Enter to skip (free tier — health check only).'));
        console.log(dim('    Get access: https://www.iwoszapar.com/second-brain-ai'));
        console.log('');
        const input = await ask(rl, '    Token: ');
        token = input.trim() || null;
        if (token && !token.startsWith('sbf_')) {
            console.log(yellow('    Warning: Token should start with "sbf_".'));
        }
    }

    const isPaid = !!token;

    // ── Validate token against Factory (if paid) ──
    if (isPaid) {
        try {
            const res = await fetch(`${REMOTE_MCP_URL.replace('/api/mcp', '/api/mcp/validate')}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
                console.log(`    ${green('Token validated successfully.')}`);
            } else if (res.status === 401) {
                console.log(yellow('    Warning: Token is invalid or expired.'));
                console.log(dim('    Check your purchase email or contact support.'));
            } else {
                console.log(dim('    Could not validate token (server unavailable). Continuing anyway.'));
            }
        } catch {
            console.log(dim('    Could not reach validation server. Continuing with offline setup.'));
        }
    }

    console.log(`\n    ${bold('Tier:')} ${isPaid ? green('Guide (paid)') : dim('Free tier')}`);

    // ── Configuration ──
    console.log(section('Configuration'));
    console.log('');

    let localResult = execClaude(['mcp', 'add', LOCAL_MCP_NAME, '--', 'npx', 'second-brain-health-check']);
    if (localResult !== null) {
        console.log(`    ${green('+')} ${LOCAL_MCP_NAME} ${dim('added')}`);
    } else {
        execClaude(['mcp', 'remove', LOCAL_MCP_NAME]);
        const retry = execClaude(['mcp', 'add', LOCAL_MCP_NAME, '--', 'npx', 'second-brain-health-check']);
        if (retry !== null) {
            console.log(`    ${green('+')} ${LOCAL_MCP_NAME} ${dim('(replaced)')}`);
        } else {
            console.log(`    ${yellow('~')} ${LOCAL_MCP_NAME} ${dim('may already be configured')}`);
        }
    }

    if (isPaid) {
        try {
            saveTokenToSettings(token);
            console.log(`    ${green('+')} Account configured ${dim('in .claude/settings.json')}`);
        } catch {
            console.log(`    ${yellow('~')} Token: ${dim('save manually: SBF_TOKEN=' + token)}`);
        }

        // ── .gitignore check ──
        const gitignorePath = join(process.cwd(), '.gitignore');
        if (existsSync(gitignorePath)) {
            const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
            if (!gitignoreContent.includes('.claude/settings.json') && !gitignoreContent.includes('.claude/')) {
                console.log(yellow('    Warning: .gitignore does not exclude .claude/settings.json'));
                console.log(yellow('    Your token may be committed to git. Add this line to .gitignore:'));
                console.log(dim('      .claude/settings.json'));
            }
        } else {
            console.log(yellow('    Warning: No .gitignore found. Your token in .claude/settings.json may be committed to git.'));
        }

        const header = `Authorization: Bearer ${token}`;
        execClaude(['mcp', 'remove', REMOTE_MCP_NAME]);
        const remoteResult = execClaude([
            'mcp', 'add', REMOTE_MCP_NAME, '--transport', 'http', '--url', REMOTE_MCP_URL, '--header', header
        ]);
        if (remoteResult !== null) {
            console.log(`    ${green('+')} ${REMOTE_MCP_NAME} ${dim('added')}`);
        } else {
            console.log(`    ${yellow('~')} ${REMOTE_MCP_NAME} ${dim('— add manually:')}`);
            console.log(dim(`      claude mcp add ${REMOTE_MCP_NAME} --transport http --url ${REMOTE_MCP_URL}`));
        }
    }

    // ── Profile ──
    console.log(section('Quick Profile'));
    console.log(dim('    3 questions to personalize your experience.\n'));

    const roleChoice = await askChoice(rl, 'Your role?', ROLES, 0);
    const expChoice = await askChoice(rl, 'Claude Code experience?', EXPERIENCE_LEVELS, 1);
    const goalChoices = await askMultiChoice(rl, 'Priorities? (pick all that apply)', GOALS);

    const profile = {
        role: roleChoice.key,
        experience: expChoice.key,
        goals: goalChoices.map(g => g.key),
        created_at: new Date().toISOString(),
    };

    // ── Health Check ──
    console.log(section('Health Check'));
    console.log('');

    let report = null;
    try {
        const { runHealthCheck } = await import('./health-check.js');
        report = await runHealthCheck(process.cwd());
        report.profile = profile;

        const overallMax = report.setup.maxPoints + report.usage.maxPoints + report.fluency.maxPoints;
        const overallPts = report.setup.totalPoints + report.usage.totalPoints + report.fluency.totalPoints;
        const overall = overallMax > 0 ? Math.round((overallPts / overallMax) * 100) : 0;
        const maturity = report.brainState?.maturity || 'unknown';
        const setupScore = report.setup?.normalizedScore ?? '?';
        const usageScore = report.usage?.normalizedScore ?? '?';
        const fluencyScore = report.fluency?.normalizedScore ?? '?';

        const scoreBar = (score) => {
            const filled = Math.round(score / 5);
            const empty = 20 - filled;
            return green('\u2588'.repeat(filled)) + dim('\u2591'.repeat(empty));
        };

        console.log(`    ${bold('Maturity:')}  ${cyan(maturity)}`);
        console.log(`    ${bold('Overall:')}   ${scoreBar(overall)} ${bold(overall + '%')}`);
        console.log('');
        console.log(`    Setup     ${scoreBar(setupScore)} ${setupScore}%`);
        console.log(`    Usage     ${scoreBar(usageScore)} ${usageScore}%`);
        console.log(`    Fluency   ${scoreBar(fluencyScore)} ${fluencyScore}%`);

        try {
            const jsonPath = join(process.cwd(), '.health-check.json');
            writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
            console.log(dim(`\n    Saved: ${jsonPath}`));
        } catch { /* non-critical */ }

        try {
            const { saveDashboard } = await import('./dashboard/generate.js');
            const dashPath = await saveDashboard(report);
            console.log(dim(`    Dashboard: ${dashPath}`));
            const { execFile } = await import('node:child_process');
            execFile('open', [dashPath], (err) => {
                if (err) execFile('xdg-open', [dashPath], () => {});
            });
        } catch { /* non-critical */ }
    } catch (err) {
        console.log(`    ${yellow('Could not run health check:')} ${err.message}`);
        console.log(dim('    Run later: ask Claude to use check_health'));
        try {
            const jsonPath = join(process.cwd(), '.health-check.json');
            let existing = {};
            if (existsSync(jsonPath)) {
                try { existing = JSON.parse(readFileSync(jsonPath, 'utf-8')); } catch { /* fresh */ }
            }
            existing.profile = profile;
            writeFileSync(jsonPath, JSON.stringify(existing, null, 2) + '\n');
        } catch { /* non-critical */ }
    }

    // ── Next Steps ──
    console.log(section('Next Steps'));
    console.log('');
    console.log(`    ${bold('In Claude Code, try:')}`);
    console.log('');
    const steps = getNextSteps(profile, isPaid);
    for (const step of steps) console.log('  ' + step);

    console.log('');
    console.log(dim('  ' + '\u2500'.repeat(64)));
    console.log('');

    rl.close();
}

// Only self-execute when run directly (not when imported by cli.js)
const isDirectRun = process.argv[1]?.endsWith('setup.js');
if (isDirectRun) {
    runSetup().catch((err) => {
        console.error(red(`Setup failed: ${err.message}`));
        process.exit(1);
    });
}
