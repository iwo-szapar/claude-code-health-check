/**
 * Setup Layer: Gitignore Hygiene
 *
 * Verifies that sensitive and local-only files are properly excluded
 * from version control — settings.local.json, .env files, and
 * personal memory files should never leak into shared repos.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function isGitRepo(rootPath) {
    try {
        execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
            cwd: rootPath,
            stdio: 'pipe',
            timeout: 5000,
        });
        return true;
    } catch {
        return false;
    }
}

function isTrackedByGit(rootPath, relativePath) {
    try {
        const result = execFileSync('git', ['ls-files', relativePath], {
            cwd: rootPath,
            stdio: 'pipe',
            timeout: 5000,
        }).toString().trim();
        return result.length > 0;
    } catch {
        return false;
    }
}

async function fileExists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function checkGitignoreHygiene(rootPath) {
    const checks = [];

    if (!isGitRepo(rootPath)) {
        checks.push({
            name: 'Local settings protection',
            status: 'warn', points: 1, maxPoints: 3,
            message: 'Not a git repository — gitignore checks skipped',
        });
        checks.push({
            name: 'Environment file protection',
            status: 'warn', points: 1, maxPoints: 3,
            message: 'Not a git repository — gitignore checks skipped',
        });
        return { name: 'Gitignore Hygiene', points: 2, maxPoints: 6, checks };
    }

    // Read .gitignore files
    let gitignoreContent = '';
    try {
        gitignoreContent = await readFile(join(rootPath, '.gitignore'), 'utf-8');
    } catch { /* no .gitignore */ }

    let claudeGitignoreContent = '';
    try {
        claudeGitignoreContent = await readFile(join(rootPath, '.claude', '.gitignore'), 'utf-8');
    } catch { /* no .claude/.gitignore */ }

    // Check 1: Local settings protection (3 pts)
    {
        const sensitiveLocalFiles = [
            '.claude/settings.local.json',
            'CLAUDE.local.md',
        ];

        const leaks = [];
        const protected_ = [];

        for (const relPath of sensitiveLocalFiles) {
            const exists = await fileExists(join(rootPath, relPath));
            if (!exists) continue;
            if (isTrackedByGit(rootPath, relPath)) {
                leaks.push(relPath);
            } else {
                protected_.push(relPath);
            }
        }

        let status, points, message;
        if (leaks.length > 0) {
            status = 'fail'; points = 0;
            message = `Personal settings files (${leaks.join(', ')}) are visible in your shared repository. Why it matters: anyone with repo access can see your private configuration. Fix: add these to .gitignore to keep them private.`;
        } else if (protected_.length > 0) {
            status = 'pass'; points = 3;
            message = `${protected_.length} local settings file(s) properly excluded from git`;
        } else {
            const hasPattern = gitignoreContent.includes('settings.local.json') ||
                claudeGitignoreContent.includes('settings.local.json');
            if (hasPattern) {
                status = 'pass'; points = 3;
                message = 'Gitignore patterns cover local settings files';
            } else {
                status = 'warn'; points = 2;
                message = 'No personal settings files found yet. Tip: add settings.local.json to .gitignore now so future personal settings stay private automatically.';
            }
        }
        checks.push({ name: 'Local settings protection', status, points, maxPoints: 3, message });
    }

    // Check 2: Environment file protection (3 pts)
    {
        const envFiles = ['.env', '.env.local', '.env.production', '.env.secret'];
        const leaks = [];
        const protected_ = [];

        for (const relPath of envFiles) {
            const exists = await fileExists(join(rootPath, relPath));
            if (!exists) continue;
            if (isTrackedByGit(rootPath, relPath)) {
                leaks.push(relPath);
            } else {
                protected_.push(relPath);
            }
        }

        let status, points, message;
        if (leaks.length > 0) {
            status = 'fail'; points = 0;
            message = `Secret files (${leaks.join(', ')}) are visible in your shared repository. Why it matters: these files often contain passwords, API keys, and tokens — anyone with repo access can see them. Fix: add .env* to .gitignore and rotate any exposed secrets.`;
        } else if (protected_.length > 0) {
            status = 'pass'; points = 3;
            message = `${protected_.length} environment file(s) properly excluded from git`;
        } else {
            const hasPattern = gitignoreContent.includes('.env');
            if (hasPattern) {
                status = 'pass'; points = 3;
                message = 'Gitignore patterns cover environment files';
            } else {
                status = 'warn'; points = 1;
                message = 'No secret files (.env) found yet. Tip: add .env* to .gitignore now so future secrets stay private automatically.';
            }
        }
        checks.push({ name: 'Environment file protection', status, points, maxPoints: 3, message });
    }

    const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
    const totalMaxPoints = checks.reduce((sum, c) => sum + c.maxPoints, 0);

    return {
        name: 'Gitignore Hygiene',
        points: totalPoints,
        maxPoints: totalMaxPoints,
        checks,
    };
}
