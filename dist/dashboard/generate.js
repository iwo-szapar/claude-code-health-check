/**
 * Dashboard Generator — Refined Brutalism + Terminal Pattern
 *
 * Self-contained HTML dashboard from health check results.
 * Design: DM Sans + Space Mono, B&W structure + semantic color (pass/warn/fail), 4px borders, zero border-radius.
 * Layout: Terminal-style scannable rows for all check layers.
 *
 * Based on iwoszapar.com design system (DESIGN_SYSTEM.md).
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { VERSION } from '../version.js';
import { getBrainVizHtml } from './brain-viz.js';

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getBarColor(points, maxPoints) {
    const pct = maxPoints > 0 ? (points / maxPoints) * 100 : 0;
    if (pct >= 60) return '#1a7a3a';
    if (pct >= 40) return '#b08800';
    return '#cf222e';
}

function getGradeColor(grade) {
    const g = String(grade).toLowerCase();
    if (['a', 'expert', 'active', 'b', 'proficient', 'growing'].includes(g)) return '#1a7a3a';
    if (['c', 'developing', 'starting', 'd', 'beginner', 'dormant'].includes(g)) return '#b08800';
    return '#cf222e';
}

function dotHtml(status) {
    const colors = { pass: '#1a7a3a', warn: '#b08800', fail: '#cf222e' };
    const label = status === 'pass' ? 'Passing' : status === 'warn' ? 'Warning' : 'Failing';
    return `<span role="img" aria-label="${label}" style="display:inline-block;width:10px;height:10px;min-width:10px;background:${colors[status] || '#cccccc'};flex-shrink:0;"></span>`;
}

/** Three-tier guided remediation hints for common fix titles */
const FIX_REMEDIATION = {
    'quality tracking active': {
        hint: 'Create <code>memory/quality-metrics.md</code> and log a dated entry after each work session.',
        minutes: 5,
        why: 'Tracking quality metrics over time shows the brain is improving, not just existing.',
        steps: ['Create memory/quality-metrics.md', 'Add a dated entry: "## 2026-02-19\\n- Sessions: 3\\n- Patterns learned: 1"', 'Update after each work session'],
    },
    'growth log populated': {
        hint: 'Create <code>memory/growth-log.md</code> with dated entries tracking what your brain learned each week.',
        minutes: 5,
        why: 'A growth log creates a compound learning record — you can see what your brain learned over weeks and months.',
        steps: ['Create memory/growth-log.md', 'Add weekly entries: "## Week of Feb 17\\n- Learned: hook patterns for safety\\n- Added: 2 new skills"', 'Review monthly for patterns'],
    },
    'activity spans multiple days': {
        hint: 'Use your Second Brain across multiple days. Session diversity matters more than session count.',
        minutes: 5,
        why: 'A brain used once is an experiment. A brain used daily is a system. Multi-day activity proves compounding.',
        steps: ['Use your brain for at least one task today', 'Come back tomorrow and use it again', 'After 3+ days, this check passes automatically'],
    },
    'codex compatibility': {
        hint: 'Run <code>mkdir -p .codex/skills</code> and symlink or copy your Claude skills there.',
        minutes: 5,
        why: 'Codex compatibility means your skills work across multiple AI coding tools, not just Claude.',
        steps: ['Run: mkdir -p .codex/skills', 'Copy or symlink your .claude/skills/ files to .codex/skills/', 'Verify with: ls .codex/skills/'],
    },
    'style/voice files populated': {
        hint: 'Add files to <code>memory/style-voice/</code> or <code>memory/personal/</code> describing your writing voice, communication preferences, or company context.',
        minutes: 10,
        why: 'Voice files let the AI match your communication style — emails, docs, and messages sound like you.',
        steps: ['Create memory/style-voice/ directory', 'Add a voice.md describing your writing style (tone, vocabulary, pet peeves)', 'Add examples of your best writing as reference'],
    },
    'memory files evolving': {
        hint: 'Edit existing memory files as you learn new things. A static brain is a dead brain.',
        minutes: 5,
        why: 'Memory evolution is the signal that compound learning is working. Static memory means no learning.',
        steps: ['Open any memory file that has not been updated recently', 'Add or update entries based on recent work', 'The system detects file modification dates — just saving counts'],
    },
    'auto memory populated': {
        hint: 'Use Claude Code regularly. Auto-memory fills itself as patterns emerge across sessions.',
        minutes: 5,
        why: 'Auto-memory captures patterns you would otherwise forget. It builds itself through regular use.',
        steps: ['Use Claude Code for a few tasks', 'Check ~/.claude/ for auto-generated memory files', 'Review and curate the auto-captured patterns periodically'],
    },
    'tracking files present': {
        hint: 'Create <code>brain-health/growth-log.md</code> and <code>brain-health/quality-metrics.md</code> to track your brain\'s evolution.',
        minutes: 5,
        why: 'Without tracking files, you cannot measure improvement. What gets measured gets managed.',
        steps: ['Run: mkdir -p brain-health', 'Create brain-health/growth-log.md with a dated first entry', 'Create brain-health/quality-metrics.md with baseline metrics'],
    },
    'config size': {
        hint: 'Audit <code>~/.claude.json</code> and <code>.claude/settings.local.json</code> for stale entries. Remove permissions you no longer need.',
        minutes: 5,
        why: 'Bloated config files slow down session startup and can contain stale permissions.',
        steps: ['Open ~/.claude.json and review each entry', 'Remove permissions for tools or paths you no longer use', 'Check .claude/settings.local.json for duplicates'],
    },
    'stale permission patterns': {
        hint: 'Run <code>claude permissions reset</code> or manually prune unused patterns from settings files.',
        minutes: 5,
        why: 'Stale permissions create security surface area for no benefit.',
        steps: ['Run: claude permissions reset', 'Or manually edit .claude/settings.json to remove old Allow patterns', 'Keep only permissions you actively use'],
    },
    'hook health validation': {
        hint: 'Add <code>|| true</code> after <code>grep</code> and <code>find</code> commands in hook scripts using <code>set -e</code>.',
        minutes: 5,
        why: 'Hooks with set -e that call grep/find will crash on no-match. Adding || true prevents false failures.',
        steps: ['Find all hook scripts in .claude/hooks/', 'Search for grep or find commands', 'Add || true after each to prevent exit on no-match'],
    },
    'pattern confidence tracking': {
        hint: 'Add HIGH/MEDIUM/LOW confidence labels to your <code>_pattern-tracker.md</code> entries.',
        minutes: 5,
        why: 'Confidence tracking separates proven patterns from hunches. It prevents acting on unverified assumptions.',
        steps: ['Open your pattern tracker file', 'Add confidence: HIGH/MEDIUM/LOW to each pattern', 'Promote patterns from LOW to HIGH as they prove themselves'],
    },
    'settings permission leaks': {
        hint: 'Remove API keys and tokens from permission allow-lists in settings files.',
        minutes: 5,
        why: 'API keys in permission lists are a security risk — they can be exposed in git history.',
        steps: ['Search settings files for patterns containing api_key, token, secret', 'Remove any that appear in Allow lists', 'Move secrets to .env files (which should be gitignored)'],
    },
    'memory dir with subdirectories': {
        hint: 'Create subdirectories in <code>memory/</code>: semantic/, episodic/, personal/, style-voice/.',
        minutes: 10,
        why: 'A flat memory directory becomes unsearchable. Subdirectories give the AI structured retrieval paths.',
        steps: ['Run: mkdir -p memory/semantic/patterns memory/episodic/sessions memory/personal', 'Move existing files into appropriate subdirectories', 'Add index.md to each directory explaining its purpose'],
    },
    'patterns directory': {
        hint: 'Run <code>mkdir -p memory/semantic/patterns</code> to store learned patterns.',
        minutes: 5,
        why: 'Patterns are the highest-value memory type — reusable knowledge that compounds across sessions.',
        steps: ['Run: mkdir -p memory/semantic/patterns', 'Create your first pattern file based on a recent lesson learned', 'Reference patterns from CLAUDE.md or skills'],
    },
    'index files for navigation': {
        hint: 'Add <code>index.md</code> files to your top-level knowledge directories so the agent can navigate.',
        minutes: 5,
        why: 'Index files are progressive disclosure for AI — they tell the agent what is in each directory without loading everything.',
        steps: ['Add index.md to memory/, .claude/docs/, and any knowledge directories', 'List the contents and purpose of each file in the directory', 'Reference these indexes from CLAUDE.md'],
    },
    'brain health directory': {
        hint: 'Run <code>mkdir brain-health</code> and add tracking files for growth metrics.',
        minutes: 5,
        why: 'A brain-health directory enables self-monitoring — the brain can track its own improvement.',
        steps: ['Run: mkdir brain-health', 'Create growth-log.md and quality-metrics.md', 'Run health check periodically and log the scores'],
    },
    'getting started guide': {
        hint: 'Create a <code>README.md</code> or <code>ONBOARDING_SUMMARY.md</code> at your project root.',
        minutes: 5,
        why: 'A getting started guide helps teammates (and future-you) understand the brain quickly.',
        steps: ['Create README.md at your project root', 'Explain what this brain does and who it is for', 'List the key commands and skills available'],
    },
    'agent configuration': {
        hint: 'Create <code>.claude/agents/</code> with .md files defining specialized agent personas.',
        minutes: 15,
        why: 'Custom agents let you delegate complex tasks to specialized AI personas with focused instructions.',
        steps: ['Run: mkdir -p .claude/agents', 'Create a .md file for each agent role (e.g., reviewer.md, researcher.md)', 'Define each agent\'s purpose, tools, and constraints in the file'],
    },
    'external doc references': {
        hint: 'Add "Read X before working on Y" tables in CLAUDE.md pointing to docs/ files.',
        minutes: 10,
        why: 'External doc references implement progressive disclosure — CLAUDE.md stays lean while deep context is discoverable.',
        steps: ['Create a table in CLAUDE.md: | Area | Read This File |', 'Add rows mapping work areas to .claude/docs/ files', 'Move detailed context from CLAUDE.md into those doc files'],
    },
    'skills reference knowledge dirs': {
        hint: 'Update skill instructions to reference <code>memory/</code>, <code>docs/</code>, or <code>patterns/</code> directories.',
        minutes: 10,
        why: 'Context-aware skills pull from your knowledge base instead of relying on inline instructions.',
        steps: ['Open each skill in .claude/skills/', 'Add instructions like "Read memory/semantic/patterns/ before executing"', 'Reference specific knowledge files relevant to the skill\'s domain'],
    },
};

