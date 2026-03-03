/**
 * Report Formatter
 *
 * Converts health check results into a readable markdown report.
 * v0.8.1: Adaptive formatting based on brain maturity level,
 * score-band CTAs, time estimates on fixes, CE pattern section.
 */

/** Time estimates for common fix categories (minutes) */
const FIX_TIME_ESTIMATES = {
    'claude.md': 10,
    'skills': 15,
    'hooks': 15,
    'memory': 10,
    'directory': 5,
    'brain health': 5,
    'personalization': 10,
    'mcp': 5,
    'config': 5,
    'settings': 5,
    'permissions': 5,
    'sandbox': 5,
    'model': 3,
    'env': 5,
    'attribution': 3,
    'agent': 15,
    'gitignore': 3,
    'team': 10,
    'rules': 10,
    'interaction': 5,
    'spec': 10,
    'knowledge': 15,
    'context pressure': 10,
    'sessions': 5,
    'patterns': 10,
    'memory evolution': 5,
    'review loop': 15,
    'compound': 10,
    'cross-references': 10,
    'workflow': 10,
    'progressive': 10,
    'orchestration': 15,
    'context-aware': 10,
    'reference': 5,
    'delegation': 15,
    'interview': 10,
    'quality tracking': 5,
    'growth log': 5,
    'activity': 5,
    'codex': 5,
    'style': 10,
    'tracking': 5,
    'stale': 5,
    'hook health': 5,
    'pattern confidence': 5,
    'index files': 5,
    'getting started': 5,
    'external doc': 10,
};

function estimateMinutes(fixTitle) {
    const lower = fixTitle.toLowerCase();
    for (const [key, mins] of Object.entries(FIX_TIME_ESTIMATES)) {
        if (lower.includes(key)) return mins;
    }
    return 10; // default
}

function progressBar(points, maxPoints, width = 20) {
    const filled = Math.round((points / maxPoints) * width);
    const empty = width - filled;
    return '|'.repeat(filled) + '.'.repeat(empty);
}
function statusIcon(status) {
    switch (status) {
        case 'pass': return '[pass]';
        case 'warn': return '[warn]';
        case 'fail': return '[fail]';
        default: return '[----]';
    }
}
function formatLayer(layer) {
    const bar = progressBar(layer.points, layer.maxPoints);
    const lines = [];
    lines.push(`${layer.name.padEnd(30)} ${bar}  ${layer.points}/${layer.maxPoints}`);
    for (const check of layer.checks) {
        lines.push(`  ${statusIcon(check.status)} ${check.message}`);
    }
    return lines.join('\n');
}

/**
 * Build score-band CTA based on overall percentage and buyer status.
 */
function buildUpgradePreview(report) {
    const overallPct = getOverallPct(report);
    const isBuyer = report.brainState?.isBuyer || false;
    const topFixes = report.topFixes || [];

    if (overallPct === 0 || overallPct >= 85 || topFixes.length === 0) return [];

    const highFixes = topFixes.filter(f => f.impact === 'high');
    const medFixes = topFixes.filter(f => f.impact === 'medium');
    const lowFixes = topFixes.filter(f => f.impact === 'low');

    // Estimate: ~2 files per high fix, ~1 per med, ~0.5 per low
    const estimatedFiles = Math.max(
        highFixes.length * 2 + medFixes.length + Math.ceil(lowFixes.length / 2),
        1
    );
    const delta = Math.min(highFixes.length * 4 + medFixes.length * 2 + lowFixes.length, 30);
    const projected = Math.min(overallPct + delta, 95);

    const lines = [
        '================================================================',
        '  UPGRADE AVAILABLE',
        `  ${estimatedFiles} personalized files ready for your brain`,
        `  Score: ${overallPct}% ──→ ${projected}%  (+${projected - overallPct} pts)`,
        '',
    ];

    topFixes.slice(0, 3).forEach(fix => {
        const marker = fix.impact === 'high' ? '●' : '○';
        lines.push(`  ${marker} ${fix.title}  [${fix.impact.toUpperCase()}]`);
    });
    if (topFixes.length > 3) {
        lines.push(`  + ${topFixes.length - 3} more fixes`);
    }

    lines.push('');
    if (isBuyer) {
        lines.push('  Run in Claude Code:  upgrade_brain');
        lines.push('  Preview first:       upgrade_brain dry-run');
    } else {
        lines.push('  Unlock: https://www.iwoszapar.com/memory-os');
        lines.push('  Then run: upgrade_brain');
    }
    lines.push('================================================================');
    return lines;
}

