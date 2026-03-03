/**
 * import_context — Parse and import ChatGPT/Claude exports into Second Brain memory.
 *
 * Supports:
 * - chatgpt_export: conversations.json from ChatGPT Settings > Data Controls > Export
 * - claude_export: directory of per-conversation JSON files from Claude Settings > Export Data
 *
 * Modes:
 * - scan: Analyze export, show summary + preview (no files written)
 * - import: Create organized memory files from conversations
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, basename, resolve, relative, dirname } from 'path';

// --- Path Safety ---

/**
 * Validate that a resolved path stays within a safe base directory.
 * Prevents path traversal attacks via ../../../etc-style inputs.
 */
function assertPathWithinBase(resolvedTarget, baseDir, label) {
    const normalizedBase = resolve(baseDir);
    const normalizedTarget = resolve(resolvedTarget);
    if (!normalizedTarget.startsWith(normalizedBase + '/') && normalizedTarget !== normalizedBase) {
        throw new Error(
            `${label} must be within the project directory.\n` +
            `Base: ${normalizedBase}\nResolved: ${normalizedTarget}\n` +
            `Hint: use a relative path like "memory/imported" or an absolute path within your project.`
        );
    }
}

// --- Date Validation ---

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function parseAndValidateDate(dateStr, label) {
    if (!ISO_DATE_PATTERN.test(dateStr)) {
        throw new Error(
            `Invalid ${label}: "${dateStr}". Expected YYYY-MM-DD format (e.g. 2024-01-01).`
        );
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        throw new Error(
            `Invalid ${label}: "${dateStr}" is not a valid date.`
        );
    }
    return d;
}

// --- Category Detection ---