/** Short explanations for layer names shown as tooltips on hover */
const LAYER_DESCRIPTIONS = {
    'MCP Server Health': 'MCP = Model Context Protocol. These are tools Claude can call — databases, APIs, calendars, etc. More servers = more things Claude can do for you.',
    'MCP Security': 'MCP servers often need API keys (secrets) to access services. This checks those keys aren\'t stored where they could leak.',
    'Settings Hierarchy': 'Claude reads settings from multiple files — global, project, and local. This checks they\'re layered correctly and not contradicting each other.',
    'PRP / Implementation Blueprints': 'PRP = Product Requirements + Plan. A structured brief you give Claude before a big task so it understands scope, constraints, and steps before writing code.',
    'Plugin Coverage': 'Plugins extend Claude\'s capabilities. This checks which categories (code, data, browsing, etc.) you have covered.',
    'Context Pressure': 'Claude has a fixed attention window. This checks your CLAUDE.md and imported files aren\'t so large they crowd out the actual work.',
    'Attribution & Display': 'How Claude signs its outputs — useful for team setups where you need to know which responses came from AI.',
    'Spec & Planning Artifacts': 'Written specs and plans you create before asking Claude to build something. Reduces back-and-forth.',
    'Interaction Configuration': 'Settings that control how Claude behaves — response style, verbosity, asking for confirmation, etc.',
    'Rules System': 'Persistent rules Claude follows in every session — your "always do X, never do Y" constraints.',
    'Permissions Audit': 'Which file paths and tools Claude is allowed to touch. This checks for overly broad or stale permissions.',
    'Sandbox Config': 'Whether Claude runs in an isolated environment to prevent unintended side effects.',
    'Brain Health Infrastructure': 'Files that track how your brain is improving over time — quality metrics, growth logs, pattern confidence scores.',
    'Reference Integrity': 'Checks that file paths mentioned in your CLAUDE.md and skills actually exist. Broken paths mean Claude follows dead links.',
    'Progressive Disclosure': 'Is CLAUDE.md short and scannable, with detail discoverable in linked files? Or is everything crammed into one giant file?',
    'Skill Orchestration': 'Do your skills call each other and share context, or is each skill an island?',
    'Context-Aware Skills': 'Skills that read from your memory and knowledge base before acting — not just static prompts.',
    'Delegation Patterns': 'Evidence that you\'re using Claude for complex multi-step tasks, not just one-shot questions.',
    'Interview & Spec Patterns': 'Evidence that Claude asks clarifying questions before starting work, and creates specs before building.',
    'Compound Evidence': 'Signs that each session builds on previous ones — growing memory, evolving patterns, maturing skills.',
    'Directory Structure': 'How your files and folders are organized. Good structure helps Claude find things fast without reading everything.',
    'Personalization Depth': 'How well your setup reflects YOUR specific role, industry, and workflow — not a generic template.',
    'Team Readiness': 'Whether your setup supports multiple Claude instances working together on shared projects.',
    'Workflow Maturity': 'How sophisticated your automated workflows are — from basic skills to multi-step command chains.',
    'Memory Evolution': 'Whether your memory files change over time. A growing memory means the brain is actually learning.',
    'Gitignore Hygiene': 'Whether sensitive files (passwords, API keys, personal settings) are protected from accidentally being shared.',
    'Environment Variables': 'Configuration for API keys, performance settings, and backend selection. Misconfiguration can cause failures or security issues.',
    'CLAUDE.md Quality': 'Your CLAUDE.md is the brain\'s instruction manual. Quality = clear structure, useful references, not too long, not too short.',
    'Model Configuration': 'Which AI model Claude uses and how it\'s configured — affects cost, speed, and capability.',
};

