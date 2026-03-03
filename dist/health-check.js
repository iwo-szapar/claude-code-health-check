/**
 * Health Check Orchestrator
 *
 * Runs all setup, usage, and fluency checks, produces a full report.
 * v0.8.1: Added detectBrainState() pre-scan and mapChecksToCEPatterns().
 * v0.13.0: schema_version in state file, Promise.allSettled fault isolation, 7 new setup layers.
 */
import { resolve } from 'node:path';
import { stat, realpath, readFile, writeFile } from 'node:fs/promises';
import { getSetupGrade, getUsageGrade, getFluencyGrade, normalizeScore } from './types.js';
// Setup layers
import { checkClaudeMd } from './setup/claude-md.js';
import { checkSkills } from './setup/skills.js';
import { checkStructure } from './setup/structure.js';
import { checkMemory } from './setup/memory.js';
import { checkBrainHealth } from './setup/brain-health.js';
import { checkHooks } from './setup/hooks.js';
import { checkPersonalization } from './setup/personalization.js';
import { checkMcpSecurity } from './setup/mcp-security.js';
import { checkConfigHygiene } from './setup/config-hygiene.js';
import { checkPlugins } from './setup/plugins.js';
import { checkSettingsHierarchy } from './setup/settings-hierarchy.js';
import { checkPermissionsAudit } from './setup/permissions-audit.js';
import { checkSandboxConfig } from './setup/sandbox-config.js';
import { checkModelConfig } from './setup/model-config.js';
import { checkEnvVars } from './setup/env-vars.js';
import { checkMcpHealth } from './setup/mcp-health.js';
import { checkAttributionDisplay } from './setup/attribution-display.js';
import { checkAgentQuality } from './setup/agent-quality.js';
import { checkGitignoreHygiene } from './setup/gitignore-hygiene.js';
import { checkTeamReadiness } from './setup/team-readiness.js';
import { checkRulesSystem } from './setup/rules-system.js';
import { checkInteractionConfig } from './setup/interaction-config.js';
import { checkSpecPlanning } from './setup/spec-planning.js';
import { checkKnowledgeBase } from './setup/knowledge-base.js';
import { checkContextPressure } from './setup/context-pressure.js';
// New setup layers (v0.13.0)
import { checkPrpFiles } from './setup/prp-files.js';
import { checkExamplesDirectory } from './setup/examples-directory.js';
import { checkPlanningDoc } from './setup/planning-doc.js';
import { checkTaskTracking } from './setup/task-tracking.js';
import { checkValidateCommand } from './setup/validate-command.js';
import { checkSettingsLocal } from './setup/settings-local.js';
import { checkFeatureRequestTemplate } from './setup/feature-request-template.js';
// Usage layers
import { checkSessions } from './usage/sessions.js';
import { checkPatterns } from './usage/patterns.js';
import { checkMemoryEvolution } from './usage/memory-evolution.js';
import { checkReviewLoop } from './usage/review-loop.js';
import { checkCompoundEvidence } from './usage/compound-evidence.js';
import { checkCrossReferences } from './usage/cross-references.js';
import { checkWorkflowMaturity } from './usage/workflow-maturity.js';
// Fluency layers
import { checkProgressiveDisclosure } from './fluency/progressive-disclosure.js';
import { checkSkillOrchestration } from './fluency/skill-orchestration.js';
import { checkContextAwareSkills } from './fluency/context-aware-skills.js';
import { checkReferenceIntegrity } from './fluency/reference-integrity.js';
import { checkDelegationPatterns } from './fluency/delegation-patterns.js';
import { checkInterviewPatterns } from './fluency/interview-patterns.js';
import { VERSION } from './version.js';

// Layer name arrays for Promise.allSettled fallback
const setupLayerNames = [
    'CLAUDE.md Quality', 'Skills & Commands', 'Directory Structure', 'Memory Architecture',
    'Brain Health Infrastructure', 'Hooks', 'Personalization Quality', 'MCP Security',
    'Config Hygiene', 'Plugin Coverage', 'Settings Hierarchy', 'Permissions Audit',
    'Sandbox Config', 'Model Config', 'Environment Variables', 'MCP Server Health',
    'Attribution & Display', 'Agent Configuration Depth', 'Gitignore Hygiene',
    'Team Readiness', 'Rules System', 'Interaction Configuration', 'Spec & Planning Artifacts',
    'Knowledge Base Architecture', 'Context Pressure',
    'PRP / Implementation Blueprints', 'Examples Directory', 'Planning Documentation',
    'Task Tracking', 'Validate Command', 'Settings Local Overrides', 'Feature Request Template',
];
const usageLayerNames = [
    'Sessions', 'Patterns', 'Memory Evolution', 'Review Loop',
    'Compound Evidence', 'Cross-References', 'Workflow Maturity',
];
const fluencyLayerNames = [
    'Progressive Disclosure', 'Skill Orchestration', 'Context-Aware Skills',
    'Reference Integrity', 'Delegation Patterns', 'Interview & Spec Patterns',
];

