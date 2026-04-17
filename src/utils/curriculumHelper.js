// Full grading scales for all curricula
const CURRICULUMS = {
  cbc: {
    primary: [
      { range: '80-100', grade: 'EE' },
      { range: '60-79', grade: 'ME' },
      { range: '40-59', grade: 'AE' },
      { range: '0-39', grade: 'BE' }
    ],
    secondary: [
      { range: '81-100', grade: 'A' },
      { range: '75-80', grade: 'A-' },
      { range: '70-74', grade: 'B+' },
      { range: '65-69', grade: 'B' },
      { range: '60-64', grade: 'B-' },
      { range: '55-59', grade: 'C+' },
      { range: '50-54', grade: 'C' },
      { range: '45-49', grade: 'C-' },
      { range: '40-44', grade: 'D+' },
      { range: '35-39', grade: 'D' },
      { range: '30-34', grade: 'D-' },
      { range: '0-29', grade: 'E' }
    ]
  },
  '844': {
    primary: [
      { range: '81-100', grade: 'A' },
      { range: '75-80', grade: 'A-' },
      { range: '70-74', grade: 'B+' },
      { range: '65-69', grade: 'B' },
      { range: '60-64', grade: 'B-' },
      { range: '55-59', grade: 'C+' },
      { range: '50-54', grade: 'C' },
      { range: '45-49', grade: 'C-' },
      { range: '40-44', grade: 'D+' },
      { range: '35-39', grade: 'D' },
      { range: '30-34', grade: 'D-' },
      { range: '0-29', grade: 'E' }
    ],
    secondary: [
      { range: '81-100', grade: 'A' },
      { range: '75-80', grade: 'A-' },
      { range: '70-74', grade: 'B+' },
      { range: '65-69', grade: 'B' },
      { range: '60-64', grade: 'B-' },
      { range: '55-59', grade: 'C+' },
      { range: '50-54', grade: 'C' },
      { range: '45-49', grade: 'C-' },
      { range: '40-44', grade: 'D+' },
      { range: '35-39', grade: 'D' },
      { range: '30-34', grade: 'D-' },
      { range: '0-29', grade: 'E' }
    ]
  },
  british: {
    primary: [
      { range: '90-100', grade: 'A*' }, { range: '80-89', grade: 'A' },
      { range: '70-79', grade: 'B' }, { range: '60-69', grade: 'C' },
      { range: '50-59', grade: 'D' }, { range: '40-49', grade: 'E' },
      { range: '30-39', grade: 'F' }, { range: '20-29', grade: 'G' },
      { range: '0-19', grade: 'U' }
    ],
    secondary: [
      { range: '90-100', grade: 'A*' }, { range: '80-89', grade: 'A' },
      { range: '70-79', grade: 'B' }, { range: '60-69', grade: 'C' },
      { range: '50-59', grade: 'D' }, { range: '40-49', grade: 'E' },
      { range: '30-39', grade: 'F' }, { range: '20-29', grade: 'G' },
      { range: '0-19', grade: 'U' }
    ]
  },
  american: {
    primary: [
      { range: '90-100', grade: 'A' }, { range: '80-89', grade: 'B' },
      { range: '70-79', grade: 'C' }, { range: '60-69', grade: 'D' },
      { range: '0-59', grade: 'F' }
    ],
    secondary: [
      { range: '90-100', grade: 'A' }, { range: '80-89', grade: 'B' },
      { range: '70-79', grade: 'C' }, { range: '60-69', grade: 'D' },
      { range: '0-59', grade: 'F' }
    ]
  }
};

function getGradeFromScore(score, curriculum, level) {
  const curriculumData = CURRICULUMS[curriculum];
  if (!curriculumData) return { grade: 'N/A', description: 'Not available' };

  // Normalize level
  let normalizedLevel = level;
  if (level === 'both') normalizedLevel = 'secondary';
  if (!curriculumData[normalizedLevel]) normalizedLevel = 'primary';

  const scale = curriculumData[normalizedLevel];
  const scoreNum = Number(score);
  
  if (isNaN(scoreNum)) {
    return { grade: 'N/A', description: 'Invalid score' };
  }

  for (const gradeInfo of scale) {
    const [min, max] = gradeInfo.range.split('-').map(Number);
    if (scoreNum >= min && scoreNum <= max) {
      return gradeInfo;
    }
  }
  return { grade: 'N/A', description: 'Invalid score' };
}

// Helper to get subjects for a curriculum and level
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
  
  const levelKey = level === 'both' ? 'secondary' : level;
  return subjects[curriculum]?.[levelKey] || subjects.cbc.secondary;
}

module.exports = { getGradeFromScore, getSubjectsForCurriculum, CURRICULUMS };