function getLayerDescription(layerName) {
    return LAYER_DESCRIPTIONS[layerName] || null;
}

function getRemediation(title) {
    const key = title.toLowerCase();
    for (const [pattern, data] of Object.entries(FIX_REMEDIATION)) {
        if (key.includes(pattern)) return data;
    }
    return null;
}

/* ═══════════════════════════════════════════════
   Terminal-style dimension rendering
   Each layer = one compact scannable row.
   Click to expand checks inline.
   ═══════════════════════════════════════════════ */

function renderDimension(dim, label, dimId) {
    if (!dim) return '';

    const rawPct = dim.maxPoints > 0 ? Math.round((dim.totalPoints / dim.maxPoints) * 100) : 0;
    const gradeColor = getGradeColor(dim.grade);
    const normalizedDisplay = dim.normalizedScore || rawPct;
    const layers = dim.layers || [];
    const issues = layers.reduce((n, l) => {
        const p = l.maxPoints > 0 ? Math.round((l.points / l.maxPoints) * 100) : 0;
        return n + (p < 70 ? 1 : 0);
    }, 0);

    let rowsHtml = '';
    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        const layerPct = layer.maxPoints > 0 ? Math.round((layer.points / layer.maxPoints) * 100) : 0;
        const status = layerPct >= 70 ? 'pass' : layerPct >= 40 ? 'warn' : 'fail';
        const rowId = `row-${dimId}-${li}`;

        let checksHtml = '';
        for (const check of (layer.checks || [])) {
            checksHtml += `
                <div style="display:flex;align-items:flex-start;gap:8px;padding:3px 0;font-size:11px;color:#595959;line-height:1.5;">
                    <span style="display:inline-block;width:6px;height:6px;min-width:6px;margin-top:5px;background:${check.status === 'pass' ? '#1a7a3a' : check.status === 'warn' ? '#b08800' : '#cf222e'};"></span>
                    <span style="flex:1;">${escapeHtml(check.message)}</span>
                    <span style="color:#767676;font-family:'Space Mono',monospace;font-size:10px;white-space:nowrap;">${check.points}/${check.maxPoints}</span>
                </div>`;
        }

        rowsHtml += `
        <div class="term-row" id="${rowId}" role="button" tabindex="0" aria-expanded="false" onclick="(function(){var el=document.getElementById('${rowId}');var open=el.classList.toggle('open');el.setAttribute('aria-expanded',open)})()" onkeydown="(function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();var el=document.getElementById('${rowId}');var open=el.classList.toggle('open');el.setAttribute('aria-expanded',open)}})(event)">
            <div style="display:grid;grid-template-columns:14px 1fr 100px 44px;align-items:center;gap:8px;padding:12px 0;min-height:44px;">
                ${dotHtml(status)}
                <span style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:#000;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"${getLayerDescription(layer.name) ? ` title="${escapeHtml(getLayerDescription(layer.name))}"` : ''}>${escapeHtml(layer.name)}${getLayerDescription(layer.name) ? ' <span style="color:#767676;font-size:9px;cursor:help;" title="' + escapeHtml(getLayerDescription(layer.name)) + '">ⓘ</span>' : ''}</span>
                <span style="height:4px;background:#e5e5e5;position:relative;"><span style="position:absolute;left:0;top:0;height:100%;width:${layerPct}%;background:${layerPct >= 60 ? '#1a7a3a' : layerPct >= 40 ? '#b08800' : '#cf222e'};"></span></span>
                <span style="text-align:right;font-family:'Space Mono',monospace;font-size:10px;color:#767676;">${layerPct}%</span>
            </div>
            <div class="term-checks">${checksHtml}</div>
        </div>`;
    }

    return `
    <div style="margin-top:32px;">
        <div style="display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:4px solid #000;">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#000;flex:1;font-family:'Space Mono',monospace;">${escapeHtml(label)}</span>
            ${issues > 0 ? `<span style="font-family:'Space Mono',monospace;font-size:10px;color:#767676;">${issues} issue${issues !== 1 ? 's' : ''}</span>` : ''}
            <span style="font-size:10px;font-weight:700;padding:3px 8px;border:2px solid ${gradeColor};color:${gradeColor};font-family:'Space Mono',monospace;">${escapeHtml(dim.grade)}</span>
            <span style="font-size:16px;font-weight:700;color:#000;font-family:'Space Mono',monospace;">${normalizedDisplay}<span style="font-size:11px;color:#767676;">/100</span></span>
        </div>
        ${rowsHtml}
    </div>`;
}