function buildCTA(report) {
    const overallPct = getOverallPct(report);

    if (overallPct === 0 || report.brainState?.maturity === 'empty') {
        return [
            '================================================================',
            '  See what a properly configured Second Brain looks like:',
            '  https://www.iwoszapar.com/context-engineering',
            '================================================================',
        ];
    }

    if (overallPct >= 85) {
        return [
            '================================================================',
            '  You built something rare. Ready for Team Brain?',
            '  https://www.iwoszapar.com/teams',
            '================================================================',
        ];
    }

    // For everyone in range 1–84%: show the upgrade preview
    return buildUpgradePreview(report);
}

function formatDelta(report) {
    const prev = report.brainState?.previousScore;
    if (prev === null || prev === undefined) return '';
    const current = getOverallPct(report);
    const diff = current - prev;
    if (diff === 0) return '  (no change since last scan)';
    const sign = diff > 0 ? '+' : '';
    return `  (${sign}${diff}% since last scan)`;
}

function getOverallPct(report) {
    const totalPts = (report.setup?.totalPoints || 0) +
        (report.usage?.totalPoints || 0) +
        (report.fluency?.totalPoints || 0);
    const totalMax = (report.setup?.maxPoints || 0) +
        (report.usage?.maxPoints || 0) +
        (report.fluency?.maxPoints || 0);
    return totalMax > 0 ? Math.round((totalPts / totalMax) * 100) : 0;
}

/**
 * Format report for an EMPTY brain (no CLAUDE.md).
 * Direct X-ray: show exactly what's missing, then the 3 install steps.
 */
function formatEmptyReport(report) {
    const lines = [];
    lines.push('================================================================');
    lines.push('  SECOND BRAIN HEALTH CHECK');
    lines.push('================================================================');
    lines.push('');
    lines.push('  X-RAY RESULT: No brain detected.');
    lines.push('');
    lines.push('  [miss] CLAUDE.md          — AI has no instructions');
    lines.push('  [miss] .claude/            — no skills, hooks, or settings');
    lines.push('  [miss] memory/             — nothing is remembered');
    lines.push('  [miss] .claude/skills/     — no reusable commands');
    lines.push('');
    lines.push('  Claude is running blind in this directory.');
    lines.push('  Every session starts from zero. Fix that in 20 minutes:');
    lines.push('');
    lines.push('----------------------------------------------------------------');
    lines.push('INSTALL YOUR BRAIN (3 steps)');
    lines.push('----------------------------------------------------------------');
    lines.push('');
    lines.push('1. Create CLAUDE.md (~5 min)');
    lines.push('   Who you are, your top rules, your tools and stack.');
    lines.push('   This is the one file Claude reads in every session.');
    lines.push('');
    lines.push('2. Add skills (~10 min)');
    lines.push('   mkdir -p .claude/skills');
    lines.push('   Each .md file becomes a /command you can invoke.');
    lines.push('');
    lines.push('3. Set up memory (~5 min)');
    lines.push('   mkdir -p memory/episodic memory/semantic');
    lines.push('   Episodic = session logs. Semantic = patterns and voice.');
    lines.push('');
    lines.push('Run the health check again after setup.');
    lines.push('You will jump from 0% to ~25-35% immediately.');
    lines.push('');
    lines.push(...buildCTA(report));
    return lines.join('\n');
}

/**
 * Format report for MINIMAL/BASIC brain (score 1-40).
 * Growth mode: celebrate what exists, show top 3 fixes only.
 */