/**
 * Map Promise.allSettled results to layer objects.
 * Fulfilled -> pass through. Rejected -> zero-score fallback with error message.
 */
function settleToLayers(results, names) {
    return results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : {
            name: names[i] || `Layer ${i + 1}`,
            points: 0,
            maxPoints: 0,
            checks: [{ name: 'Layer Error', status: 'fail', points: 0, maxPoints: 0, message: `Layer failed: ${r.reason?.message || 'Unknown error'}` }],
        }
    );
}

/**
 * Fast pre-scan (~100ms) to detect brain maturity before running full checks.
 * Uses stat() calls only — no content reading, no heavy computation.
 */
export async function detectBrainState(rootPath) {
    const has = {
        claudeMd: false,
        claudeDir: false,
        memory: false,
        skills: false,
        hooks: false,
        knowledge: false,
        agents: false,
        settings: false,
    };
    let claudeMdSize = 0;

    const checks = await Promise.allSettled([
        stat(resolve(rootPath, 'CLAUDE.md')).then(s => { has.claudeMd = true; claudeMdSize = s.size; }),
        stat(resolve(rootPath, '.claude')).then(s => { if (s.isDirectory()) has.claudeDir = true; }),
        stat(resolve(rootPath, 'memory')).then(s => { if (s.isDirectory()) has.memory = true; }),
        stat(resolve(rootPath, '.claude/skills')).then(s => { if (s.isDirectory()) has.skills = true; }),
        stat(resolve(rootPath, '.claude/settings.json')).then(async (s) => {
            has.settings = true;
            try {
                const content = await readFile(resolve(rootPath, '.claude/settings.json'), 'utf-8');
                const parsed = JSON.parse(content);
                if (parsed.hooks && Object.keys(parsed.hooks).length > 0) has.hooks = true;
            } catch { /* no hooks */ }
        }),
        stat(resolve(rootPath, '.claude/docs')).then(s => { if (s.isDirectory()) has.knowledge = true; })
            .catch(() => stat(resolve(rootPath, '.claude/knowledge')).then(s => { if (s.isDirectory()) has.knowledge = true; })),
        stat(resolve(rootPath, '.claude/agents')).then(s => { if (s.isDirectory()) has.agents = true; }),
    ]);

    // Determine maturity level
    let maturity;
    if (!has.claudeMd) {
        maturity = 'empty';
    } else if (claudeMdSize < 500 && !has.claudeDir) {
        maturity = 'minimal';
    } else if (!has.skills && !has.hooks && !has.memory) {
        maturity = 'basic';
    } else if ((has.skills || has.hooks || has.memory) && !(has.skills && has.hooks && has.memory && has.knowledge)) {
        maturity = 'structured';
    } else {
        maturity = 'configured';
    }

    // Check for buyer signal and returning user
    const isBuyer = !!(process.env.GUIDE_TOKEN);
    let isReturning = false;
    let previousScore = null;
    try {
        const historyContent = await readFile(resolve(rootPath, '.health-check.json'), 'utf-8');
        const history = JSON.parse(historyContent);
        isReturning = true;
        if (history.runs && history.runs.length > 0) {
            const lastRun = history.runs[history.runs.length - 1];
            previousScore = lastRun.overallPct || null;
        }
    } catch { /* no history file */ }

    return {
        maturity,
        has,
        claudeMdSize,
        isBuyer,
        isReturning,
        previousScore,
    };
}

/**
 * Maps layer scores to the 7 Context Engineering patterns.
 * Pure computation — no additional filesystem scanning.
 */
