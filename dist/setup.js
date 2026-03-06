#!/usr/bin/env node
/**
 * Setup CLI for Second Brain Health Check + MemoryOS.
 *
 * Flow:
 *   1. Banner + welcome
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
    { key: 'beginner',     label: 'Beginner \u2014 just getting started with Claude Code' },
    { key: 'intermediate', label: 'Intermediate \u2014 use it regularly' },
    { key: 'power_user',   label: 'Power User \u2014 custom skills, hooks, MCPs' },
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
function white(s) { return `\x1b[97m${s}\x1b[0m`; }
function greenBg(s) { return `\x1b[42m\x1b[30m${s}\x1b[0m`; }
function dimBg(s) { return `\x1b[100m\x1b[97m${s}\x1b[0m`; }

function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

function section(title, subtitle) {
    const line = '\u2500'.repeat(52 - title.length);
    let out = '\n  ' + bold(white(title)) + ' ' + dim(line);
    if (subtitle) out += '\n  ' + dim(subtitle);
    return out;
}

function box(lines, { padding = 2, border = 'dim' } = {}) {
    const pad = ' '.repeat(padding);
    const maxLen = Math.max(...lines.map(l => stripAnsi(l).length));
    const width = maxLen + padding * 2;
    const top = '\u250C' + '\u2500'.repeat(width) + '\u2510';
    const bot = '\u2514' + '\u2500'.repeat(width) + '\u2510';
    const wrap = border === 'dim' ? dim : (s) => s;
    const out = [];
    out.push('  ' + wrap(top));
    for (const line of lines) {
        const stripped = stripAnsi(line);
        const right = ' '.repeat(Math.max(0, maxLen - stripped.length));
        out.push('  ' + wrap('\u2502') + pad + line + right + pad + wrap('\u2502'));
    }
    out.push('  ' + wrap(bot));
    return out.join('\n');
}

function stripAnsi(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
    const { version } = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    );

    const art = `
  \x1b[1m\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
  \u2502  \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588    \u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588  \u2502
  \u2502  \u2588\u2588      \u2588\u2588      \u2588\u2588      \u2588\u2588    \u2588\u2588 \u2588\u2588\u2588\u2588   \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2502
  \u2502  \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588   \u2588\u2588      \u2588\u2588    \u2588\u2588 \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2502
  \u2502       \u2588\u2588 \u2588\u2588      \u2588\u2588      \u2588\u2588    \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2502
  \u2502  \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588   \u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588  \u2502
  \u2502                                                     \u2502
  \u2502              \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588   \u2588\u2588\u2588\u2588\u2588  \u2588\u2588 \u2588\u2588\u2588    \u2588\u2588    \u2502
  \u2502              \u2588\u2588   \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2588\u2588 \u2588\u2588\u2588\u2588   \u2588\u2588   \u2502
  \u2502              \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588 \u2588\u2588 \u2588\u2588  \u2588\u2588   \u2502
  \u2502              \u2588\u2588   \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588   \u2502
  \u2502              \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588   \u2588\u2588 \u2588\u2588   \u2588\u2588 \u2588\u2588 \u2588\u2588   \u2588\u2588\u2588\u2588   \u2502
  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1b[0m`;

    console.log(art);
    console.log('');
}

function printWelcome(version) {
    console.log(`  ${bold('MemoryOS')} ${dim(`v${version}`)} ${dim('\u2014 by Second Brain')}`);
    console.log('');
    console.log(`  ${dim('Context engineering quality scanner for Claude Code.')}`);
    console.log(`  ${dim('Scores 45 layers across setup, usage, and AI fluency.')}`);
    console.log('');
    console.log(`  ${dim('This setup takes ~2 minutes:')}`);
    console.log(`  ${dim('\u2460 Connect your account')}  ${dim('\u2461 Configure MCP')}  ${dim('\u2462 Quick profile')}  ${dim('\u2463 First scan')}`);
    console.log('');
    console.log('  ' + dim('\u2500'.repeat(56)));
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
                    process.stdout.write(`    ${green('>')} ${bold(white(options[i].label))}\n`);
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
        console.log(`    ${bold(white(question))}`);
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
                const check = checked.has(i) ? green('[\u2713]') : dim('[ ]');
                if (i === cursor) {
                    process.stdout.write(`    ${green('>')} ${check} ${bold(white(options[i].label))}\n`);
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
        console.log(`    ${bold(white(question))}`);
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
            const yLabel = yes ? greenBg(' Yes ') : dimBg(' Yes ');
            const nLabel = !yes ? greenBg(' No ') : dimBg(' No ');
            process.stdout.write(`    ${yLabel}  ${nLabel}\n`);
        }

        console.log(`\n    ${bold(white(question))}`);
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
    if (process.env.SBK_TOKEN) return process.env.SBK_TOKEN;
    if (process.env.SBF_TOKEN) return process.env.SBF_TOKEN;
    if (process.env.GUIDE_TOKEN) return process.env.GUIDE_TOKEN;
    const s = readClaudeSettings();
    return s?.data?.env?.SBK_TOKEN || s?.data?.env?.SBF_TOKEN || null;
}

function saveTokenToSettings(token) {
    const projectDir = join(process.cwd(), '.claude');
    const settingsPath = join(projectDir, 'settings.json');
    let data = {};
    if (existsSync(settingsPath)) {
        try { data = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* fresh */ }
    }
    if (!data.env) data.env = {};
    data.env.SBK_TOKEN = token;
    // Keep SBF_TOKEN for backwards compatibility
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
            lines.push(green('  \u25B6') + '  ' + white('"Run context_pressure to see what eats your context window"'));
            lines.push(green('  \u25B6') + '  ' + white('"Run audit_config to find dead references and security issues"'));
        } else if (role === 'content_creator' || role === 'sales') {
            lines.push(green('  \u25B6') + '  ' + white('"Run context_pressure to see what eats your context window"'));
            lines.push(green('  \u25B6') + '  ' + white('"Run upgrade_brain to improve my knowledge organization"'));
        } else if (role === 'founder' || role === 'ops') {
            lines.push(green('  \u25B6') + '  ' + white('"Run weekly_pulse to track my productivity trends"'));
            lines.push(green('  \u25B6') + '  ' + white('"Run context_pressure to see what eats your context window"'));
        } else {
            lines.push(green('  \u25B6') + '  ' + white('"Run context_pressure to see what eats your context window"'));
            lines.push(green('  \u25B6') + '  ' + white('"Run weekly_pulse to see my progress over time"'));
        }
        if (experience === 'beginner') {
            lines.push(green('  \u25B6') + '  ' + white('"Show me fix suggestions for my weakest area"'));
        } else {
            lines.push(green('  \u25B6') + '  ' + white('"Run upgrade_brain to level up my Second Brain"'));
        }
    } else {
        lines.push(green('  \u25B6') + '  ' + white('"Run check_health on this project"'));
        lines.push(green('  \u25B6') + '  ' + white('"Show me fix suggestions for my weakest area"'));
        lines.push(green('  \u25B6') + '  ' + white('"Generate a health dashboard"'));
        lines.push('');
        lines.push(dim('    Unlock all tools: https://www.iwoszapar.com/memory-os'));
    }

    return lines;
}