function formatGrowthReport(report) {
    const lines = [];
    const overallPct = getOverallPct(report);
    const has = report.brainState?.has || {};

    lines.push('================================================================');
    lines.push('  SECOND BRAIN HEALTH CHECK');
    lines.push('================================================================');
    lines.push('');
    lines.push(`SETUP QUALITY:    ${report.setup.normalizedScore}/100 (${report.setup.grade} - ${report.setup.gradeLabel})`);
    lines.push(`USAGE ACTIVITY:   ${report.usage.normalizedScore}/100 (${report.usage.grade} - ${report.usage.gradeLabel})`);
    if (report.fluency) {
        lines.push(`AI FLUENCY:       ${report.fluency.normalizedScore}/100 (${report.fluency.grade} - ${report.fluency.gradeLabel})`);
    }
    lines.push('');

    // Celebrate what exists
    lines.push('----------------------------------------------------------------');
    lines.push('WHAT YOU HAVE (good start!)');
    lines.push('----------------------------------------------------------------');
    lines.push('');
    if (has.claudeMd) lines.push('  [pass] CLAUDE.md exists');
    if (has.claudeDir) lines.push('  [pass] .claude/ directory configured');
    if (has.skills) lines.push('  [pass] Skills directory found');
    if (has.hooks) lines.push('  [pass] Hooks configured');
    if (has.memory) lines.push('  [pass] Memory directory found');
    if (has.knowledge) lines.push('  [pass] Knowledge base started');
    if (has.agents) lines.push('  [pass] Custom agents configured');
    lines.push('');

    // Top 3 fixes with time estimates
    const fixes = report.topFixes.slice(0, 3);
    if (fixes.length > 0) {
        lines.push('----------------------------------------------------------------');
        lines.push('YOUR NEXT 20-MINUTE SESSION (top 3 fixes)');
        lines.push('----------------------------------------------------------------');
        lines.push('');
        let totalMinutes = 0;
        fixes.forEach((fix, i) => {
            const mins = estimateMinutes(fix.title);
            totalMinutes += mins;
            lines.push(`${i + 1}. ${fix.title} (${fix.impact}, ~${mins} min)`);
            lines.push(`   ${fix.description}`);
            lines.push('');
        });
        lines.push(`Total estimated time: ~${totalMinutes} min`);
        lines.push('');
    }

    // CE pattern hint (just top 3 weakest)
    if (report.cePatterns && report.cePatterns.length > 0) {
        const weakPatterns = report.cePatterns
            .filter(p => p.maxScore > 0)
            .sort((a, b) => a.percentage - b.percentage)
            .slice(0, 3);
        if (weakPatterns.length > 0) {
            lines.push('----------------------------------------------------------------');
            lines.push('PATTERNS TO UNLOCK');
            lines.push('----------------------------------------------------------------');
            lines.push('');
            for (const p of weakPatterns) {
                const bar = progressBar(p.percentage, 100, 10);
                lines.push(`  ${p.name.padEnd(25)} ${bar} ${p.percentage}%`);
            }
            lines.push('');
        }
    }

    lines.push(...buildCTA(report));
    return lines.join('\n');
}

/**
 * Format CE patterns section for full reports.
 */
function formatCEPatterns(cePatterns) {
    if (!cePatterns || cePatterns.length === 0) return [];
    const lines = [];
    lines.push('----------------------------------------------------------------');
    lines.push('CONTEXT ENGINEERING PATTERNS (7 patterns)');
    lines.push('----------------------------------------------------------------');
    lines.push('');
    for (const p of cePatterns) {
        if (p.maxScore === 0) continue;
        const bar = progressBar(p.percentage, 100, 15);
        const status = p.percentage >= 70 ? '[pass]' : p.percentage >= 40 ? '[warn]' : '[fail]';
        lines.push(`${status} ${p.name.padEnd(28)} ${bar} ${p.percentage}%`);
    }
    lines.push('');
    return lines;
}

/**
 * Full report — for structured+ brains (score 41+).
 */
