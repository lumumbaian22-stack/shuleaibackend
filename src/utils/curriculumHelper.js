const CURRICULUMS = {
  cbc: { primary: [{ range: '80-100', grade: 'EE' }, { range: '60-79', grade: 'ME' }, { range: '40-59', grade: 'AE' }, { range: '0-39', grade: 'BE' }],
         secondary: [{ range: '81-100', grade: 'A' }, { range: '75-80', grade: 'A-' }, ...] }, // full from frontend
  // ... other curricula
};
function getGradeFromScore(score, curriculum, level) {
  const scale = CURRICULUMS[curriculum]?.[level] || CURRICULUMS.cbc.primary;
  for (const g of scale) {
    const [min, max] = g.range.split('-').map(Number);
    if (score >= min && score <= max) return g.grade;
  }
  return 'N/A';
}
module.exports = { getGradeFromScore };
