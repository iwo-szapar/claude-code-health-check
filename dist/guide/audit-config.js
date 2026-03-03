/**
 * Guide Tool 7: audit_config
 *
 * Checks 5 categories: references, conflicts, security, unused, performance.
 * Reads CLAUDE.md, settings.json, .gitignore, .claude/*, memory/*.
 */
import { readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { resolveProjectRoot, readFileSafe, getMdFiles } from './utils.js';

const ALL_CATEGORIES = ['references', 'conflicts', 'security', 'unused', 'performance'];

async function checkReferences(rootPath, claudeMdContent) {
    const findings = [];
    if (!claudeMdContent) return findings;

    const pathPatterns = [
        /`([.\w/-]+\.\w+)`/g,
        /(?:Read|See|Refer to|Details in|Full docs:?)\s+[`"]?([.\w/-]+(?:\.\w+)?)[`"]?/gi,
    ];

    const checkedPaths = new Set();
    for (const pattern of pathPatterns) {
        let match;
        while ((match = pattern.exec(claudeMdContent)) !== null) {
            const refPath = match[1];
            if (refPath.includes('://') || refPath.startsWith('http') || refPath.includes('(') ||
                refPath.length < 3 || refPath.startsWith('npm ') || refPath.startsWith('git ') ||
                /^\d+\.\d+/.test(refPath) || refPath.includes('=')) continue;
            if (!refPath.includes('/') && !refPath.includes('.')) continue;
            if (checkedPaths.has(refPath)) continue;
            checkedPaths.add(refPath);

            try {
                await access(resolve(rootPath, refPath));
            } catch {
                const lines = claudeMdContent.split('\n');
                let lineNum = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(refPath)) { lineNum = i + 1; break; }
                }
                findings.push({
                    category: 'references',
                    severity: 'error',
                    message: `CLAUDE.md${lineNum ? ':' + lineNum : ''} references \`${refPath}\` \u2014 file not found`,
                });
            }
        }
    }

    // Check hook script paths
    const settingsContent = await readFileSafe(resolve(rootPath, '.claude', 'settings.json'));
    if (settingsContent) {
        try {
            const settings = JSON.parse(settingsContent);
            if (settings.hooks) {
                for (const [event, hookList] of Object.entries(settings.hooks)) {
                    if (!Array.isArray(hookList)) continue;
                    for (const hook of hookList) {
                        if (hook.command) {
                            const cmdMatch = hook.command.match(/(?:bash|sh|node|python)\s+["']?(\$CLAUDE_PROJECT_DIR\/[^\s"']+|[.\w/-]+\.(?:sh|js|py))["']?/);
                            if (cmdMatch) {
                                let scriptPath = cmdMatch[1].replace('$CLAUDE_PROJECT_DIR', rootPath);
                                try { await access(scriptPath); } catch {
                                    findings.push({
                                        category: 'references',
                                        severity: 'error',
                                        message: `Hook "${event}" references \`${cmdMatch[1]}\` \u2014 script not found`,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } catch { /* invalid JSON */ }
    }

    return findings;
}

async function checkConflicts(rootPath) {
    const findings = [];

    const claudeMdLocations = [];
    for (const loc of ['CLAUDE.md', '.claude/CLAUDE.md']) {
        try { await access(resolve(rootPath, loc)); claudeMdLocations.push(loc); } catch {}
    }
    if (claudeMdLocations.length > 1) {
        findings.push({ category: 'conflicts', severity: 'warning', message: `Multiple CLAUDE.md files: ${claudeMdLocations.join(', ')} \u2014 may cause confusion` });
    }

    // (fix: task-2916 — check both project-level and user-global configs for MCP conflicts)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configPaths = [
        resolve(rootPath, '.claude', 'settings.json'),
        resolve(rootPath, '.claude', 'settings.local.json'),
    ];
    if (homeDir) configPaths.push(resolve(homeDir, '.claude.json'));

    const allMcpServers = new Set();
    for (const configPath of configPaths) {
        const content = await readFileSafe(configPath);
        if (!content) continue;
        try {
            const settings = JSON.parse(content);
            if (settings.mcpServers) {
                for (const name of Object.keys(settings.mcpServers)) {
                    allMcpServers.add(name);
                }
            }
            if (settings.hooks) {
                for (const [event, hookList] of Object.entries(settings.hooks)) {
                    if (event === 'PreToolUse' && Array.isArray(hookList)) {
                        for (const hook of hookList) {
                            if (!hook.matcher && !hook.toolName) {
                                findings.push({ category: 'conflicts', severity: 'warning', message: 'PreToolUse hook without matcher \u2014 runs on EVERY tool call, may cause slowdowns' });
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    if (allMcpServers.has('filesystem')) {
        findings.push({ category: 'conflicts', severity: 'warning', message: 'MCP \'filesystem\' overlaps with native Read/Write \u2014 adds tool definitions with no benefit in Claude Code' });
    }

    return findings;
}

async function checkSecurity(rootPath) {
    const findings = [];

    const gitignore = await readFileSafe(resolve(rootPath, '.gitignore'));
    if (gitignore) {
        if (!gitignore.includes('.env')) {
            findings.push({ category: 'security', severity: 'error', message: '.env* not in .gitignore \u2014 risk of committing secrets' });
        }
    } else {
        findings.push({ category: 'security', severity: 'warning', message: 'No .gitignore found \u2014 secrets may be committed' });
    }

    // Scan for sensitive token patterns (long alphanumeric prefixed strings)
    const sensitiveChecks = [
        { regex: /sk-[a-zA-Z0-9]{20,}/, label: 'OpenAI API key' },
        { regex: /sk-ant-[a-zA-Z0-9]{20,}/, label: 'Anthropic API key' },
        { regex: /ghp_[a-zA-Z0-9]{20,}/, label: 'GitHub personal access token' },
        { regex: /xoxb-[a-zA-Z0-9-]{20,}/, label: 'Slack bot token' },
    ];

    // (fix: task-2916 — scan both project-level and user-global configs for exposed keys)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const filesToScan = [
        { path: resolve(rootPath, 'CLAUDE.md'), label: 'CLAUDE.md' },
        { path: resolve(rootPath, '.claude/settings.json'), label: 'settings.json' },
        { path: resolve(rootPath, '.claude/settings.local.json'), label: 'settings.local.json' },
    ];
    if (homeDir) {
        filesToScan.push({ path: resolve(homeDir, '.claude.json'), label: '~/.claude.json' });
    }

    for (const file of filesToScan) {
        const content = await readFileSafe(file.path);
        if (!content) continue;
        for (const check of sensitiveChecks) {
            if (check.regex.test(content)) {
                findings.push({ category: 'security', severity: 'error', message: `${file.label} contains what looks like a ${check.label} \u2014 move to .env` });
            }
        }
    }

    // Check for overly permissive settings across all config levels
    const settingsFiles = [
        resolve(rootPath, '.claude', 'settings.json'),
        resolve(rootPath, '.claude', 'settings.local.json'),
    ];
    if (homeDir) settingsFiles.push(resolve(homeDir, '.claude.json'));

    for (const settingsPath of settingsFiles) {
        const settingsContent = await readFileSafe(settingsPath);
        if (!settingsContent) continue;
        try {
            const settings = JSON.parse(settingsContent);
            const allowed = settings.permissions?.allow || settings.permissions?.allowedTools || [];
            if (Array.isArray(allowed)) {
                if (allowed.includes('*') || allowed.includes('Bash(*)')) {
                    findings.push({ category: 'security', severity: 'warning', message: 'allowedTools includes wildcard \u2014 all tools run without confirmation' });
                }
            }
        } catch {}
    }

    return findings;
}

async function checkUnused(rootPath) {
    const findings = [];
    const skillFiles = await getMdFiles(resolve(rootPath, '.claude', 'skills'));

    let invocations = new Set();
    const episodicDir = resolve(rootPath, 'memory', 'episodic');
    try {
        const entries = await readdir(episodicDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json') || entry.name.endsWith('.md'))) {
                const content = await readFileSafe(join(episodicDir, entry.name));
                if (content) {
                    for (const skill of skillFiles) {
                        const skillName = skill.name.replace('.md', '');
                        if (content.includes(skillName)) invocations.add(skillName);
                    }
                }
            }
        }
    } catch { /* no episodic dir */ }

    if (invocations.size > 0) {
        for (const skill of skillFiles) {
            const skillName = skill.name.replace('.md', '');
            if (!invocations.has(skillName)) {
                findings.push({ category: 'unused', severity: 'warning', message: `Skill '${skillName}' has 0 invocations in episodic logs` });
            }
        }
    }

    const agentFiles = await getMdFiles(resolve(rootPath, '.claude', 'agents'));
    if (agentFiles.length > 0 && invocations.size > 0) {
        for (const agent of agentFiles) {
            const agentName = agent.name.replace('.md', '');
            if (!invocations.has(agentName)) {
                findings.push({ category: 'unused', severity: 'info', message: `Agent '${agentName}' not found in episodic logs` });
            }
        }
    }

    return findings;
}

async function checkPerformance(rootPath, claudeMdContent) {
    const findings = [];

    if (claudeMdContent) {
        const lines = claudeMdContent.split('\n').length;
        if (lines > 300) {
            findings.push({ category: 'performance', severity: 'warning', message: `CLAUDE.md is ${lines} lines \u2014 consider splitting into .claude/docs/` });
        }
    }

    for (const memPath of ['memory/MEMORY.md', '.claude/memory/MEMORY.md', 'MEMORY.md']) {
        const mem = await readFileSafe(resolve(rootPath, memPath));
        if (mem) {
            const lines = mem.split('\n').length;
            if (lines > 180) {
                findings.push({ category: 'performance', severity: 'warning', message: `MEMORY.md is ${lines}/200 lines \u2014 ${200 - lines} lines from truncation` });
            }
            break;
        }
    }

    const settingsContent = await readFileSafe(resolve(rootPath, '.claude', 'settings.json'));
    if (settingsContent) {
        try {
            const settings = JSON.parse(settingsContent);
            if (settings.mcpServers) {
                const serverCount = Object.keys(settings.mcpServers).length;
                const toolEstimate = serverCount * 5;
                if (toolEstimate > 30) {
                    findings.push({ category: 'performance', severity: 'info', message: `~${toolEstimate} MCP tools registered (${serverCount} servers) \u2014 consider reducing to <30` });
                }
            }
        } catch {}
    }

    const skillFiles = await getMdFiles(resolve(rootPath, '.claude', 'skills'));
    if (skillFiles.length > 15) {
        findings.push({ category: 'performance', severity: 'info', message: `${skillFiles.length} skills registered \u2014 consider consolidating to <15` });
    }

    return findings;
}

export async function runAuditConfig(path, checkCategories) {
    const rootPath = await resolveProjectRoot(path);
    const categories = checkCategories && checkCategories.length > 0
        ? checkCategories.filter(c => ALL_CATEGORIES.includes(c))
        : ALL_CATEGORIES;

    const claudeMdContent = await readFileSafe(resolve(rootPath, 'CLAUDE.md'));

    const checkPromises = [];
    if (categories.includes('references')) checkPromises.push(checkReferences(rootPath, claudeMdContent));
    if (categories.includes('conflicts')) checkPromises.push(checkConflicts(rootPath));
    if (categories.includes('security')) checkPromises.push(checkSecurity(rootPath));
    if (categories.includes('unused')) checkPromises.push(checkUnused(rootPath));
    if (categories.includes('performance')) checkPromises.push(checkPerformance(rootPath, claudeMdContent));

    const results = await Promise.all(checkPromises);
    const allFindings = results.flat();

    // Config summary counts
    let claudeMdCount = 0;
    try { await access(resolve(rootPath, 'CLAUDE.md')); claudeMdCount++; } catch {}
    try { await access(resolve(rootPath, '.claude', 'CLAUDE.md')); claudeMdCount++; } catch {}

    let hookCount = 0;
    const allMcpServerNames = new Set();
    const homeDir2 = process.env.HOME || process.env.USERPROFILE || '';
    const summaryConfigPaths = [
        resolve(rootPath, '.claude', 'settings.json'),
        resolve(rootPath, '.claude', 'settings.local.json'),
    ];
    if (homeDir2) summaryConfigPaths.push(resolve(homeDir2, '.claude.json'));
    for (const cfgPath of summaryConfigPaths) {
        const cfgContent = await readFileSafe(cfgPath);
        if (!cfgContent) continue;
        try {
            const cfg = JSON.parse(cfgContent);
            if (cfg.mcpServers) { for (const name of Object.keys(cfg.mcpServers)) allMcpServerNames.add(name); }
            if (cfg.hooks) { hookCount += Object.values(cfg.hooks).flat().length; }
        } catch {}
    }
    const mcpCount = allMcpServerNames.size;
    const toolEstimate = mcpCount * 5;

    const skillFiles = await getMdFiles(resolve(rootPath, '.claude', 'skills'));
    const agentFiles = await getMdFiles(resolve(rootPath, '.claude', 'agents'));

    const errors = allFindings.filter(f => f.severity === 'error');
    const warnings = allFindings.filter(f => f.severity === 'warning');
    const infos = allFindings.filter(f => f.severity === 'info');

    const lines = [
        'CONFIGURATION AUDIT',
        '',
        `Config: ${claudeMdCount} CLAUDE.md | ${mcpCount} MCPs (~${toolEstimate} tools) | ${hookCount} hooks | ${skillFiles.length} skills | ${agentFiles.length} agents`,
    ];

    if (errors.length > 0) {
        lines.push('', `ERRORS (${errors.length}):`);
        for (const f of errors) lines.push(`  [${f.category}] ${f.message}`);
    }
    if (warnings.length > 0) {
        lines.push('', `WARNINGS (${warnings.length}):`);
        for (const f of warnings) lines.push(`  [${f.category}] ${f.message}`);
    }
    if (infos.length > 0) {
        lines.push('', `INFO (${infos.length}):`);
        for (const f of infos) lines.push(`  [${f.category}] ${f.message}`);
    }
    if (allFindings.length === 0) {
        lines.push('', 'No issues found. Configuration looks clean.');
    }

    lines.push('', `Summary: ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}, ${infos.length} info`);

    const unusedFindings = allFindings.filter(f => f.category === 'unused');
    if (unusedFindings.length > 0) {
        lines.push(`Recoverable: ~${(unusedFindings.length * 300).toLocaleString()} tokens by removing unused items`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
}