export function mapChecksToCEPatterns(report) {
    const patterns = [
        {
            id: 'progressive_disclosure',
            name: 'Progressive Disclosure',
            description: 'Is the entry point lean? Are details discoverable?',
            layers: ['CLAUDE.md Quality', 'Knowledge Base Architecture', 'Settings Hierarchy', 'PRP / Implementation Blueprints', 'Settings Local Overrides'],
        },
        {
            id: 'knowledge_as_ram',
            name: 'Knowledge Files as RAM',
            description: 'Is domain knowledge in files, not crammed into CLAUDE.md?',
            layers: ['Knowledge Base Architecture', 'Directory Structure', 'Planning Documentation'],
        },
        {
            id: 'hooks_as_guardrails',
            name: 'Hooks as Guardrails',
            description: 'Are quality requirements automated, not dependent on memory?',
            layers: ['Hooks', 'Rules System', 'Validate Command'],
        },
        {
            id: 'three_layer_memory',
            name: 'Three-Layer Memory',
            description: 'Are episodic/semantic/goals properly separated?',
            layers: ['Memory Architecture', 'Sessions'],
        },
        {
            id: 'compound_learning',
            name: 'Compound Learning',
            description: 'Does each session make the system smarter?',
            layers: ['Review Loop', 'Compound Evidence', 'Workflow Maturity', 'Patterns', 'Task Tracking'],
        },
        {
            id: 'self_correction',
            name: 'Self-Correction Protocol',
            description: 'How does this age? What detects decay?',
            layers: ['Brain Health Infrastructure', 'Memory Evolution', 'Cross-References', 'Feature Request Template'],
        },
        {
            id: 'context_surfaces',
            name: 'Context Surfaces',
            description: 'Do agents have live data access via MCP?',
            layers: ['MCP Server Health', 'Plugin Coverage', 'Interaction Configuration', 'Context Pressure', 'Examples Directory'],
        },
    ];

    // Build a flat map of all layers by name -> { points, maxPoints }
    const layerMap = {};
    const allLayers = [
        ...(report.setup?.layers || []),
        ...(report.usage?.layers || []),
        ...(report.fluency?.layers || []),
    ];
    for (const layer of allLayers) {
        layerMap[layer.name] = { points: layer.points, maxPoints: layer.maxPoints };
    }

    return patterns.map(pattern => {
        let totalPoints = 0;
        let totalMax = 0;
        let matchedLayers = 0;

        for (const layerName of pattern.layers) {
            const layer = layerMap[layerName];
            if (layer) {
                totalPoints += layer.points;
                totalMax += layer.maxPoints;
                matchedLayers++;
            }
        }

        const percentage = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0;

        return {
            id: pattern.id,
            name: pattern.name,
            description: pattern.description,
            score: totalPoints,
            maxScore: totalMax,
            percentage,
            matchedLayers,
        };
    });
}