// ── Main Setup Flow ─────────────────────────────────────────────────────────

export async function runSetup() {
    // ── Non-interactive guard ──
    // Raw mode TUI requires a real terminal. When Claude Code runs this via
    // its Bash tool, stdin is piped and setRawMode() crashes (exit 13).
    if (!process.stdin.isTTY) {
        console.log('');
        console.log('  This is an interactive setup wizard that requires a terminal.');
        console.log('');
        console.log('  Run it directly in your terminal (not through Claude Code):');
        console.log('');
        console.log('    npx second-brain-health-check setup');
        console.log('');
        console.log('  It will ask you to paste a token from a MemoryOS purchase email,');
        console.log('  or press Enter for the free tier (4 tools).');
        console.log('');
        console.log('  Get MemoryOS: https://www.iwoszapar.com/memory-os');
        console.log('');
        process.exit(0);
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const { version } = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    );

    // ── Banner ──
    printBanner();
    printWelcome(version);

    // ── Prerequisites ──
    if (!claudeCliAvailable()) {
        console.log('');
        console.log(red('  \u2717 Claude Code CLI not found.'));
        console.log('');
        console.log('    Install it first:');
        console.log(bold('    https://docs.anthropic.com/en/docs/claude-code/overview'));
        console.log('');
        console.log(dim('    Or add manually to .claude/settings.json mcpServers.'));
        rl.close();
        process.exit(1);
    }

    // ── Authentication ──
    console.log(section('\u2460 Account', 'MemoryOS subscribers unlock 5 extra tools: context analysis, config audit,'));
    console.log(dim('  progress tracking, conversation import, and AI-powered upgrades.'));
    console.log('');

    const existingToken = findExistingToken();
    let token = existingToken;

    if (existingToken) {
        console.log(`    ${green('\u2713')} ${bold('Token found:')} ${dim(existingToken.slice(0, 12) + '...')}`);
        const keepToken = await askYesNo(rl, 'Use this token?', true);
        if (!keepToken) token = null;
    }

    if (!token) {
        console.log('');
        console.log(`    ${bold(white('Paste your token'))} ${dim('from the MemoryOS purchase email.')}`);
        console.log(dim('    No token? Press Enter for the free tier (4 tools).'));
        console.log(dim('    Get MemoryOS: https://www.iwoszapar.com/memory-os'));
        console.log('');
        const input = await ask(rl, `    ${bold('Token:')} `);
        token = input.trim() || null;
        if (token && !token.startsWith('sbf_') && !token.startsWith('sbk_')) {
            console.log(yellow('    \u26A0 Token usually starts with "sbf_" or "sbk_".'));
        }
    }

    const isPaid = !!token;

    // ── Validate token against Factory (if paid) ──
    if (isPaid) {
        process.stdout.write(dim('    Validating...'));
        try {
            const res = await fetch(`${REMOTE_MCP_URL.replace('/api/mcp', '/api/mcp/validate')}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(5000),
            });
            process.stdout.write(CLEAR_LINE);
            if (res.ok) {
                console.log(`    ${green('\u2713')} Token validated`);
            } else if (res.status === 401) {
                console.log(yellow('    \u26A0 Token invalid or expired. Check your purchase email.'));
            } else {
                console.log(dim('    Could not validate (server unavailable). Continuing.'));
            }
        } catch {
            process.stdout.write(CLEAR_LINE);
            console.log(dim('    Offline. Continuing with local setup.'));
        }
    }

    // ── Tier display ──
    console.log('');
    if (isPaid) {
        console.log(`    ${greenBg(' MEMORIOS ')} ${bold('All 9 tools unlocked')}`);
    } else {
        console.log(`    ${dimBg(' FREE ')} ${bold('4 tools')} ${dim('(check_health, fix suggestions, dashboard, PDF)')}`);
    }

    // ── Configuration ──
    console.log(section('\u2461 Configure MCP', 'Adding health check server to Claude Code.'));
    console.log('');

    let localResult = execClaude(['mcp', 'add', LOCAL_MCP_NAME, '--', 'npx', 'second-brain-health-check']);
    if (localResult !== null) {
        console.log(`    ${green('\u2713')} ${bold(LOCAL_MCP_NAME)} added`);
    } else {
        execClaude(['mcp', 'remove', LOCAL_MCP_NAME]);
        const retry = execClaude(['mcp', 'add', LOCAL_MCP_NAME, '--', 'npx', 'second-brain-health-check']);
        if (retry !== null) {
            console.log(`    ${green('\u2713')} ${bold(LOCAL_MCP_NAME)} ${dim('(replaced)')}`);
        } else {
            console.log(`    ${yellow('\u26A0')} ${LOCAL_MCP_NAME} ${dim('may already be configured')}`);
        }
    }

    if (isPaid) {
        try {
            saveTokenToSettings(token);
            console.log(`    ${green('\u2713')} Token saved ${dim('to .claude/settings.json')}`);
        } catch {
            console.log(`    ${yellow('\u26A0')} ${dim('Save manually: SBK_TOKEN=' + token)}`);
        }

        // ── .gitignore check ──
        const gitignorePath = join(process.cwd(), '.gitignore');
        if (existsSync(gitignorePath)) {
            const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
            if (!gitignoreContent.includes('.claude/settings.json') && !gitignoreContent.includes('.claude/')) {
                console.log(yellow('    \u26A0 .gitignore: add .claude/settings.json to protect your token'));
            }
        } else {
            console.log(yellow('    \u26A0 No .gitignore found. Token in .claude/settings.json may leak to git.'));
        }

        const header = `Authorization: Bearer ${token}`;
        execClaude(['mcp', 'remove', REMOTE_MCP_NAME]);
        const remoteResult = execClaude([
            'mcp', 'add', REMOTE_MCP_NAME, '--transport', 'http', '--url', REMOTE_MCP_URL, '--header', header
        ]);
        if (remoteResult !== null) {
            console.log(`    ${green('\u2713')} ${bold(REMOTE_MCP_NAME)} added ${dim('(remote)')}`);
        } else {
            console.log(`    ${yellow('\u26A0')} ${REMOTE_MCP_NAME} ${dim('\u2014 add manually:')}`);
            console.log(dim(`      claude mcp add ${REMOTE_MCP_NAME} --transport http --url ${REMOTE_MCP_URL}`));
        }
    }

    // ── Restart reminder ──
    console.log('');
    console.log(box([
        yellow('IMPORTANT') + white(': Restart Claude Code after setup completes.'),
        white('Close this terminal and open a new one for the'),
        white('MCP tools to become available.'),
    ]));

    // ── Profile ──
    console.log(section('\u2462 Quick Profile', '3 questions to personalize your experience.'));

    const roleChoice = await askChoice(rl, 'Your role?', ROLES, 0);
    const expChoice = await askChoice(rl, 'Claude Code experience?', EXPERIENCE_LEVELS, 1);
    const goalChoices = await askMultiChoice(rl, 'Priorities?', GOALS);

    const profile = {
        role: roleChoice.key,
        experience: expChoice.key,
        goals: goalChoices.map(g => g.key),
        created_at: new Date().toISOString(),
    };

    // ── Health Check ──
    console.log(section('\u2463 First Scan', 'Running 45-layer health check on your project.'));
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

        const gradeColor = (score) => {
            if (score >= 85) return green;
            if (score >= 50) return yellow;
            return red;
        };

        console.log(`    ${dim('Maturity')}  ${bold(white(maturity))}`);
        console.log(`    ${dim('Overall')}   ${scoreBar(overall)} ${gradeColor(overall)(bold(overall + '%'))}`);
        console.log('');
        console.log(`    ${dim('Setup')}     ${scoreBar(setupScore)} ${setupScore}%`);
        console.log(`    ${dim('Usage')}     ${scoreBar(usageScore)} ${usageScore}%`);
        console.log(`    ${dim('Fluency')}   ${scoreBar(fluencyScore)} ${fluencyScore}%`);

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
        console.log(`    ${yellow('\u26A0')} ${err.message}`);
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
    console.log(section('Ready', 'Try these in Claude Code:'));
    console.log('');
    const steps = getNextSteps(profile, isPaid);
    for (const step of steps) console.log('  ' + step);

    console.log('');
    console.log('  ' + dim('\u2500'.repeat(56)));
    console.log('');
    if (!isPaid) {
        console.log(`  ${dim('Upgrade to MemoryOS for all 9 tools:')} ${bold('iwoszapar.com/memory-os')}`);
    } else {
        console.log(`  ${dim('Support & docs:')} ${bold('iwoszapar.com/memory-os')}`);
    }
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
