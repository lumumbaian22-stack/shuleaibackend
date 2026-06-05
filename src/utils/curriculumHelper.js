// src/utils/curriculumHelper.js – CORRECTED (returns string only)

const CURRICULUMS = {
    cbc: {
        primary: [
            { range: [80, 100], grade: 'EE' },
            { range: [60, 79], grade: 'ME' },
            { range: [40, 59], grade: 'AE' },
            { range: [0, 39], grade: 'BE' }
        ],
        secondary: [
            { range: [80, 100], grade: 'A' },
            { range: [75, 79], grade: 'A-' },
            { range: [70, 74], grade: 'B+' },
            { range: [65, 69], grade: 'B' },
            { range: [60, 64], grade: 'B-' },
            { range: [55, 59], grade: 'C+' },
            { range: [50, 54], grade: 'C' },
            { range: [45, 49], grade: 'C-' },
            { range: [40, 44], grade: 'D+' },
            { range: [35, 39], grade: 'D' },
            { range: [30, 34], grade: 'D-' },
            { range: [0, 29], grade: 'E' }
        ]
    },
    '844': {
        primary: [
            { range: [80, 100], grade: 'A' },
            { range: [75, 79], grade: 'A-' },
            { range: [70, 74], grade: 'B+' },
            { range: [65, 69], grade: 'B' },
            { range: [60, 64], grade: 'B-' },
            { range: [55, 59], grade: 'C+' },
            { range: [50, 54], grade: 'C' },
            { range: [45, 49], grade: 'C-' },
            { range: [40, 44], grade: 'D+' },
            { range: [35, 39], grade: 'D' },
            { range: [30, 34], grade: 'D-' },
            { range: [0, 29], grade: 'E' }
        ],
        secondary: [
            { range: [80, 100], grade: 'A' },
            { range: [75, 79], grade: 'A-' },
            { range: [70, 74], grade: 'B+' },
            { range: [65, 69], grade: 'B' },
            { range: [60, 64], grade: 'B-' },
            { range: [55, 59], grade: 'C+' },
            { range: [50, 54], grade: 'C' },
            { range: [45, 49], grade: 'C-' },
            { range: [40, 44], grade: 'D+' },
            { range: [35, 39], grade: 'D' },
            { range: [30, 34], grade: 'D-' },
            { range: [0, 29], grade: 'E' }
        ]
    },
    british: {
        primary: [
            { range: [90, 100], grade: 'A*' },
            { range: [80, 89], grade: 'A' },
            { range: [70, 79], grade: 'B' },
            { range: [60, 69], grade: 'C' },
            { range: [50, 59], grade: 'D' },
            { range: [40, 49], grade: 'E' },
            { range: [30, 39], grade: 'F' },
            { range: [20, 29], grade: 'G' },
            { range: [0, 19], grade: 'U' }
        ],
        secondary: [
            { range: [90, 100], grade: 'A*' },
            { range: [80, 89], grade: 'A' },
            { range: [70, 79], grade: 'B' },
            { range: [60, 69], grade: 'C' },
            { range: [50, 59], grade: 'D' },
            { range: [40, 49], grade: 'E' },
            { range: [30, 39], grade: 'F' },
            { range: [20, 29], grade: 'G' },
            { range: [0, 19], grade: 'U' }
        ]
    },
    american: {
        primary: [
            { range: [90, 100], grade: 'A' },
            { range: [80, 89], grade: 'B' },
            { range: [70, 79], grade: 'C' },
            { range: [60, 69], grade: 'D' },
            { range: [0, 59], grade: 'F' }
        ],
        secondary: [
            { range: [90, 100], grade: 'A' },
            { range: [80, 89], grade: 'B' },
            { range: [70, 79], grade: 'C' },
            { range: [60, 69], grade: 'D' },
            { range: [0, 59], grade: 'F' }
        ]
    }
};

function normalizeCurriculumKey(curriculum) {
    const key = String(curriculum || 'cbc').toLowerCase().trim();
    if (['8-4-4','844','8_4_4'].includes(key)) return '844';
    if (['british','igcse','cambridge'].includes(key)) return 'british';
    if (['american','us','usa'].includes(key)) return 'american';
    return 'cbc';
}