function renderTopFixes(fixes) {
    if (!fixes || fixes.length === 0) return '';

    let rowsHtml = '';
    for (let i = 0; i < fixes.length; i++) {
        const fix = fixes[i];
        const num = String(i + 1).padStart(2, '0');

        const remediation = getRemediation(fix.title);
        let remediationHtml = '';
        if (remediation) {
            const timeHtml = remediation.minutes
                ? `<span style="color:#000;font-size:10px;margin-left:8px;font-family:'Space Mono',monospace;">~${remediation.minutes} min</span>`
                : '';
            const whyHtml = remediation.why
                ? `<div style="font-size:11px;color:#595959;margin-top:4px;font-style:italic;">${escapeHtml(remediation.why)}</div>`
                : '';
            const stepsHtml = remediation.steps
                ? `<details style="margin-top:6px;"><summary style="font-size:10px;color:#000;font-family:'Space Mono',monospace;cursor:pointer;text-transform:uppercase;letter-spacing:.08em;">Step-by-step guide</summary><ol style="font-size:11px;color:#595959;margin:6px 0 0 16px;line-height:1.8;">${remediation.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol></details>`
                : '';
            remediationHtml = `<div style="font-size:11px;color:#595959;margin-top:6px;padding:10px 12px;background:#f5f5f5;border-left:4px solid #000;line-height:1.6;">${remediation.hint}${timeHtml}${whyHtml}${stepsHtml}</div>`;
        }

        rowsHtml += `
        <div style="display:flex;align-items:flex-start;gap:20px;padding:16px 20px;border-top:2px solid #000;">
            <span style="font-size:18px;font-weight:700;color:#ccc;flex-shrink:0;width:30px;font-family:'Space Mono',monospace;">${num}</span>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
                    <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#000;font-family:'DM Sans',sans-serif;">${escapeHtml(fix.title)}</span>
                    <span style="font-size:10px;padding:2px 8px;border:2px solid #000;color:#000;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;font-family:'Space Mono',monospace;">${escapeHtml(fix.impact)}</span>
                </div>
                <p style="font-size:12px;color:#595959;margin:0;line-height:1.6;">${escapeHtml(fix.description)}</p>
                ${remediationHtml}
            </div>
        </div>`;
    }

    return `
    <div style="border:4px solid #000;margin-top:32px;overflow:hidden;background:#fff;">
        <div style="background:#000;padding:14px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#fff;font-family:'Space Mono',monospace;">Top Fixes &mdash; Highest Impact</div>
        ${rowsHtml}
    </div>`;
}

