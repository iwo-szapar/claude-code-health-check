/**
 * Usage Layer: Workflow Maturity
 *
 * Measures the sophistication of automated workflows by looking at
 * skill invocation logs, command definitions, and evidence of
 * repeated skill usage over time.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function fileExists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

async function countMdFiles(dirPath) {
    try {
        const entries = await readdir(dirPath, { recursive: true });
        return entries.filter(e => e.endsWith('.md')).length;
    } catch {
        return 0;
    }
}

export async function checkWorkflowMaturity(rootPath) {
    const checks = [];

    // Check 1: Skill invocation evidence (4 pts)
    // Look for invocation logs, usage data, or workflow traces
    {
        const invocationPaths = [
            join(rootPath, 'memory', 'episodic', 'skill-invocations.jsonl'),
            join(rootPath, '.claude', 'skill-invocations.jsonl'),
            join(rootPath, 'memory', 'skill-usage.md'),
        ];

        let logFound = null;
        let lineCount = 0;

        for (const p of invocationPaths) {
            try {
                const content = await readFile(p, 'utf-8');
                logFound = p;
                lineCount = content.split('\n').filter(l => l.trim()).length;
                break;
            } catch {
                continue;
            }
        }

        let status, points, message;
        if (logFound && lineCount >= 20) {
            status = 'pass'; points = 4;
            message = `Skill usage is being tracked — ${lineCount} entries in log (skills are the /commands Claude runs on your behalf)`;
        } else if (logFound && lineCount >= 5) {
            status = 'warn'; points = 3;
            message = `Skill usage log found with ${lineCount} entries — still early, keep using /skills to build history`;
        } else if (logFound) {
            status = 'warn'; points = 2;
            message = `Skill usage log exists but has only ${lineCount} entries — use your /skills more to build a usage record`;
        } else {
            status = 'fail'; points = 0;
            message = 'No record of which commands you use and how often. Why it matters: without tracking, you can\'t see which automations actually save you time. Fix: create memory/skill-usage.md to start logging.';
        }
        checks.push({ name: 'Skill invocation evidence', status, points, maxPoints: 4, message });
    }

    // Check 2: Command definitions (3 pts)
    // Commands orchestrate workflows — their existence shows maturity
    {
        const commandsDir = join(rootPath, '.claude', 'commands');
        const commandCount = await countMdFiles(commandsDir);

        let status, points, message;
        if (commandCount >= 3) {
            status = 'pass'; points = 3;
            message = `${commandCount} command definitions found — commands are multi-step workflows you trigger with /command-name`;
        } else if (commandCount >= 1) {
            status = 'warn'; points = 2;
            message = `${commandCount} command(s) in .claude/commands/ — commands chain multiple skills into one action (e.g. /review runs lint + test + summarize)`;
        } else {
            const skillCount = await countMdFiles(join(rootPath, '.claude', 'skills'));
            if (skillCount >= 5) {
                status = 'warn'; points = 1;
                message = `No commands found but ${skillCount} skills exist — add .claude/commands/ to chain skills together into repeatable multi-step workflows`;
            } else {
                status = 'fail'; points = 0;
                message = 'No multi-step automations set up yet. Why it matters: commands let you run complex workflows with a single /command (like /morning-review). Fix: add .claude/commands/ with your first workflow.';
            }
        }
        checks.push({ name: 'Command definitions', status, points, maxPoints: 3, message });
    }

    // Check 3: Workflow diversity (3 pts)
    // How many different categories of workflows exist (code, content, ops, research, etc.)
    {
        const skillsDir = join(rootPath, '.claude', 'skills');
        let skillNames = [];
        try {
            const entries = await readdir(skillsDir);
            skillNames = entries.filter(e => !e.startsWith('.'));
        } catch {
            // no skills
        }

        // Categorize by naming patterns
        const categories = new Set();
        const categoryPatterns = {
            development: /code|dev|build|test|lint|deploy|review|debug|fix|refactor|migrate/i,
            content: /content|write|blog|newsletter|post|draft|essay|article|publish/i,
            operations: /crm|prospect|lead|sales|outreach|email|pipeline|campaign/i,
            research: /research|analyze|explore|search|investigate|evaluate|audit/i,
            workflow: /workflow|orchestrat|automat|schedule|sync|track|monitor/i,
        };

        for (const name of skillNames) {
            for (const [category, pattern] of Object.entries(categoryPatterns)) {
                if (pattern.test(name)) {
                    categories.add(category);
                }
            }
        }

        let status, points, message;
        if (categories.size >= 3) {
            status = 'pass'; points = 3;
            message = `Skills cover ${categories.size} areas: ${[...categories].join(', ')} — AI can help you across different types of work`;
        } else if (categories.size >= 2) {
            status = 'warn'; points = 2;
            message = `Skills cover ${categories.size} areas (${[...categories].join(', ')}) — add skills for other types of work you do regularly`;
        } else if (skillNames.length >= 3) {
            status = 'warn'; points = 1;
            message = `${skillNames.length} skills but all in the same area — branch out: add a content skill, a research skill, or an ops skill`;
        } else {
            status = 'fail'; points = 0;
            message = 'Not enough automations to measure workflow coverage. Why it matters: the more types of work AI can help with, the more time you save. Fix: add at least 3 skills covering different areas (e.g. writing, coding, research).';
        }
        checks.push({ name: 'Workflow diversity', status, points, maxPoints: 3, message });
    }

    const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
    const totalMaxPoints = checks.reduce((sum, c) => sum + c.maxPoints, 0);

    return {
        name: 'Workflow Maturity',
        points: totalPoints,
        maxPoints: totalMaxPoints,
        checks,
    };
}