const CATEGORY_SIGNALS = {
    coding: {
        keywords: ['function', 'const ', 'let ', 'var ', 'import ', 'export ', 'class ', 'def ',
            'return ', 'console.log', 'print(', 'error', 'bug', 'debug', 'npm', 'pip',
            'git ', 'commit', 'merge', 'branch', 'api', 'endpoint', 'database', 'query',
            'typescript', 'javascript', 'python', 'react', 'node', '.js', '.ts', '.py',
            'async ', 'await ', 'try {', 'catch', 'throw'],
        patterns: [/```[\w]*\n/g, /\.(js|ts|py|rb|go|rs|java|cpp|c|sh)\b/g, /error:|Error:/g,
            /\/[\w-]+\/[\w-]+\.\w+/g]
    },
    writing: {
        keywords: ['write', 'draft', 'edit', 'rewrite', 'tone', 'style', 'paragraph',
            'essay', 'article', 'blog', 'newsletter', 'headline', 'copy', 'proofread',
            'grammar', 'sentence', 'word choice', 'narrative', 'story'],
        patterns: [/\b(rewrite|rephrase|revise)\b/gi]
    },
    research: {
        keywords: ['what is', 'how does', 'explain', 'compare', 'difference between',
            'pros and cons', 'advantages', 'disadvantages', 'study', 'research',
            'evidence', 'source', 'reference', 'analyze', 'investigate'],
        patterns: [/\b(what|how|why|when|where)\s+(is|does|do|are|was|were|can|should)\b/gi]
    },
    planning: {
        keywords: ['plan', 'strategy', 'roadmap', 'timeline', 'priority', 'should i',
            'decision', 'options', 'tradeoff', 'milestone', 'goal', 'objective',
            'next steps', 'action items', 'todo', 'checklist'],
        patterns: [/\b(should i|what if|plan for)\b/gi, /\d+\.\s+/g]
    },
    data: {
        keywords: ['data', 'chart', 'graph', 'table', 'spreadsheet', 'csv', 'json',
            'statistics', 'average', 'median', 'percentage', 'calculate', 'formula',
            'analysis', 'metric', 'dashboard', 'report'],
        patterns: [/\b\d+[%$€£]\b/g, /\|\s*\w+\s*\|/g]
    },
    creative: {
        keywords: ['imagine', 'what if', 'brainstorm', 'creative', 'story', 'fiction',
            'character', 'world', 'scenario', 'idea', 'concept', 'design',
            'inspiration', 'innovative', 'generate ideas'],
        patterns: [/\b(imagine|brainstorm|what if)\b/gi]
    },
    operations: {
        keywords: ['email', 'meeting', 'schedule', 'calendar', 'task', 'project',
            'team', 'client', 'invoice', 'budget', 'workflow', 'process',
            'automate', 'template', 'follow up', 'reminder'],
        patterns: [/\b(meeting|email|schedule|invoice)\b/gi]
    }
};

function categorizeConversation(texts) {
    const combined = texts.join(' ').toLowerCase();
    const scores = {};

    for (const [category, signals] of Object.entries(CATEGORY_SIGNALS)) {
        let score = 0;
        for (const kw of signals.keywords) {
            const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = combined.match(regex);
            if (matches) score += matches.length;
        }
        for (const pat of signals.patterns) {
            const regex = new RegExp(pat.source, pat.flags);
            const matches = combined.match(regex);
            if (matches) score += matches.length * 2;
        }
        scores[category] = score;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] < 3) return 'uncategorized';
    return sorted[0][0];
}

// --- Topic Extraction ---

function extractTopics(conversations) {
    const topicCounts = {};

    for (const conv of conversations) {
        const title = (conv.title || '').toLowerCase();
        const words = title.split(/[\s\-_,.:;!?()[\]{}]+/).filter(w => w.length > 3);
        for (const word of words) {
            if (['this', 'that', 'with', 'from', 'have', 'been', 'will', 'would',
                'could', 'should', 'about', 'which', 'their', 'there', 'where',
                'when', 'what', 'your', 'into', 'also', 'more', 'some', 'than',
                'them', 'then', 'they', 'these', 'those', 'very', 'just', 'help',
                'make', 'like', 'does', 'want', 'need', 'please', 'write', 'create',
                'using', 'based', 'each', 'other'].includes(word)) continue;

            if (!topicCounts[word]) topicCounts[word] = { count: 0, conversations: [] };
            topicCounts[word].count++;
            topicCounts[word].conversations.push(conv.id);
        }
    }

    return Object.entries(topicCounts)
        .filter(([, v]) => v.count >= 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15)
        .map(([topic, data]) => ({
            topic,
            frequency: data.count,
            conversations: [...new Set(data.conversations)].slice(0, 5)
        }));
}

// --- ChatGPT Parser ---

function extractFirstUserMessage(mapping) {
    const childrenMap = {};
    let rootId = null;

    for (const [nid, node] of Object.entries(mapping)) {
        const parent = node.parent;
        if (parent === null || parent === undefined) {
            rootId = nid;
        } else {
            if (!childrenMap[parent]) childrenMap[parent] = [];
            childrenMap[parent].push(nid);
        }
    }

    const queue = rootId ? [rootId] : Object.keys(mapping).slice(0, 1);
    const visited = new Set();
    while (queue.length > 0) {
        const nid = queue.shift();
        if (visited.has(nid)) continue;
        visited.add(nid);
        const node = mapping[nid];
        if (!node) continue;
        const msg = node.message;
        if (msg && msg.author?.role === 'user') {
            const content = msg.content || {};
            if (content.content_type === 'user_editable_context') {
                for (const child of (childrenMap[nid] || [])) queue.push(child);
                continue;
            }
            const parts = content.parts || [];
            const textParts = parts.filter(p => typeof p === 'string' && p.trim()).map(String);
            const text = textParts.join(' ').trim();
            if (text) return text;
        }
        for (const child of (childrenMap[nid] || [])) queue.push(child);
    }
    return '';
}

function countMessages(mapping) {
    let total = 0;
    let userCount = 0;
    for (const node of Object.values(mapping)) {
        const msg = node.message;
        if (!msg || !msg.author) continue;
        total++;
        if (msg.author.role === 'user') userCount++;
    }
    return { total, userCount };
}

function extractAllUserTexts(mapping) {
    const texts = [];
    for (const node of Object.values(mapping)) {
        const msg = node.message;
        if (!msg || msg.author?.role !== 'user') continue;
        const content = msg.content || {};
        if (content.content_type === 'user_editable_context') continue;
        const parts = content.parts || [];
        for (const p of parts) {
            if (typeof p === 'string' && p.trim()) texts.push(p);
        }
    }
    return texts;
}

function parseChatGPTExport(filePath, options = {}) {
    const stat = statSync(filePath);
    const fileSizeMb = stat.size / (1024 * 1024);

    if (fileSizeMb > 200) {
        throw new Error(
            `Export file is ${fileSizeMb.toFixed(0)}MB (>200MB). ` +
            `Use max_conversations to limit processing, or split your export file.`
        );
    }

    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
        throw new Error('Expected conversations.json to be an array');
    }

    const minMessages = options.min_messages ?? 3;
    const maxConversations = options.max_conversations;
    const afterDate = options.date_range?.after ? parseAndValidateDate(options.date_range.after, 'date_after').getTime() / 1000 : null;
    const beforeDate = options.date_range?.before ? parseAndValidateDate(options.date_range.before, 'date_before').getTime() / 1000 : null;

    const conversations = [];
    let skipped = 0;

    for (const conv of data) {
        const mapping = conv.mapping || {};
        const createTime = conv.create_time;

        if (afterDate && createTime && createTime < afterDate) { skipped++; continue; }
        if (beforeDate && createTime && createTime > beforeDate) { skipped++; continue; }

        if (maxConversations && conversations.length >= maxConversations) break;

        const { total, userCount } = countMessages(mapping);
        if (userCount < minMessages) { skipped++; continue; }

        const firstMsg = extractFirstUserMessage(mapping);
        const userTexts = extractAllUserTexts(mapping);
        const category = categorizeConversation(userTexts);

        conversations.push({
            id: conv.conversation_id || conv.id || '',
            title: conv.title || 'Untitled',
            created_at: createTime ? new Date(createTime * 1000).toISOString() : '',
            updated_at: conv.update_time ? new Date(conv.update_time * 1000).toISOString() : '',
            message_count: total,
            user_message_count: userCount,
            category,
            first_message_preview: firstMsg.slice(0, 200),
            model: conv.default_model_slug || undefined,
            userTexts
        });
    }

    conversations.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return { conversations, skipped, fileSizeMb, sourceType: 'chatgpt_export' };
}

// --- Claude Parser ---

function parseClaudeExport(dirPath, options = {}) {
    const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));
    const dirStat = files.reduce((acc, f) => {
        try { return acc + statSync(join(dirPath, f)).size; } catch { return acc; }
    }, 0);
    const fileSizeMb = dirStat / (1024 * 1024);

    const minMessages = options.min_messages ?? 3;
    const maxConversations = options.max_conversations;
    const afterDate = options.date_range?.after ? parseAndValidateDate(options.date_range.after, 'date_after') : null;
    const beforeDate = options.date_range?.before ? parseAndValidateDate(options.date_range.before, 'date_before') : null;

    const conversations = [];
    let skipped = 0;

    for (const file of files) {
        try {
            const raw = readFileSync(join(dirPath, file), 'utf-8');
            const conv = JSON.parse(raw);
            const messages = conv.chat_messages || [];
            const createdAt = conv.created_at ? new Date(conv.created_at) : null;

            if (afterDate && createdAt && createdAt < afterDate) { skipped++; continue; }
            if (beforeDate && createdAt && createdAt > beforeDate) { skipped++; continue; }

            const humanMessages = messages.filter(m => m.sender === 'human');
            if (humanMessages.length < minMessages) { skipped++; continue; }

            if (maxConversations && conversations.length >= maxConversations) break;

            const userTexts = humanMessages.map(m => m.text || '').filter(Boolean);
            const category = categorizeConversation(userTexts);
            const firstMsg = userTexts[0] || '';

            conversations.push({
                id: conv.uuid || basename(file, '.json'),
                title: conv.name || 'Untitled',
                created_at: conv.created_at || '',
                updated_at: conv.updated_at || '',
                message_count: messages.length,
                user_message_count: humanMessages.length,
                category,
                first_message_preview: firstMsg.slice(0, 200),
                model: undefined,
                userTexts
            });
        } catch {
            skipped++;
        }
    }

    conversations.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return { conversations, skipped, fileSizeMb, sourceType: 'claude_export' };
}

// --- Scan Mode ---

function buildScanResult(parsed, parseTimeMs) {
    const { conversations, skipped, fileSizeMb, sourceType } = parsed;

    const totalMessages = conversations.reduce((acc, c) => acc + c.message_count, 0);
    const dates = conversations.map(c => c.created_at).filter(Boolean).sort();

    const categoryMap = {};
    for (const conv of conversations) {
        if (!categoryMap[conv.category]) categoryMap[conv.category] = { count: 0, titles: [] };
        categoryMap[conv.category].count++;
        if (categoryMap[conv.category].titles.length < 3) {
            categoryMap[conv.category].titles.push(conv.title);
        }
    }

    const categories = Object.entries(categoryMap)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
            name,
            count: data.count,
            sample_titles: data.titles
        }));

    const topTopics = extractTopics(conversations);

    const preview = conversations.slice(0, 10).map(c => ({
        id: c.id,
        title: c.title,
        created_at: c.created_at,
        message_count: c.message_count,
        category: c.category,
        first_message_preview: c.first_message_preview,
        model: c.model
    }));

    const uniqueCategories = [...new Set(conversations.map(c => c.category))];
    const estimatedFiles = uniqueCategories.length + 1; // +1 for _index.md

    return {
        summary: {
            source_type: sourceType,
            total_conversations: conversations.length,
            conversations_skipped: skipped,
            total_messages: totalMessages,
            date_range: {
                earliest: dates[0] || 'N/A',
                latest: dates[dates.length - 1] || 'N/A'
            },
            file_size_mb: Math.round(fileSizeMb * 100) / 100,
            parse_time_ms: parseTimeMs
        },
        categories,
        top_topics: topTopics,
        preview,
        recommendations: {
            estimated_files: estimatedFiles,
            estimated_size_kb: Math.round(conversations.length * 0.5),
            suggested_categories: uniqueCategories.filter(c => c !== 'uncategorized'),
            health_score_impact: conversations.length > 50
                ? '+8-12 points on usage dimension'
                : conversations.length > 10
                    ? '+4-8 points on usage dimension'
                    : '+1-4 points on usage dimension'
        }
    };
}

// --- Import Mode ---

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
}

function formatDate(isoString) {
    if (!isoString) return 'N/A';
    return isoString.slice(0, 10);
}

function generateMemoryFile(category, conversations, sourceType) {
    const now = new Date().toISOString();
    const lines = [
        '---',
        `source: ${sourceType}`,
        `imported_at: ${now}`,
        `conversations: ${conversations.length}`,
        `category: ${category}`,
        '---',
        '',
        `# ${category.charAt(0).toUpperCase() + category.slice(1)} Conversations`,
        '',
        '## Notable Conversations',
        ''
    ];

    for (const conv of conversations.slice(0, 20)) {
        const date = formatDate(conv.created_at);
        const preview = conv.first_message_preview
            ? ` -- ${conv.first_message_preview.slice(0, 100)}`
            : '';
        lines.push(`- **${conv.title}** (${date})${preview}`);
    }

    if (conversations.length > 20) {
        lines.push(`- ... and ${conversations.length - 20} more conversations`);
    }

    lines.push('');
    lines.push('## Raw Excerpts');
    lines.push('');

    let excerptCount = 0;
    for (const conv of conversations) {
        if (excerptCount >= 10) break;
        const texts = conv.userTexts || [];
        for (const text of texts.slice(0, 1)) {
            if (text.length > 50) {
                lines.push(`> ${text.slice(0, 300).replace(/\n/g, ' ')}`);
                lines.push('');
                excerptCount++;
                break;
            }
        }
    }

    return lines.join('\n');
}

function runImport(parsed, options = {}, safeBase = process.cwd()) {
    const start = Date.now();
    const { conversations, sourceType } = parsed;

    const mergeExisting = options.merge_existing ?? false;
    const rawOutputDir = options.output_dir || (mergeExisting ? 'memory/semantic' : 'memory/imported');
    const outputDir = resolve(safeBase, rawOutputDir);
    assertPathWithinBase(outputDir, safeBase, 'output_dir');
    const sourceSubdir = sourceType === 'chatgpt_export' ? 'chatgpt' : 'claude';

    // Group by category
    const byCategory = {};
    for (const conv of conversations) {
        if (!byCategory[conv.category]) byCategory[conv.category] = [];
        byCategory[conv.category].push(conv);
    }

    const filterCategories = options.categories;

    const files = [];
    let totalSizeKb = 0;

    for (const [category, convs] of Object.entries(byCategory)) {
        if (filterCategories && !filterCategories.includes(category)) continue;

        let filePath;
        if (mergeExisting) {
            const subdir = category === 'coding' ? 'patterns'
                : category === 'research' ? 'domain-knowledge'
                : category === 'operations' ? 'workflows'
                : 'imported';
            filePath = join(outputDir, subdir, `imported-${category}-${sourceSubdir}.md`);
        } else {
            filePath = join(outputDir, sourceSubdir, category, `${slugify(category)}-conversations.md`);
        }

        const dir = dirname(filePath);
        mkdirSync(dir, { recursive: true });

        const content = generateMemoryFile(category, convs, sourceType);
        writeFileSync(filePath, content, 'utf-8');

        const sizeKb = Math.round(Buffer.byteLength(content, 'utf-8') / 1024 * 100) / 100;
        totalSizeKb += sizeKb;

        files.push({
            path: filePath,
            category,
            source_conversations: convs.length,
            size_kb: sizeKb
        });
    }

    // Write _index.md
    if (!mergeExisting) {
        const indexPath = join(outputDir, '_index.md');
        mkdirSync(outputDir, { recursive: true });
        const indexLines = [
            '---',
            `source: ${sourceType}`,
            `imported_at: ${new Date().toISOString()}`,
            `total_conversations: ${conversations.length}`,
            '---',
            '',
            '# Import Summary',
            '',
            `**Source:** ${sourceType}`,
            `**Date:** ${new Date().toISOString().slice(0, 10)}`,
            `**Conversations:** ${conversations.length}`,
            '',
            '## Categories',
            '',
            ...Object.entries(byCategory)
                .filter(([cat]) => !filterCategories || filterCategories.includes(cat))
                .map(([cat, convs]) => `- **${cat}**: ${convs.length} conversations`),
            ''
        ];
        writeFileSync(indexPath, indexLines.join('\n'), 'utf-8');
    }

    const durationMs = Date.now() - start;

    return {
        summary: {
            conversations_processed: conversations.length,
            conversations_skipped: parsed.skipped,
            files_created: files.length,
            total_size_kb: Math.round(totalSizeKb * 100) / 100,
            duration_ms: durationMs
        },
        files,
        next_steps: [
            'Run check_health to see updated scores',
            mergeExisting
                ? 'Review imported files in memory/semantic/'
                : 'Review imported files in memory/imported/ before merging',
            'Use get_fix_suggestions focus:usage for targeted improvements'
        ]
    };
}

// --- Main Entry Point ---

export async function runImportContext({ source, mode, options, language, projectRoot }) {
    const startTime = Date.now();

    if (!source || !source.type || !source.path) {
        throw new Error('source.type and source.path are required');
    }

    const resolvedPath = resolve(source.path);
    const safeBase = projectRoot ? resolve(projectRoot) : process.cwd();

    let parsed;
    if (source.type === 'chatgpt_export') {
        if (!existsSync(resolvedPath)) {
            throw new Error(
                `File not found: ${resolvedPath}\n` +
                'Expected: conversations.json from ChatGPT Settings > Data Controls > Export Data'
            );
        }
        parsed = parseChatGPTExport(resolvedPath, options);
    } else if (source.type === 'claude_export') {
        if (!existsSync(resolvedPath)) {
            throw new Error(
                `Directory not found: ${resolvedPath}\n` +
                'Expected: directory with .json files from Claude Settings > Export Data'
            );
        }
        parsed = parseClaudeExport(resolvedPath, options);
    } else {
        throw new Error(
            `Unknown source type: ${source.type}\n` +
            `Supported: chatgpt_export, claude_export`
        );
    }

    const parseTimeMs = Date.now() - startTime;

    if (mode === 'import') {
        return runImport(parsed, options, safeBase);
    }

    // Default: scan
    return buildScanResult(parsed, parseTimeMs);
}