function renderUpgradePanel(report) {
    const overallPct = Math.round(
        (report.setup.normalizedScore + report.usage.normalizedScore + (report.fluency?.normalizedScore || 0)) /
        (report.fluency ? 3 : 2)
    );
    const topFixes = report.topFixes || [];
    if (overallPct === 0 || overallPct >= 85 || topFixes.length === 0) return '';

    const isBuyer = report.brainState?.isBuyer || false;
    const highFixes = topFixes.filter(f => f.impact === 'high');
    const medFixes = topFixes.filter(f => f.impact === 'medium');
    const lowFixes = topFixes.filter(f => f.impact === 'low');

    const estimatedFiles = Math.max(
        highFixes.length * 2 + medFixes.length + Math.ceil(lowFixes.length / 2),
        1
    );
    const delta = Math.min(highFixes.length * 4 + medFixes.length * 2 + lowFixes.length, 30);
    const projected = Math.min(overallPct + delta, 95);

    const fileItems = topFixes.slice(0, 4).map(fix => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,0,0,.1);">
            <span style="width:7px;height:7px;border-radius:50%;background:${fix.impact === 'high' ? '#000' : '#999'};flex-shrink:0;"></span>
            <span style="font-size:11px;color:#000;font-family:'Space Mono',monospace;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(fix.title)}</span>
            <span style="font-size:9px;font-weight:700;padding:2px 5px;border:2px solid ${fix.impact === 'high' ? '#000' : '#999'};color:${fix.impact === 'high' ? '#000' : '#999'};text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;font-family:'Space Mono',monospace;">${escapeHtml(fix.impact)}</span>
        </div>`).join('');

    const moreHtml = topFixes.length > 4
        ? `<p style="font-size:10px;color:#999;margin:8px 0 0;font-family:'Space Mono',monospace;">+ ${topFixes.length - 4} more fixes</p>`
        : '';

    const ctaHtml = isBuyer
        ? `<div style="margin-top:16px;">
            <div style="font-size:10px;color:#595959;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-family:'Space Mono',monospace;">Run in Claude Code</div>
            <code style="display:block;background:#f5f5f5;padding:10px 14px;font-size:12px;border:2px solid #000;font-family:'Space Mono',monospace;cursor:pointer;" title="Click to copy" onclick="navigator.clipboard.writeText('upgrade_brain')">upgrade_brain</code>
            <code style="display:block;background:#f5f5f5;padding:8px 14px;font-size:12px;border:2px solid #e0e0e0;border-top:none;font-family:'Space Mono',monospace;cursor:pointer;color:#595959;" title="Click to copy" onclick="navigator.clipboard.writeText('upgrade_brain dry-run')">upgrade_brain dry-run</code>
           </div>`
        : `<div style="margin-top:16px;">
            <a href="https://www.iwoszapar.com/memory-os" style="display:block;padding:13px 20px;background:#000;color:#fff;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;text-decoration:none;border:4px solid #000;font-family:'Space Mono',monospace;" class="hover-brutal">Unlock upgrade_brain &rarr;</a>
            <p style="font-size:10px;color:#999;margin:8px 0 0;text-align:center;font-family:'Space Mono',monospace;">memory-os &middot; $99/yr</p>
           </div>`;

    return `
    <div style="border:4px solid #000;margin-top:28px;overflow:hidden;background:#fff;">
        <div style="background:#000;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#fff;font-family:'Space Mono',monospace;">Upgrade Available</span>
            <span style="font-size:14px;font-weight:700;color:#fff;font-family:'DM Sans',sans-serif;">${overallPct}%&nbsp;&nbsp;<span style="opacity:.4;">&#8594;</span>&nbsp;&nbsp;${projected}%&nbsp;<span style="opacity:.5;font-size:11px;font-weight:400;">(+${projected - overallPct}&nbsp;pts)</span></span>
        </div>
        <div class="upgrade-grid" style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:28px;">
            <div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#595959;margin-bottom:12px;font-family:'Space Mono',monospace;">${estimatedFiles} files ready to generate</div>
                ${fileItems}
                ${moreHtml}
            </div>
            <div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#595959;margin-bottom:12px;font-family:'Space Mono',monospace;">Personalized for your brain</div>
                <p style="font-size:12px;color:#595959;line-height:1.75;margin:0;">upgrade_brain compares your brain to the ideal state for your tier, generates the missing files with your profile data, and applies on your confirmation.</p>
                ${ctaHtml}
            </div>
        </div>
    </div>`;
}

function renderRadarChart(cePatterns) {
    const cx = 200, cy = 160, r = 100;
    const n = cePatterns.length;
    if (n < 3) return '';

    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    function polarToXY(pct, i) {
        const angle = startAngle + i * angleStep;
        const dist = (pct / 100) * r;
        return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
    }

    let gridLines = '';
    for (const ring of [25, 50, 75, 100]) {
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(polarToXY(ring, i).join(','));
        gridLines += `<polygon points="${pts.join(' ')}" fill="none" stroke="#e5e5e5" stroke-width="1"/>`;
    }

    let axes = '';
    for (let i = 0; i < n; i++) {
        const [x, y] = polarToXY(100, i);
        axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e5e5e5" stroke-width="1"/>`;
    }

    const dataPts = cePatterns.map((p, i) => polarToXY(Math.max(p.percentage, 2), i).join(',')).join(' ');

    let labels = '';
    const labelR = r + 28;
    for (let i = 0; i < n; i++) {
        const angle = startAngle + i * angleStep;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        const shortName = cePatterns[i].name
            .replace('Three-Layer ', '').replace(' Protocol', '').replace(' as ', ' ')
            .replace('Knowledge Files RAM', 'Knowledge Files').replace('Progressive Disclosure', 'Disclosure')
            .replace('Compound Learning', 'Compound').replace('Context Surfaces', 'Surfaces')
            .replace('Self-Correction', 'Self-Correct').replace('Hooks Guardrails', 'Hooks');
        labels += `<text x="${lx}" y="${ly}" fill="#000" font-size="11" font-weight="700" text-anchor="${anchor}" dominant-baseline="middle" font-family="'Space Mono',monospace">${escapeHtml(shortName)}</text>`;
    }

    return `<svg viewBox="-80 0 480 320" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 16px;width:100%;max-width:480px;height:auto;">
        ${gridLines}${axes}
        <polygon points="${dataPts}" fill="rgba(26,122,58,0.08)" stroke="#1a7a3a" stroke-width="2"/>
        ${labels}
    </svg>`;
}

function renderCEPatterns(cePatterns) {
    if (!cePatterns || cePatterns.length === 0) return '';

    const radarSvg = renderRadarChart(cePatterns);

    let patternsHtml = '';
    for (const p of cePatterns) {
        if (p.maxScore === 0) continue;
        const barColor = p.percentage >= 70 ? '#1a7a3a' : p.percentage >= 40 ? '#b08800' : '#cf222e';
        patternsHtml += `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:2px solid #e5e5e5;">
            <span style="font-size:12px;color:#000;font-weight:500;flex:1;min-width:0;font-family:'DM Sans',sans-serif;">${escapeHtml(p.name)}</span>
            <div style="width:120px;height:4px;background:#e5e5e5;flex-shrink:0;"><div style="height:100%;width:${p.percentage}%;background:${barColor};"></div></div>
            <span style="font-size:12px;color:#000;width:40px;text-align:right;flex-shrink:0;font-weight:700;font-family:'Space Mono',monospace;">${p.percentage}%</span>
        </div>`;
    }

    return `
    <div style="border:4px solid #000;margin-top:32px;overflow:hidden;background:#fff;">
        <div style="background:#000;padding:14px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#fff;font-family:'Space Mono',monospace;">Context Engineering Patterns</div>
        <div style="padding:16px 20px;">
            <div style="font-size:12px;color:#595959;margin-bottom:12px;font-family:'DM Sans',sans-serif;">Context Engineering (CE) = the practice of designing what AI knows about you and your work. These 7 patterns determine how effectively your AI assistant can help you.</div>
            ${radarSvg}
            ${patternsHtml}
        </div>
    </div>`;
}