export async function runHealthCheck(path, options = {}) {
    const rootPath = await realpath(resolve(path || process.cwd()));
    // Boundary check: only allow paths within user's home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
        throw new Error('Cannot determine home directory: HOME environment variable is not set.');
    }
    if (!rootPath.startsWith(homeDir + '/') && rootPath !== homeDir) {
        throw new Error(`Path "${rootPath}" is outside the home directory.`);
    }
    // Ensure path is a directory
    const s = await stat(rootPath);
    if (!s.isDirectory()) {
        throw new Error(`Path "${rootPath}" is not a directory.`);
    }

    // Always run brain state detection first
    const brainState = await detectBrainState(rootPath);

    // Quick mode: return detection only, skip full checks
    if (options.mode === 'quick') {
        return {
            path: rootPath,
            timestamp: new Date().toISOString(),
            brainState,
            setup: { totalPoints: 0, maxPoints: 0, normalizedScore: 0, grade: 'F', gradeLabel: 'Not scanned', layers: [] },
            usage: { totalPoints: 0, maxPoints: 0, normalizedScore: 0, grade: 'Empty', gradeLabel: 'Not scanned', layers: [] },
            fluency: { totalPoints: 0, maxPoints: 0, normalizedScore: 0, grade: 'Novice', gradeLabel: 'Not scanned', layers: [] },
            topFixes: [],
            cePatterns: [],
        };
    }

    // Empty brain: skip all 32+ checks — nothing meaningful to score.
    // Report formatter will show the getting-started guide instead of 32 failures.
    if (brainState.maturity === 'empty') {
        return {
            path: rootPath,
            timestamp: new Date().toISOString(),
            brainState,
            setup: { totalPoints: 0, maxPoints: 0, normalizedScore: 0, grade: 'F', gradeLabel: 'No brain detected', layers: [] },
            usage: { totalPoints: 0, maxPoints: 0, normalizedScore: 0, grade: 'Empty', gradeLabel: 'No brain detected', layers: [] },
            fluency: { totalPoints: 0, maxPoints: 0, normalizedScore: 0, grade: 'Novice', gradeLabel: 'No brain detected', layers: [] },
            topFixes: [],
            cePatterns: [],
        };
    }


    // Run all checks in parallel with fault isolation (Promise.allSettled per dimension)
    const [setupResults, usageResults, fluencyResults] = await Promise.all([
        Promise.allSettled([
            checkClaudeMd(rootPath),
            checkSkills(rootPath),
            checkStructure(rootPath),
            checkMemory(rootPath),
            checkBrainHealth(rootPath),
            checkHooks(rootPath),
            checkPersonalization(rootPath),
            checkMcpSecurity(rootPath),
            checkConfigHygiene(rootPath),
            checkPlugins(rootPath),
            checkSettingsHierarchy(rootPath),
            checkPermissionsAudit(rootPath),
            checkSandboxConfig(rootPath),
            checkModelConfig(rootPath),
            checkEnvVars(rootPath),
            checkMcpHealth(rootPath),
            checkAttributionDisplay(rootPath),
            checkAgentQuality(rootPath),
            checkGitignoreHygiene(rootPath),
            checkTeamReadiness(rootPath),
            checkRulesSystem(rootPath),
            checkInteractionConfig(rootPath),
            checkSpecPlanning(rootPath),
            checkKnowledgeBase(rootPath),
            checkContextPressure(rootPath),
            // New layers (v0.13.0)
            checkPrpFiles(rootPath),
            checkExamplesDirectory(rootPath),
            checkPlanningDoc(rootPath),
            checkTaskTracking(rootPath),
            checkValidateCommand(rootPath),
            checkSettingsLocal(rootPath),
            checkFeatureRequestTemplate(rootPath),
        ]),
        Promise.allSettled([
            checkSessions(rootPath),
            checkPatterns(rootPath),
            checkMemoryEvolution(rootPath),
            checkReviewLoop(rootPath),
            checkCompoundEvidence(rootPath),
            checkCrossReferences(rootPath),
            checkWorkflowMaturity(rootPath),
        ]),
        Promise.allSettled([
            checkProgressiveDisclosure(rootPath),
            checkSkillOrchestration(rootPath),
            checkContextAwareSkills(rootPath),
            checkReferenceIntegrity(rootPath),
            checkDelegationPatterns(rootPath),
            checkInterviewPatterns(rootPath),
        ]),
    ]);

    const setupLayers = settleToLayers(setupResults, setupLayerNames);
    const usageLayers = settleToLayers(usageResults, usageLayerNames);
    const fluencyLayers = settleToLayers(fluencyResults, fluencyLayerNames);

    const setupTotal = setupLayers.reduce((sum, l) => sum + l.points, 0);
    const setupMax = setupLayers.reduce((sum, l) => sum + l.maxPoints, 0);
    const usageTotal = usageLayers.reduce((sum, l) => sum + l.points, 0);
    const usageMax = usageLayers.reduce((sum, l) => sum + l.maxPoints, 0);
    const fluencyTotal = fluencyLayers.reduce((sum, l) => sum + l.points, 0);
    const fluencyMax = fluencyLayers.reduce((sum, l) => sum + l.maxPoints, 0);
    const setupGrade = getSetupGrade(setupTotal, setupMax);
    const usageGrade = getUsageGrade(usageTotal, usageMax);
    const fluencyGrade = getFluencyGrade(fluencyTotal, fluencyMax);
    const setup = {
        totalPoints: setupTotal,
        maxPoints: setupMax,
        normalizedScore: normalizeScore(setupTotal, setupMax),
        grade: setupGrade.grade,
        gradeLabel: setupGrade.label,
        layers: setupLayers,
    };
    const usage = {
        totalPoints: usageTotal,
        maxPoints: usageMax,
        normalizedScore: normalizeScore(usageTotal, usageMax),
        grade: usageGrade.grade,
        gradeLabel: usageGrade.label,
        layers: usageLayers,
    };
    const fluency = {
        totalPoints: fluencyTotal,
        maxPoints: fluencyMax,
        normalizedScore: normalizeScore(fluencyTotal, fluencyMax),
        grade: fluencyGrade.grade,
        gradeLabel: fluencyGrade.label,
        layers: fluencyLayers,
    };
    const topFixes = generateTopFixes(setupLayers, usageLayers, fluencyLayers);

    const report = {
        path: rootPath,
        timestamp: new Date().toISOString(),
        brainState,
        setup,
        usage,
        fluency,
        topFixes,
    };

    // Compute CE pattern mapping
    report.cePatterns = mapChecksToCEPatterns(report);

    // Persist state for delta tracking on next run
    await saveHealthCheckState(rootPath, report);

    return report;
}

