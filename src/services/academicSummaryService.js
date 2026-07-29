'use strict';

const DEFAULT_ASSESSMENTS = [
  { key: 'cat1', label: 'CAT 1', assessmentType: 'CAT 1', showOnReport: true, countInFinal: true, weight: 10, displayOrder: 1 },
  { key: 'cat2', label: 'CAT 2', assessmentType: 'CAT 2', showOnReport: true, countInFinal: true, weight: 10, displayOrder: 2 },
  { key: 'midterm', label: 'Midterm', assessmentType: 'Midterm', showOnReport: true, countInFinal: true, weight: 20, displayOrder: 3 },
  { key: 'endterm', label: 'End Term', assessmentType: 'EndTerm', showOnReport: true, countInFinal: true, weight: 60, displayOrder: 4 }
];

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function token(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function canonicalAssessmentType(value) {
  const raw = token(value);
  if (!raw) return 'custom';
  if (/endterm|endofterm|finalexam|finalterm|final/.test(raw)) return 'endterm';
  if (/midterm|midofterm/.test(raw)) return 'midterm';
  if (/opener|openingexam|beginningofterm/.test(raw)) return 'opener';
  if (/cat1|continuousassessment1/.test(raw)) return 'cat1';
  if (/cat2|continuousassessment2/.test(raw)) return 'cat2';
  if (/cat|continuousassessment/.test(raw)) return 'cat';
  if (/sba|schoolbasedassessment/.test(raw)) return 'sba';
  if (/project/.test(raw)) return 'project';
  if (/practical/.test(raw)) return 'practical';
  return raw;
}

function normalizeAssessmentSettings(input) {
  const source = Array.isArray(input) && input.length ? input : DEFAULT_ASSESSMENTS;
  const rows = source.map((row, index) => {
    const label = String(row.label || row.displayName || row.name || row.assessmentName || row.assessmentType || `Assessment ${index + 1}`).trim();
    const inferredType = canonicalAssessmentType(`${row.key || ''} ${label}`);
    const declaredType = canonicalAssessmentType(row.assessmentType || row.type || label);
    const assessmentType = inferredType !== 'custom' ? inferredType : declaredType;
    const weight = Math.max(0, numberOrNull(row.weight ?? row.weightPercent) || 0);
    return {
      ...row,
      key: token(row.key || assessmentType || label) || `custom${index + 1}`,
      name: label,
      label,
      displayName: label,
      assessmentType,
      type: assessmentType,
      showOnReport: row.showOnReport !== false,
      countInFinal: row.countInFinal !== false,
      weight,
      weightPercent: weight,
      displayOrder: Number(row.displayOrder || index + 1),
      isActive: row.isActive !== false
    };
  }).filter(row => row.isActive);
  const counted = rows.filter(row => row.countInFinal);
  const totalWeight = counted.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.001) {
    counted.forEach(row => {
      row.weight = Math.round((row.weight / totalWeight) * 10000) / 100;
      row.weightPercent = row.weight;
    });
  }
  return rows;
}

function recordAssessmentType(record) {
  return canonicalAssessmentType(
    record.assessmentName
    || record.assessmentType
    || record.testType
    || record.examType
    || record.assessment
    || record.type
  );
}

function buildAcademicSummary(records = [], options = {}) {
  const settings = normalizeAssessmentSettings(options.assessmentSettings);
  const settingMap = new Map();
  settings.forEach(setting => {
    [setting.key, setting.assessmentType, setting.type, setting.label, setting.name].forEach(value => {
      const key = canonicalAssessmentType(value);
      if (key) settingMap.set(key, setting);
    });
  });
  const bySubject = new Map();
  for (const rawRecord of records || []) {
    const record = rawRecord?.toJSON ? rawRecord.toJSON() : rawRecord;
    const score = numberOrNull(record?.score);
    const subject = String(record?.subject || '').trim();
    if (!subject || score === null || score < 0) continue;
    const subjectKey = token(subject);
    if (!bySubject.has(subjectKey)) bySubject.set(subjectKey, { subject, records: [] });
    bySubject.get(subjectKey).records.push({ ...record, score });
  }

  const subjects = [...bySubject.values()].map(group => {
    const byAssessment = new Map();
    group.records.forEach(record => {
      const assessmentType = recordAssessmentType(record);
      if (!byAssessment.has(assessmentType)) byAssessment.set(assessmentType, []);
      byAssessment.get(assessmentType).push(record);
    });
    const components = [...byAssessment.entries()].map(([assessmentType, assessmentRecords]) => {
      const setting = settingMap.get(assessmentType);
      const score = assessmentRecords.reduce((sum, record) => sum + record.score, 0) / assessmentRecords.length;
      const explicitWeight = numberOrNull(assessmentRecords.find(record => numberOrNull(record.assessmentWeight) !== null)?.assessmentWeight);
      return {
        assessmentType,
        label: setting?.label || assessmentRecords[0]?.assessmentName || assessmentRecords[0]?.assessmentType || assessmentType,
        score: Math.round(score * 100) / 100,
        weight: explicitWeight ?? setting?.weight ?? 0,
        countInFinal: setting?.countInFinal !== false && !assessmentRecords.some(record => record.countInFinal === false),
        showOnReport: setting?.showOnReport !== false && !assessmentRecords.some(record => record.showOnReport === false),
        displayOrder: setting?.displayOrder ?? 999,
        records: assessmentRecords
      };
    }).sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
    const counted = components.filter(component => component.countInFinal);
    const weighted = counted.filter(component => component.weight > 0);
    const score = weighted.length
      ? weighted.reduce((sum, component) => sum + (component.score * component.weight), 0) / weighted.reduce((sum, component) => sum + component.weight, 0)
      : (counted.length ? counted.reduce((sum, component) => sum + component.score, 0) / counted.length : null);
    const average = score === null ? null : Math.round(score * 100) / 100;
    return {
      subject: group.subject,
      average,
      score: average,
      grade: average === null ? null : (options.gradeFromScore ? options.gradeFromScore(average) : null),
      components,
      assessments: components.flatMap(component => component.records),
      counted: average !== null
    };
  }).sort((a, b) => a.subject.localeCompare(b.subject));

  const countedSubjects = subjects.filter(subject => subject.counted && numberOrNull(subject.average) !== null);
  const overallAverage = countedSubjects.length
    ? Math.round((countedSubjects.reduce((sum, subject) => sum + Number(subject.average), 0) / countedSubjects.length) * 100) / 100
    : null;
  return {
    subjects,
    countedSubjects: countedSubjects.length,
    overallAverage,
    average: overallAverage,
    overallGrade: overallAverage === null ? null : (options.gradeFromScore ? options.gradeFromScore(overallAverage) : null),
    assessmentSettings: settings,
    calculationRule: 'Assessments are averaged within each type, weighted within each subject, then completed subject averages are averaged once each.'
  };
}

module.exports = {
  DEFAULT_ASSESSMENTS,
  canonicalAssessmentType,
  normalizeAssessmentSettings,
  buildAcademicSummary
};