function renderJourneyStage(overallPct) {
    const stages = [
        { min: 0,  label: 'BLANK SLATE',     desc: 'You have a repo. Not much else.' },
        { min: 25, label: 'SCAFFOLDED',       desc: 'Structure exists. CLAUDE.md and skills configured.' },
        { min: 55, label: 'PRACTICING',       desc: 'Regular usage. Patterns starting to form.' },
        { min: 72, label: 'COMPOUNDING',      desc: 'Memory grows between sessions. AI knows your context.' },
        { min: 88, label: 'PRODUCTION-GRADE', desc: 'Self-improving system. Hooks, reviews, compound loops.' },
    ];

    let currentIdx = 0;
    for (let i = stages.length - 1; i >= 0; i--) {
        if (overallPct >= stages[i].min) { currentIdx = i; break; }
    }

    const nextStage = currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
    const nextText = nextStage
        ? `The jump from <span style="color:#000;font-weight:700;">${stages[currentIdx].label}</span> to <span style="color:#000;font-weight:700;">${nextStage.label}</span> is usually about the areas where you scored lowest. Check your Top Fixes above.`
        : 'You are running a production-grade Second Brain. The system is self-improving. Share this report &mdash; show others what is possible.';

    let stageListHtml = '';
    for (let i = 0; i < stages.length; i++) {
        const isCurrent = i === currentIdx;
        const isPast = i < currentIdx;
        const color = isCurrent ? '#000' : isPast ? '#767676' : '#ccc';
        const marker = isCurrent ? 'x' : isPast ? '/' : ' ';
        const labelStyle = isCurrent ? 'color:#000;font-weight:700;' : `color:${color};`;
        stageListHtml += `
        <div style="display:flex;gap:12px;padding:4px 0;font-size:12px;font-family:'Space Mono',monospace;">
            <span style="color:${color};">[${marker}]</span>
            <span style="${labelStyle}min-width:160px;">${stages[i].label}</span>
            <span style="color:${color};">${stages[i].desc}</span>
        </div>`;
    }

    return `
    <div style="border:4px solid #000;padding:28px 28px 24px;margin-top:48px;background:#fff;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#000;margin-bottom:16px;font-family:'Space Mono',monospace;">Your Second Brain Journey</div>
        ${stageListHtml}
        <div style="margin-top:16px;padding-top:16px;border-top:4px solid #000;font-size:12px;color:#595959;line-height:1.7;font-family:'DM Sans',sans-serif;">
            You are in the <span style="color:#000;font-weight:700;">${stages[currentIdx].label}</span> stage. ${nextText}
        </div>
    </div>`;
}