export function formatReport(report) {
    // Adaptive formatting based on brain state
    const maturity = report.brainState?.maturity;
    const overallPct = getOverallPct(report);

    // Empty brain: getting started guide
    if (maturity === 'empty' || (overallPct === 0 && !report.brainState?.has?.claudeMd)) {
        return formatEmptyReport(report);
    }

    // Growth mode for low scores
    if (overallPct <= 40 && (maturity === 'minimal' || maturity === 'basic')) {
        return formatGrowthReport(report);
    }

    // Full report for structured+
    const lines = [];
    const delta = formatDelta(report);
    lines.push('================================================================');
    lines.push('  SECOND BRAIN HEALTH CHECK');
    lines.push('================================================================');
    lines.push('');
    lines.push(`OVERALL:          ${getOverallPct(report)}%${delta}`);
    lines.push('');
    lines.push(`SETUP QUALITY:    ${report.setup.normalizedScore}/100 (${report.setup.grade} - ${report.setup.gradeLabel})`);
    lines.push(`USAGE ACTIVITY:   ${report.usage.normalizedScore}/100 (${report.usage.grade} - ${report.usage.gradeLabel})`);
    if (report.fluency) {
        lines.push(`AI FLUENCY:       ${report.fluency.normalizedScore}/100 (${report.fluency.grade} - ${report.fluency.gradeLabel})`);
    }
    lines.push('');
    // Setup breakdown
    lines.push('----------------------------------------------------------------');
    lines.push('SETUP QUALITY BREAKDOWN');
    lines.push('----------------------------------------------------------------');
    lines.push('');
    for (const layer of report.setup.layers) {
        lines.push(formatLayer(layer));
        lines.push('');
    }
    // Usage breakdown
    lines.push('----------------------------------------------------------------');
    lines.push('USAGE ACTIVITY BREAKDOWN');
    lines.push('----------------------------------------------------------------');
    lines.push('');
    for (const layer of report.usage.layers) {
        lines.push(formatLayer(layer));
        lines.push('');
    }
    // Fluency breakdown
    if (report.fluency) {
        lines.push('----------------------------------------------------------------');
        lines.push('AI FLUENCY BREAKDOWN');
        lines.push('----------------------------------------------------------------');
        lines.push('');
        for (const layer of report.fluency.layers) {
            lines.push(formatLayer(layer));
            lines.push('');
        }
    }
    // CE Patterns section
    lines.push(...formatCEPatterns(report.cePatterns));
    // Top fixes with time estimates
    if (report.topFixes.length > 0) {
        lines.push('----------------------------------------------------------------');
        lines.push('TOP FIXES (highest impact)');
        lines.push('----------------------------------------------------------------');
        lines.push('');
        report.topFixes.forEach((fix, i) => {
            const mins = estimateMinutes(fix.title);
            lines.push(`${i + 1}. ${fix.title} (${fix.impact}, ~${mins} min)`);
            lines.push(`   ${fix.description}`);
            lines.push('');
        });
    }
    // Score-band CTA
    lines.push(...buildCTA(report));
    return lines.join('\n');
}
export function formatFixSuggestions(report, focus) {
    const lines = [];
    // Determine focus
    let targetCategory;
    if (focus === 'auto') {
        const scores = [
            { cat: 'setup', score: report.setup.totalPoints / report.setup.maxPoints },
            { cat: 'usage', score: report.usage.totalPoints / report.usage.maxPoints },
        ];
        if (report.fluency) {
            scores.push({ cat: 'fluency', score: report.fluency.totalPoints / report.fluency.maxPoints });
        }
        scores.sort((a, b) => a.score - b.score);
        targetCategory = scores[0].cat;
    }
    else {
        targetCategory = focus;
    }
    const targetReport = targetCategory === 'setup' ? report.setup
        : targetCategory === 'fluency' && report.fluency ? report.fluency
        : report.usage;
    const reportName = targetCategory === 'setup' ? 'SETUP QUALITY'
        : targetCategory === 'fluency' ? 'AI FLUENCY'
        : 'USAGE ACTIVITY';
    lines.push('================================================================');
    lines.push(`  FIX PLAN: ${reportName}`);
    lines.push(`  Current: ${targetReport.normalizedScore}/100 (${targetReport.grade})`);
    lines.push('================================================================');
    lines.push('');
    // Find the weakest layer
    const sortedLayers = [...targetReport.layers].sort((a, b) => (a.points / a.maxPoints) - (b.points / b.maxPoints));
    const weakest = sortedLayers[0];
    if (!weakest) {
        lines.push('No issues found — your setup looks good!');
        return lines.join('\n');
    }
    lines.push(`WEAKEST AREA: ${weakest.name} (${weakest.points}/${weakest.maxPoints})`);
    lines.push('');
    // List all failing/warning checks in this layer
    const failingChecks = weakest.checks.filter(c => c.status !== 'pass');
    lines.push('ISSUES TO FIX:');
    lines.push('');
    failingChecks.forEach((check, i) => {
        const pointsToGain = check.maxPoints - check.points;
        const mins = estimateMinutes(check.name);
        lines.push(`${i + 1}. ${check.name} (+${pointsToGain} pts, ~${mins} min)`);
        lines.push(`   Status: ${check.status}`);
        lines.push(`   ${check.message}`);
        lines.push('');
    });
    // Also show other weak layers
    if (sortedLayers.length > 1) {
        lines.push('OTHER AREAS TO IMPROVE:');
        lines.push('');
        for (const layer of sortedLayers.slice(1, 3)) {
            const ratio = layer.points / layer.maxPoints;
            if (ratio < 0.8) {
                lines.push(`- ${layer.name}: ${layer.points}/${layer.maxPoints}`);
            }
        }
    }
    lines.push('');
    lines.push('================================================================');
    // Append upgrade preview
    const upgradeLines = buildUpgradePreview(report);
    if (upgradeLines.length > 0) {
        lines.push('');
        lines.push(...upgradeLines);
    }
    return lines.join('\n');
}