function parseGradeRange(entry) {
    if (!entry || typeof entry !== 'object') return null;
    let min = entry.min ?? entry.minScore ?? entry.from ?? entry.low ?? null;
    let max = entry.max ?? entry.maxScore ?? entry.to ?? entry.high ?? null;
    const rawRange = entry.range ?? entry.scoreRange ?? entry.marksRange ?? entry.bounds;
    if ((min === null || max === null) && Array.isArray(rawRange) && rawRange.length >= 2) {
        min = rawRange[0]; max = rawRange[1];
    }
    if ((min === null || max === null) && typeof rawRange === 'string') {
        const m = rawRange.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
        if (m) { min = m[1]; max = m[2]; }
    }
    min = Number(min); max = Number(max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min > max) [min, max] = [max, min];
    return { min, max };
}

function normalizeLevelForGrading(level) {
    const raw = String(level || '').toLowerCase();
    if (/pp\s*1|pp\s*2|play|pre.?primary|early|grade\s*[1-6]\b|grade_[1-6]\b|primary|standard\s*[1-8]/.test(raw)) return 'primary';
    if (/grade\s*[7-9]\b|grade_[7-9]\b|junior/.test(raw)) return 'primary';
    if (/grade\s*1[0-2]\b|grade_1[0-2]\b|senior|secondary|form\s*[1-4]/.test(raw)) return 'secondary';
    if (raw === 'both' || raw === 'mixed' || raw === 'full') return 'primary';
    return raw || 'primary';
}

function getGradeFromScore(score, curriculum, level, customScale) {
    const scoreNum = Number(score);
    if (!Number.isFinite(scoreNum)) return 'N/A';

    if (Array.isArray(customScale) && customScale.length) {
        for (const entry of customScale) {
            const bounds = parseGradeRange(entry);
            if (!bounds) continue;
            if (scoreNum >= bounds.min && scoreNum <= bounds.max) return entry.grade || entry.label || 'N/A';
        }
    }

    const curriculumData = CURRICULUMS[normalizeCurriculumKey(curriculum)];
    if (!curriculumData) return 'N/A';

    const normalizedLevel = normalizeLevelForGrading(level);
    const scale = curriculumData[normalizedLevel] || curriculumData.primary || curriculumData.secondary;
    if (!scale) return 'N/A';

    for (const entry of scale) {
        const bounds = parseGradeRange(entry);
        if (bounds && scoreNum >= bounds.min && scoreNum <= bounds.max) {
            return entry.grade;
        }
    }
    return 'N/A';
}

function getSubjectsForCurriculum(curriculum, level) {
    const subjects = {
        cbc: {
            primary: ['Mathematics', 'English', 'Kiswahili', 'Science', 'Social Studies', 'CRE/IRE', 'Physical Education'],
            secondary: ['Mathematics', 'English', 'Kiswahili', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'CRE/IRE', 'Business Studies', 'Agriculture', 'Computer Studies']
        },
        '844': {
            primary: ['Mathematics', 'English', 'Kiswahili', 'Science', 'Social Studies', 'CRE/IRE'],
            secondary: ['Mathematics', 'English', 'Kiswahili', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'CRE/IRE', 'Business Studies', 'Agriculture', 'Computer Studies']
        },
        british: {
            primary: ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Art', 'Music', 'PE'],
            secondary: ['English', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'French', 'Spanish', 'Computer Science', 'Business', 'Economics']
        },
        american: {
            primary: ['English Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Art', 'Music', 'PE'],
            secondary: ['English', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'History', 'Government', 'Economics', 'Spanish', 'French', 'Computer Science']
        }
    };
    const levelKey = (level === 'both' || level === 'secondary') ? 'secondary' : 'primary';
    return subjects[curriculum]?.[levelKey] || subjects.cbc.secondary;
}

module.exports = { getGradeFromScore, getSubjectsForCurriculum, CURRICULUMS, normalizeCurriculumKey };