export function generateDashboardHtml(report) {
    const setupPts = report.setup?.totalPoints || 0;
    const setupMax = report.setup?.maxPoints || 0;
    const usagePts = report.usage?.totalPoints || 0;
    const usageMax = report.usage?.maxPoints || 0;
    const fluencyPts = report.fluency?.totalPoints || 0;
    const fluencyMax = report.fluency?.maxPoints || 0;

    const totalPoints = setupPts + usagePts + fluencyPts;
    const totalMax = setupMax + usageMax + fluencyMax;
    const overallPct = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0;

    let overallGrade;
    if (overallPct >= 80) overallGrade = 'A';
    else if (overallPct >= 65) overallGrade = 'B';
    else if (overallPct >= 50) overallGrade = 'C';
    else if (overallPct >= 30) overallGrade = 'D';
    else overallGrade = 'F';

    const gradeColor = getGradeColor(overallGrade);

    const setupBarPct = setupMax > 0 ? Math.round((setupPts / setupMax) * 100) : 0;
    const usageBarPct = usageMax > 0 ? Math.round((usagePts / usageMax) * 100) : 0;
    const fluencyBarPct = fluencyMax > 0 ? Math.round((fluencyPts / fluencyMax) * 100) : 0;

    // Brain region scores — 3 dimensions mapped to 6 lobes
    // Setup    → frontal (planning/foundation) + occipital (output of good setup)
    // Usage    → temporal (memory/learning)    + cerebellum (habits/automation)
    // Fluency  → parietal (skills/processing)  + brainstem (core infrastructure)
    const setupScore   = report.setup?.normalizedScore   ?? setupBarPct;
    const usageScore   = report.usage?.normalizedScore   ?? usageBarPct;
    const fluencyScore = report.fluency?.normalizedScore ?? fluencyBarPct;
    const brainRegions = {
        frontal:    { name: 'Frontal Lobe',   subtitle: 'Foundation & Planning',  score: setupScore   },
        temporal:   { name: 'Temporal Lobes', subtitle: 'Memory & Learning',      score: usageScore   },
        parietal:   { name: 'Parietal Lobe',  subtitle: 'Skills & Processing',    score: fluencyScore },
        occipital:  { name: 'Occipital Lobe', subtitle: 'Output & Retrieval',     score: setupScore   },
        cerebellum: { name: 'Cerebellum',     subtitle: 'Habits & Automation',    score: usageScore   },
        brainstem:  { name: 'Brain Stem',     subtitle: 'Core Infrastructure',    score: fluencyScore },
    };

    const ts = new Date(report.timestamp);
    const dateStr = ts.toISOString().slice(0, 10);
    const timeStr = ts.toISOString().slice(11, 19) + ' UTC';

    const home = process.env.HOME || '';
    const shortPath = home && report.path?.startsWith(home)
        ? '~' + report.path.slice(home.length)
        : (report.path || '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Second Brain Health Check &mdash; ${overallPct}% (Grade ${overallGrade})</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#fff;color:#000;min-height:100vh;padding:48px 44px;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
  .container{max-width:860px;margin:0 auto}
  a{color:#000;text-decoration:none;border-bottom:2px solid #000}
  a:hover{background:#000;color:#fff}
  code{font-family:'Space Mono',monospace;font-size:.9em;background:#f5f5f5;padding:2px 6px;border:1px solid #e5e5e5}
  details summary{list-style:none}
  details summary::-webkit-details-marker{display:none}
  .hover-brutal{transition:transform .2s cubic-bezier(.25,.46,.45,.94),box-shadow .2s cubic-bezier(.25,.46,.45,.94)}
  .hover-brutal:hover{transform:translate(-4px,-4px);box-shadow:8px 8px 0 #000}
  .term-row{cursor:pointer;border-bottom:1px solid #f0f0f0;transition:background .1s;outline:none}
  .term-row:hover{background:#f5f5f5}
  .term-row:focus-visible{outline:3px solid #000;outline-offset:-3px}
  .term-row:first-child{border-top:1px solid #f0f0f0;margin-top:4px}
  .term-checks{display:none;padding:4px 0 10px 22px;border-top:1px solid #e5e5e5}
  .term-row.open .term-checks{display:block}
  @media(max-width:680px){
    body{padding:24px 20px}
    .score-panel{grid-template-columns:1fr!important}
    .score-right{border-left:none!important;border-top:4px solid #000!important}
    .big-num{font-size:72px!important}
    .upgrade-grid{grid-template-columns:1fr!important}
    .term-row div:first-child{grid-template-columns:14px 1fr 60px 36px!important}
  }
</style>
</head>
<body>
<div class="container">

    <!-- Nav -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:4px solid #000;font-size:11px;color:#000;text-transform:uppercase;letter-spacing:.12em;font-family:'Space Mono',monospace;">
        <span style="font-weight:700;">Second Brain / Health Check v${VERSION}</span>
        <span style="text-align:right;color:#595959;">${dateStr}<br>${timeStr}</span>
    </div>

    <!-- Title -->
    <h1 style="font-family:'DM Sans',sans-serif;font-size:48px;font-weight:700;color:#000;letter-spacing:-.03em;line-height:1.05;margin-bottom:8px;">Second Brain Health Check Report</h1>
    <span style="font-size:12px;color:#000;display:block;margin-bottom:4px;font-family:'Space Mono',monospace;">${escapeHtml(shortPath)}</span>
    <span style="font-size:13px;color:#595959;display:block;margin-bottom:28px;">Your Second Brain, examined.</span>

    <div style="border-top:4px solid #000;margin-bottom:32px;"></div>

    <!-- Score panel -->
    <div class="score-panel" style="display:grid;grid-template-columns:1fr 1fr;border:4px solid #000;overflow:hidden;">
        <div style="padding:32px 36px;display:flex;flex-direction:column;justify-content:center;gap:20px;background:#000;">
            <div>
                <span class="big-num" style="font-size:110px;font-weight:700;color:#fff;line-height:1;font-family:'Space Mono',monospace;">${overallPct}</span><span style="font-size:32px;color:rgba(255,255,255,.35);font-family:'Space Mono',monospace;">%</span>
            </div>
            <div style="border:2px solid ${gradeColor === '#1a7a3a' ? '#4ade80' : gradeColor};padding:10px 0;text-align:center;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:${gradeColor === '#1a7a3a' ? '#4ade80' : gradeColor};font-family:'Space Mono',monospace;">Grade ${overallGrade}</div>
        </div>

        <div class="score-right" style="padding:32px 36px;border-left:4px solid #000;">
            <div style="font-size:11px;color:#595959;text-transform:uppercase;letter-spacing:.08em;margin-bottom:22px;font-family:'Space Mono',monospace;">${totalPoints} / ${totalMax} points</div>
            ${[
                ['Setup', report.setup?.normalizedScore || setupBarPct, setupBarPct, setupPts, setupMax],
                ['Usage', report.usage?.normalizedScore || usageBarPct, usageBarPct, usagePts, usageMax],
                ['Fluency', report.fluency?.normalizedScore || fluencyBarPct, fluencyBarPct, fluencyPts, fluencyMax],
            ].map(([lbl, norm, pct, pts, mx], i) => `
            <div style="margin-bottom:${i < 2 ? '18' : '0'}px;">
                <div style="display:flex;justify-content:space-between;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#000;font-weight:700;margin-bottom:7px;font-family:'Space Mono',monospace;">
                    <span>${lbl}</span><span>${norm}/100</span>
                </div>
                <div style="height:4px;background:#e5e5e5;"><div style="height:100%;width:${pct}%;background:${getBarColor(pts, mx)};"></div></div>
            </div>`).join('')}
        </div>
    </div>

    <!-- Status Tally -->
    ${(() => {
        const dims = [report.setup, report.usage, report.fluency].filter(Boolean);
        let pass = 0, warn = 0, fail = 0;
        for (const dim of dims) {
            for (const layer of (dim.layers || [])) {
                for (const check of (layer.checks || [])) {
                    if (check.status === 'pass') pass++;
                    else if (check.status === 'warn') warn++;
                    else fail++;
                }
            }
        }
        const total = pass + warn + fail;
        if (total === 0) return '';
        const passPct = Math.round((pass / total) * 100);
        const warnPct = Math.round((warn / total) * 100);
        const failPct = Math.round((fail / total) * 100);
        return `<div style="display:flex;align-items:center;gap:24px;padding:14px 20px;border:4px solid #000;border-top:none;font-family:'Space Mono',monospace;font-size:11px;">
            <span style="color:#595959;text-transform:uppercase;letter-spacing:.08em;">${total} checks</span>
            <span style="display:flex;align-items:center;gap:6px;color:#1a7a3a;font-weight:700;"><span style="display:inline-block;width:8px;height:8px;background:#1a7a3a;"></span>${pass} pass<span style="font-weight:400;color:#767676;">${passPct}%</span></span>
            <span style="display:flex;align-items:center;gap:6px;color:#b08800;font-weight:700;"><span style="display:inline-block;width:8px;height:8px;background:#b08800;"></span>${warn} warn<span style="font-weight:400;color:#767676;">${warnPct}%</span></span>
            <span style="display:flex;align-items:center;gap:6px;color:#cf222e;font-weight:700;"><span style="display:inline-block;width:8px;height:8px;background:#cf222e;"></span>${fail} fail<span style="font-weight:400;color:#767676;">${failPct}%</span></span>
            <span style="flex:1;height:4px;display:flex;"><span style="width:${passPct}%;background:#1a7a3a;height:100%;"></span><span style="width:${warnPct}%;background:#b08800;height:100%;"></span><span style="width:${failPct}%;background:#cf222e;height:100%;"></span></span>
        </div>`;
    })()}

    <!-- Brain Map -->
    <div style="border:4px solid #000;padding:32px 36px;margin-top:32px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#000;margin-bottom:20px;font-family:'Space Mono',monospace;">Neural Map — Region Health</div>
        ${getBrainVizHtml(brainRegions)}
    </div>

    <!-- Top Fixes -->
    ${renderTopFixes(report.topFixes)}

    <!-- Upgrade Panel -->
    ${renderUpgradePanel(report)}

    <!-- CE Patterns -->
    ${renderCEPatterns(report.cePatterns)}

    <!-- Dimensions — Terminal style -->
    ${renderDimension(report.setup, 'Setup Quality', 'setup')}
    ${renderDimension(report.usage, 'Usage Activity', 'usage')}
    ${report.fluency ? renderDimension(report.fluency, 'AI Fluency', 'fluency') : ''}

    <!-- Journey -->
    ${renderJourneyStage(overallPct)}

    <!-- CTA -->
    ${report.brainState?.isBuyer
        ? `<div style="border:4px solid #000;padding:44px 40px;text-align:center;margin-top:32px;margin-bottom:32px;">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#000;margin-bottom:16px;font-family:'Space Mono',monospace;">Baseline Captured</div>
        <p style="font-size:13px;color:#595959;margin-bottom:8px;line-height:1.7;max-width:520px;margin:0 auto;">Score: ${overallPct}%. Run again after setup to see your progress.</p>
    </div>`
        : overallPct >= 85
        ? `<div style="background:#000;border:4px solid #000;padding:44px 40px;text-align:center;margin-top:32px;margin-bottom:32px;">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.6);margin-bottom:16px;font-family:'Space Mono',monospace;">You built something rare</div>
        <p style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:24px;line-height:1.7;max-width:520px;margin:0 auto;">Score ${overallPct}%. Most people never get past Scaffolded. Your brain is compounding. If you want to help your team get here too, the Team Brain add-on gives everyone a personal brain with shared context.</p>
        <a href="https://www.iwoszapar.com/teams" class="hover-brutal" style="display:inline-block;padding:14px 40px;background:#fff;color:#000;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;text-decoration:none;border:4px solid #fff;font-family:'Space Mono',monospace;">Explore Team Brain</a>
    </div>`
        : `<div style="background:#000;border:4px solid #000;padding:44px 40px;text-align:center;margin-top:32px;margin-bottom:32px;">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.6);margin-bottom:16px;font-family:'Space Mono',monospace;">Let the tool do the work</div>
        <p style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:24px;line-height:1.7;max-width:520px;margin:0 auto;">upgrade_brain reads your health check, pulls the right templates for your tier, personalizes every file with your profile, and writes them to your brain on confirmation. See the panel above for what it would do.</p>
        <a href="https://www.iwoszapar.com/memory-os" class="hover-brutal" style="display:inline-block;padding:14px 40px;background:#fff;color:#000;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;text-decoration:none;border:4px solid #fff;font-family:'Space Mono',monospace;">Unlock upgrade_brain &rarr;</a>
    </div>`
    }

    <!-- Footer -->
    <div style="text-align:center;padding-top:20px;border-top:4px solid #000;font-size:10px;color:#595959;text-transform:uppercase;letter-spacing:.1em;font-family:'Space Mono',monospace;">
        Generated by <a href="https://www.iwoszapar.com/second-brain-ai" style="color:#000;border-bottom:2px solid #000;font-weight:700;">Second Brain Health Check</a> v${VERSION} &middot; ${ts.toISOString()}
    </div>

</div>
</body>
</html>`;
}

export async function saveDashboard(report, outputPath) {
    const html = generateDashboardHtml(report);
    const filePath = resolve(outputPath || (process.cwd() + '/health-check-report.html'));
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
        throw new Error('Cannot determine home directory: HOME environment variable is not set.');
    }
    if (!filePath.startsWith(homeDir + '/') && filePath !== homeDir) {
        throw new Error(`Output path "${filePath}" is outside the home directory.`);
    }
    await writeFile(filePath, html, 'utf-8');
    return filePath;
}
