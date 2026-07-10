'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { Class, sequelize } = require('../models');
const curriculumEngine = require('./curriculumStructureEngine');

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}
function key(value) {
  return cleanText(value).toLocaleLowerCase('en-KE');
}
function uniqueTexts(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanText(value);
    const k = key(text);
    if (!text || seen.has(k)) continue;
    seen.add(k);
    out.push(text);
  }
  return out;
}
function normalizeCustomClasses(values) {
  const input = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const item = typeof raw === 'string' ? { name: raw } : (raw || {});
    const name = cleanText(item.name || item.className);
    if (!name || seen.has(key(name))) continue;
    seen.add(key(name));
    out.push({
      name,
      grade: cleanText(item.grade || name),
      stream: cleanText(item.stream) || null,
      levelCode: cleanText(item.levelCode) || null,
      custom: true
    });
  }
  return out;
}
function normalizePerLevelStreams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [levelCode, streams] of Object.entries(value)) {
    const code = cleanText(levelCode);
    if (!code) continue;
    out[code] = uniqueTexts(streams);
  }
  return out;
}
function getConfig(school) {
  const settings = school?.settings || {};
  const raw = settings.classGeneration || settings.curriculumEngine?.classGeneration || {};
  return {
    streams: uniqueTexts(raw.streams),
    perLevelStreams: normalizePerLevelStreams(raw.perLevelStreams),
    customClasses: normalizeCustomClasses(raw.customClasses),
    namingSeparator: cleanText(raw.namingSeparator) || ' ',
    updatedAt: raw.updatedAt || null,
    updatedBy: raw.updatedBy || null
  };
}
function normalizeConfigPatch(school, patch = {}, actorUserId = null) {
  const current = getConfig(school);
  const raw = patch.classGeneration && typeof patch.classGeneration === 'object' ? patch.classGeneration : patch;
  const streams = raw.streams !== undefined ? uniqueTexts(raw.streams) : current.streams;
  const perLevelStreams = raw.perLevelStreams !== undefined ? normalizePerLevelStreams(raw.perLevelStreams) : current.perLevelStreams;
  const customClasses = raw.customClasses !== undefined ? normalizeCustomClasses(raw.customClasses) : current.customClasses;
  return {
    streams,
    perLevelStreams,
    customClasses,
    namingSeparator: cleanText(raw.namingSeparator || current.namingSeparator) || ' ',
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId || current.updatedBy || null
  };
}
function buildExpectedClasses(school) {
  const config = getConfig(school);
  const curriculum = curriculumEngine.getCurriculumConfig(school);
  const levels = curriculumEngine.getAllowedLevelsForSchool(school);
  const expected = [];
  const seen = new Set();

  for (const level of levels) {
    const hasOverride = Object.prototype.hasOwnProperty.call(config.perLevelStreams, level.code);
    const streams = hasOverride ? config.perLevelStreams[level.code] : config.streams;
    const variants = streams.length ? streams : [null];
    for (const stream of variants) {
      const name = stream ? `${level.label}${config.namingSeparator}${stream}` : level.label;
      const k = key(name);
      if (!name || seen.has(k)) continue;
      seen.add(k);
      expected.push({
        name,
        grade: level.label,
        stream: stream || null,
        levelCode: level.code,
        levelLabel: level.label,
        curriculumLevel: level.group || null,
        curriculum: curriculum.curriculum,
        custom: false
      });
    }
  }

  for (const custom of config.customClasses) {
    const k = key(custom.name);
    if (!custom.name || seen.has(k)) continue;
    seen.add(k);
    let level = null;
    if (custom.levelCode) level = curriculumEngine.getLevelByCode(curriculum.curriculum, custom.levelCode);
    if (!level) {
      const validation = curriculumEngine.validateClassLevel(school, custom.grade || custom.name);
      level = validation.level || null;
    }
    expected.push({
      ...custom,
      levelCode: level?.code || custom.levelCode || null,
      levelLabel: level?.label || custom.grade || custom.name,
      curriculumLevel: level?.group || null,
      curriculum: curriculum.curriculum
    });
  }
  return expected;
}
function previewToken(school, expected, existing) {
  const payload = {
    schoolCode: school.schoolId,
    schoolUpdatedAt: school.updatedAt ? new Date(school.updatedAt).toISOString() : null,
    expected: expected.map(x => [key(x.name), x.levelCode || '', key(x.stream || '')]),
    existing: existing.map(x => [Number(x.id), key(x.name), Boolean(x.isActive), x.updatedAt ? new Date(x.updatedAt).toISOString() : null])
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
async function preview(school, options = {}) {
  const existing = await Class.findAll({
    where: { schoolCode: school.schoolId },
    attributes: ['id','name','grade','stream','levelCode','isActive','teacherId','updatedAt'],
    order: [['name','ASC']],
    transaction: options.transaction || undefined,
    lock: options.lock || undefined
  });
  const expected = buildExpectedClasses(school);
  const existingByName = new Map(existing.map(row => [key(row.name), row]));
  const toCreate = [];
  const skippedExisting = [];
  for (const item of expected) {
    const found = existingByName.get(key(item.name));
    if (found) {
      skippedExisting.push({
        expected: item,
        existing: found.toJSON ? found.toJSON() : found,
        reason: found.isActive === false ? 'existing_archived_class' : 'already_exists'
      });
    } else {
      toCreate.push(item);
    }
  }
  return {
    schoolCode: school.schoolId,
    config: getConfig(school),
    expectedCount: expected.length,
    existingCount: existing.length,
    createCount: toCreate.length,
    skipCount: skippedExisting.length,
    toCreate,
    skippedExisting,
    previewToken: previewToken(school, expected, existing),
    destructiveChanges: false,
    note: options.note || 'Only missing classes will be created. Existing classes, teachers, students, assignments and history will not be changed.'
  };
}
function classSettings(school, spec) {
  const subjects = curriculumEngine.getEligibleSubjectsForClass(school, {
    grade: spec.grade,
    name: spec.name,
    levelCode: spec.levelCode,
    subjectTeachers: []
  });
  return {
    generatedFromSchoolSettings: true,
    generatedAt: new Date().toISOString(),
    curriculumMeta: {
      curriculum: spec.curriculum,
      structureType: curriculumEngine.getCurriculumConfig(school).structureType,
      levelCode: spec.levelCode,
      levelLabel: spec.levelLabel,
      curriculumLevel: spec.curriculumLevel
    },
    subjects: subjects.map(subject => ({
      id: subject.id,
      name: subject.name,
      category: subject.category,
      isCore: subject.isCore,
      countsInFinalByDefault: subject.countsInFinalByDefault
    }))
  };
}
async function apply(school, actorUserId, suppliedToken) {
  return sequelize.transaction(async transaction => {
    const lockedSchool = await SchoolLock(school, transaction);
    if (!lockedSchool) {
      const error = new Error('School no longer exists');
      error.statusCode = 404;
      throw error;
    }
    const current = await preview(lockedSchool, { transaction, lock:transaction.LOCK.UPDATE });
    if (!suppliedToken || suppliedToken !== current.previewToken) {
      const error = new Error('School settings or classes changed after the preview. Review the updated class preview before confirming.');
      error.statusCode = 409;
      error.code = 'CLASS_GENERATION_PREVIEW_STALE';
      error.preview = current;
      throw error;
    }
    const lockedExisting = await Class.findAll({
      where: { schoolCode: lockedSchool.schoolId },
      attributes: ['id','name'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const existingNames = new Set(lockedExisting.map(row => key(row.name)));
    const created = [];
    for (const spec of current.toCreate) {
      if (existingNames.has(key(spec.name))) continue;
      const row = await Class.create({
        name: spec.name,
        grade: spec.grade,
        stream: spec.stream || null,
        schoolCode: lockedSchool.schoolId,
        teacherId: null,
        subjectTeachers: [],
        academicYear: String(new Date().getFullYear()),
        curriculum: spec.curriculum,
        levelCode: spec.levelCode || null,
        levelLabel: spec.levelLabel || spec.grade,
        curriculumLevel: spec.curriculumLevel || null,
        isActive: true,
        settings: classSettings(lockedSchool, spec)
      }, { transaction, realtimeHandled: true });
      existingNames.add(key(spec.name));
      created.push(row.toJSON ? row.toJSON() : row);
    }
    await sequelize.query(`INSERT INTO "PlatformAuditEvents" ("schoolCode","actorUserId","eventType","payload","createdAt","updatedAt") VALUES (:schoolCode,:actorUserId,'school_classes_generated_from_settings',CAST(:payload AS JSONB),NOW(),NOW())`, {
      replacements: {
        schoolCode: lockedSchool.schoolId,
        actorUserId: actorUserId || null,
        payload: JSON.stringify({ createdClassIds: created.map(x => x.id), createdNames: created.map(x => x.name), skippedExisting: current.skippedExisting.map(x => x.existing?.id).filter(Boolean), destructiveChanges: false })
      },
      transaction
    }).catch(() => null);
    if (transaction.afterCommit && global.io) {
      transaction.afterCommit(() => global.io.to(`school-${lockedSchool.schoolId}`).emit('classes:generated', { schoolCode: lockedSchool.schoolId, created, count: created.length }));
    }
    return { ...current, created, createdCount: created.length };
  });
}
async function SchoolLock(school, transaction) {
  const School = require('../models').School;
  return School.findOne({ where: { id: school.id }, transaction, lock: transaction.LOCK.UPDATE });
}
async function refreshExistingClassMetadata(school) {
  const rows = await Class.findAll({ where: { schoolCode: school.schoolId, isActive: true } });
  const updated = [];
  for (const row of rows) {
    const validation = curriculumEngine.validateClassLevel(school, row.levelCode || row.grade || row.name);
    if (!validation.ok || !validation.level) continue;
    const spec = {
      name: row.name,
      grade: validation.level.label,
      stream: row.stream,
      levelCode: validation.level.code,
      levelLabel: validation.level.label,
      curriculumLevel: validation.level.group || null,
      curriculum: curriculumEngine.getCurriculumConfig(school).curriculum
    };
    await row.update({
      curriculum: spec.curriculum,
      levelCode: spec.levelCode,
      levelLabel: spec.levelLabel,
      curriculumLevel: spec.curriculumLevel,
      settings: { ...(row.settings || {}), ...classSettings(school, spec) }
    }, { hooks: false });
    updated.push(row.id);
  }
  return { updatedClassIds: updated, createdClassIds: [], deactivatedClassIds: [] };
}

module.exports = {
  cleanText,
  getConfig,
  normalizeConfigPatch,
  buildExpectedClasses,
  preview,
  apply,
  refreshExistingClassMetadata
};