/**
 * Save health check results to .health-check.json for delta tracking.
 * Appends to a runs array (max 20 entries to avoid bloat).
 * Includes schema_version for future migration safety.
 */
async function saveHealthCheckState(rootPath, report) {
    const filePath = resolve(rootPath, '.health-check.json');
    const overallPct = report.setup.maxPoints + report.usage.maxPoints + report.fluency.maxPoints > 0
        ? Math.round(((report.setup.totalPoints + report.usage.totalPoints + report.fluency.totalPoints) /
            (report.setup.maxPoints + report.usage.maxPoints + report.fluency.maxPoints)) * 100)
        : 0;

    const runEntry = {
        timestamp: report.timestamp,
        version: VERSION,
        overallPct,
        setup: report.setup.normalizedScore,
        usage: report.usage.normalizedScore,
        fluency: report.fluency.normalizedScore,
        maturity: report.brainState?.maturity || 'unknown',
        cePatterns: (report.cePatterns || []).map(p => ({ name: p.name, pct: p.percentage })),
        checks: [
            ...(report.setup.layers || []).map(l => ({ dim: 'setup', name: l.name, pts: l.points, max: l.maxPoints })),
            ...(report.usage.layers || []).map(l => ({ dim: 'usage', name: l.name, pts: l.points, max: l.maxPoints })),
            ...(report.fluency.layers || []).map(l => ({ dim: 'fluency', name: l.name, pts: l.points, max: l.maxPoints })),
        ],
    };

    let state = { schema_version: 1, runs: [] };
    try {
        const existing = await readFile(filePath, 'utf-8');
        state = JSON.parse(existing);
        if (!Array.isArray(state.runs)) state.runs = [];
        // Ensure schema_version is always present
        if (!state.schema_version) state.schema_version = 1;
    } catch { /* no existing file, start fresh */ }

    state.runs.push(runEntry);
    // Keep max 20 runs to avoid file bloat
    if (state.runs.length > 20) {
        state.runs = state.runs.slice(-20);
    }

    try {
        await writeFile(filePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
    } catch { /* silently fail — read-only filesystem or permission issues shouldn't block the scan */ }
}
function generateTopFixes(setupLayers, usageLayers, fluencyLayers) {
    const allChecks = [];
    const dimMaxes = {
        setup: setupLayers.reduce((s, l) => s + l.maxPoints, 0),
        usage: usageLayers.reduce((s, l) => s + l.maxPoints, 0),
        fluency: fluencyLayers.reduce((s, l) => s + l.maxPoints, 0),
    };
    const addChecks = (layers, category) => {
        for (const layer of layers) {
            for (const check of layer.checks) {
                if (check.status !== 'pass') {
                    const rawDeficit = check.maxPoints - check.points;
                    const dimMax = dimMaxes[category] || 1;
                    const normalizedDeficit = Math.round((rawDeficit / dimMax) * 100);
                    allChecks.push({
                        check,
                        layer: layer.name,
                        category,
                        deficit: rawDeficit,
                        normalizedDeficit,
                    });
                }
            }
        }
    };
    addChecks(setupLayers, 'setup');
    addChecks(usageLayers, 'usage');
    addChecks(fluencyLayers, 'fluency');
    // Sort by normalized deficit (highest potential improvement first)
    allChecks.sort((a, b) => b.normalizedDeficit - a.normalizedDeficit);
    // Take top 5
    return allChecks.slice(0, 5).map(item => ({
        title: item.check.name.toUpperCase(),
        impact: `+${item.normalizedDeficit}% ${item.category}`,
        description: item.check.message,
        category: item.category,
    }));
}
