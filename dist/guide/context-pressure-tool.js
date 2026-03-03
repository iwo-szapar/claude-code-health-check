/**
 * Guide Tool 6: context_pressure
 *
 * Analyzes token budget consumption across all context surfaces.
 * Reads CLAUDE.md, MEMORY.md, .claude/*, settings.json, skills.
 */
import { resolve } from 'node:path';
import { resolveProjectRoot, readFileSafe, estimateTokens, getMdFiles } from './utils.js';

const MODEL_CONTEXT_WINDOW = 200_000;
const TOKENS_PER_MCP_TOOL = 400;
const TOKENS_PER_SKILL = 300;
const SYSTEM_OVERHEAD_TOKENS = 1100;

export async function runContextPressure(path) {
    const rootPath = await resolveProjectRoot(path);
    const breakdown = [];
    let totalFixed = 0;
    const recommendations = [];

    // 1. CLAUDE.md
    const claudeMd = await readFileSafe(resolve(rootPath, 'CLAUDE.md'));
    const claudeMdTokens = claudeMd ? estimateTokens(claudeMd.length) : 0;
    breakdown.push({
        name: 'CLAUDE.md',
        tokens: claudeMdTokens,
        status: claudeMdTokens > 3000 ? '\u26A0' : 'OK',
        note: claudeMdTokens > 3000 ? `${claudeMd.length} chars \u2014 consider moving details to .claude/docs/` : null,
    });
    totalFixed += claudeMdTokens;

    // 2. MEMORY.md
    // (fix: task-2915 — also check Claude Code project-level auto-memory path)
    let memoryContent = null;
    const memorySearchPaths = ['memory/MEMORY.md', '.claude/memory/MEMORY.md', 'MEMORY.md'];
    // Claude Code stores project-level auto-memory at ~/.claude/projects/{hash}/memory/MEMORY.md
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
        const { readdir: readdirFs } = await import('node:fs/promises');
        const projectsDir = resolve(homeDir, '.claude', 'projects');
        try {
            const projectDirs = await readdirFs(projectsDir, { withFileTypes: true });
            for (const d of projectDirs) {
                if (d.isDirectory()) {
                    const candidatePath = resolve(projectsDir, d.name, 'memory', 'MEMORY.md');
                    const candidate = await readFileSafe(candidatePath);
                    if (candidate) {
                        memoryContent = candidate;
                        break;
                    }
                }
            }
        } catch { /* no projects dir */ }
    }
    if (!memoryContent) {
        for (const memPath of memorySearchPaths) {
            memoryContent = await readFileSafe(resolve(rootPath, memPath));
            if (memoryContent) break;
        }
    }
    const memoryTokens = memoryContent ? estimateTokens(memoryContent.length) : 0;
    const memoryLines = memoryContent ? memoryContent.split('\n').length : 0;
    breakdown.push({
        name: 'MEMORY.md',
        tokens: memoryTokens,
        status: memoryLines > 180 ? '\u26A0' : memoryTokens > 0 ? 'OK' : '-',
        note: memoryLines > 180 ? `${memoryLines}/200 lines \u2014 ${200 - memoryLines} lines from truncation` : null,
    });
    totalFixed += memoryTokens;
    if (memoryLines > 180) {
        recommendations.push({ action: 'Trim MEMORY.md stale sections', save: Math.round(memoryTokens * 0.3), time: '~5 min' });
    }

    // 3. Knowledge files
    const knowledgeFiles = [];
    for (const dir of ['.claude/docs', '.claude/knowledge']) {
        knowledgeFiles.push(...await getMdFiles(resolve(rootPath, dir)));
    }
    const knowledgeTokens = knowledgeFiles.reduce((sum, f) => sum + f.tokens, 0);
    breakdown.push({
        name: `Knowledge files (${knowledgeFiles.length})`,
        tokens: knowledgeTokens,
        status: knowledgeFiles.length > 10 ? '\u26A0' : knowledgeFiles.length > 0 ? 'OK' : '-',
        note: knowledgeFiles.length > 10 ? 'Consider consolidating or lazy-loading' : null,
    });
    totalFixed += knowledgeTokens;

    const largeKnowledge = knowledgeFiles.filter(f => f.tokens > 500).sort((a, b) => b.tokens - a.tokens);
    if (largeKnowledge.length > 3) {
        const lazyLoadSavings = largeKnowledge.slice(2).reduce((sum, f) => sum + f.tokens, 0);
        recommendations.push({ action: `Lazy-load ${largeKnowledge.length - 2} knowledge files`, save: lazyLoadSavings, time: '~10 min' });
    }

    // 4. MCP tools
    // (fix: task-2914 — also read user-global ~/.claude.json where MCP servers are typically configured)
    let mcpToolCount = 0;
    let mcpServerCount = 0;
    const mcpConfigPaths = [
        resolve(rootPath, '.claude/settings.json'),
        resolve(rootPath, '.claude/settings.local.json'),
    ];
    if (homeDir) {
        mcpConfigPaths.push(resolve(homeDir, '.claude.json'));
    }
    const seenServers = new Set();
    for (const configPath of mcpConfigPaths) {
        const content = await readFileSafe(configPath);
        if (content) {
            try {
                const settings = JSON.parse(content);
                if (settings.mcpServers) {
                    for (const name of Object.keys(settings.mcpServers)) {
                        if (!seenServers.has(name)) {
                            seenServers.add(name);
                            mcpServerCount++;
                            mcpToolCount += 5; // estimate ~5 tools per server
                        }
                    }
                }
            } catch { /* invalid JSON */ }
        }
    }
    const mcpTokens = mcpToolCount * TOKENS_PER_MCP_TOOL;
    breakdown.push({
        name: `MCP tools (~${mcpToolCount})`,
        tokens: mcpTokens,
        status: mcpToolCount > 30 ? '\u26A0' : mcpToolCount > 0 ? 'OK' : '-',
        note: mcpToolCount > 30 ? `${mcpServerCount} servers \u2014 consider reducing` : null,
    });
    totalFixed += mcpTokens;
    if (mcpToolCount > 30) {
        const removable = Math.round(mcpToolCount * 0.25);
        recommendations.push({ action: `Remove ~${removable} unused MCP tools`, save: removable * TOKENS_PER_MCP_TOOL, time: '~5 min' });
    }

    // 5. Skills
    const skillFiles = await getMdFiles(resolve(rootPath, '.claude', 'skills'));
    const skillTokens = skillFiles.length * TOKENS_PER_SKILL;
    breakdown.push({
        name: `Skills (${skillFiles.length})`,
        tokens: skillTokens,
        status: skillFiles.length > 15 ? '\u26A0' : skillFiles.length > 0 ? 'OK' : '-',
        note: skillFiles.length > 15 ? 'Many skills \u2014 consider consolidating' : null,
    });
    totalFixed += skillTokens;
    if (skillFiles.length > 15) {
        const removable = Math.round(skillFiles.length * 0.15);
        recommendations.push({ action: `Remove ${removable} unused skills`, save: removable * TOKENS_PER_SKILL, time: '~2 min' });
    }

    // 6. Hooks + settings
    const settingsContent = await readFileSafe(resolve(rootPath, '.claude', 'settings.json'));
    const hooksTokens = settingsContent ? estimateTokens(settingsContent.length) : 0;
    breakdown.push({ name: 'Hooks + settings', tokens: hooksTokens, status: 'OK', note: null });
    totalFixed += hooksTokens;

    // 7. System overhead
    breakdown.push({ name: 'System overhead', tokens: SYSTEM_OVERHEAD_TOKENS, status: 'Fixed', note: null });
    totalFixed += SYSTEM_OVERHEAD_TOKENS;

    // Sort recommendations by savings desc
    recommendations.sort((a, b) => b.save - a.save);
    const totalRecoverable = recommendations.reduce((sum, r) => sum + r.save, 0);

    // Build output
    const available = MODEL_CONTEXT_WINDOW - totalFixed;
    const usedPct = ((totalFixed / MODEL_CONTEXT_WINDOW) * 100).toFixed(1);
    const availPct = ((available / MODEL_CONTEXT_WINDOW) * 100).toFixed(1);

    const lines = [
        'CONTEXT PRESSURE ANALYSIS',
        '',
        `Model context window: ~${(MODEL_CONTEXT_WINDOW / 1000).toFixed(0)},000 tokens`,
        `Fixed overhead: ~${totalFixed.toLocaleString()} tokens (${usedPct}%)`,
        `Available for conversation: ~${available.toLocaleString()} tokens (${availPct}%)`,
        '',
        'BREAKDOWN:',
    ];

    for (const item of breakdown) {
        const pct = ((item.tokens / MODEL_CONTEXT_WINDOW) * 100).toFixed(1);
        const nameCol = item.name.padEnd(25);
        const tokenCol = `${item.tokens.toLocaleString()} tokens`.padEnd(16);
        const pctCol = `(${pct}%)`.padEnd(8);
        let line = `  ${nameCol} ${tokenCol} ${pctCol} ${item.status}`;
        if (item.note) line += ` ${item.note}`;
        lines.push(line);
    }

    if (recommendations.length > 0) {
        lines.push('');
        lines.push('RECOMMENDATIONS (by impact):');
        recommendations.forEach((r, i) => {
            const savePct = ((r.save / MODEL_CONTEXT_WINDOW) * 100).toFixed(1);
            lines.push(`${i + 1}. ${r.action} \u2014 save ~${r.save.toLocaleString()} tokens (${savePct}%) ${r.time}`);
        });
        lines.push('');
        const recPct = ((totalRecoverable / MODEL_CONTEXT_WINDOW) * 100).toFixed(1);
        lines.push(`Total recoverable: ~${totalRecoverable.toLocaleString()} tokens (${recPct}%)`);
    } else {
        lines.push('');
        lines.push('No immediate optimizations needed. Context budget looks healthy.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
}
