const crypto = require('crypto');
const fs = require('fs');
const { MediaAsset } = require('../models');
const { uploadPersistentObject } = require('./objectStorageService');

function normalizeMime(file, fallback = 'application/octet-stream') {
  return String(file?.mimetype || file?.type || fallback).toLowerCase();
}

async function readUploadBuffer(file) {
  if (!file) throw Object.assign(new Error('No file uploaded.'), { status: 400 });
  if (file.data && Buffer.isBuffer(file.data) && file.data.length) return Buffer.from(file.data);
  if (file.buffer && Buffer.isBuffer(file.buffer) && file.buffer.length) return Buffer.from(file.buffer);
  const p = file.tempFilePath || file.path;
  if (p) return fs.promises.readFile(p);
  throw Object.assign(new Error('Unsupported upload object.'), { status: 400 });
}

function validateImageMime(mime, { allowSvg = false } = {}) {
  const pattern = allowSvg ? /^image\/(png|jpe?g|webp|gif|svg\+xml)$/ : /^image\/(png|jpe?g|webp|gif)$/;
  if (!pattern.test(mime)) {
    throw Object.assign(new Error('Only PNG, JPG, WEBP and GIF images are allowed.'), { status: 400 });
  }
}

function validateGenericMime(mime, { allowedMimePrefixes = null, allowedMimeTypes = null } = {}) {
  if (Array.isArray(allowedMimeTypes) && allowedMimeTypes.length && !allowedMimeTypes.includes(mime)) {
    throw Object.assign(new Error('This file type is not allowed.'), { status: 400 });
  }
  if (Array.isArray(allowedMimePrefixes) && allowedMimePrefixes.length && !allowedMimePrefixes.some(prefix => mime.startsWith(prefix))) {
    throw Object.assign(new Error('This file type is not allowed.'), { status: 400 });
  }
}

async function saveBufferAsset({
  buffer,
  mimeType,
  originalName,
  schoolCode,
  ownerUserId = null,
  kind,
  metadata = {},
  maxBytes = 5 * 1024 * 1024,
  allowSvg = false,
  allowAnyMime = false,
  allowedMimePrefixes = null,
  allowedMimeTypes = null,
  deactivatePrevious = true
}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('Uploaded file is empty.'), { status: 400 });
  if (buffer.length > maxBytes) throw Object.assign(new Error(`File is too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)}MB.`), { status: 400 });
  if (allowAnyMime) validateGenericMime(mimeType, { allowedMimePrefixes, allowedMimeTypes });
  else validateImageMime(mimeType, { allowSvg });

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  if (deactivatePrevious && ownerUserId) {
    await MediaAsset.update({ isActive: false }, { where: { ownerUserId, kind, isActive: true } }).catch(() => {});
  }

  const storage = await uploadPersistentObject({ buffer, mimeType, originalName, schoolCode, kind, checksum });
  const storageProvider = storage.provider || 'database';
  const externalUrl = storage.externalUrl || null;
  const shouldKeepDatabaseCopy = storageProvider === 'database' || process.env.MEDIA_KEEP_DB_COPY === 'true';
  const assetData = shouldKeepDatabaseCopy ? buffer : Buffer.alloc(0);
  const mergedMetadata = {
    ...(metadata || {}),
    storageProvider,
    externalUrl,
    cloudinary: storage.provider === 'cloudinary' ? {
      publicId: storage.publicId,
      resourceType: storage.resourceType,
      format: storage.format,
      bytes: storage.bytes,
      raw: storage.raw
    } : undefined,
    storageWarning: storage.warning || undefined
  };

  const asset = await MediaAsset.create({
    schoolCode: schoolCode || null,
    ownerUserId: ownerUserId || null,
    kind,
    mimeType,
    originalName: String(originalName || `${kind}.asset`).slice(0, 255),
    byteSize: buffer.length,
    checksum,
    data: assetData,
    storageProvider,
    externalUrl,
    metadata: mergedMetadata,
    isActive: true
  });

  return {
    asset,
    url: externalUrl || `/api/media/${asset.token}`,
    token: asset.token,
    checksum,
    byteSize: buffer.length,
    mimeType,
    storageProvider,
    externalUrl,
    durable: true
  };
}

async function saveUploadAsset(options) {
  const buffer = await readUploadBuffer(options.file);
  const mimeType = normalizeMime(options.file);
  try {
    return await saveBufferAsset({
      ...options,
      buffer,
      mimeType,
      originalName: options.originalName || options.file?.name || options.file?.originalname
    });
  } finally {
    const temp = options.file?.tempFilePath || options.file?.path;
    if (temp) fs.promises.unlink(temp).catch(() => {});
  }
}

async function saveDataUrlAsset({ dataUrl, ...options }) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) throw Object.assign(new Error('Invalid image data.'), { status: 400 });
  return saveBufferAsset({
    ...options,
    buffer: Buffer.from(m[2], 'base64'),
    mimeType: m[1].toLowerCase(),
    originalName: options.originalName || `${options.kind}.png`
  });
}

module.exports = { readUploadBuffer, saveBufferAsset, saveUploadAsset, saveDataUrlAsset };
