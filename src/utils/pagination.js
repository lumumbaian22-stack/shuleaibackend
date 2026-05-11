function clampNumber(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function getPagination(query = {}, defaults = {}) {
  const maxLimit = defaults.maxLimit || Number(process.env.MAX_PAGE_LIMIT || 100);
  const defaultLimit = defaults.defaultLimit || Number(process.env.DEFAULT_PAGE_LIMIT || 50);
  const page = clampNumber(query.page, 1, 1, 1000000);
  const limit = clampNumber(query.limit, defaultLimit, 1, maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function makePageResponse({ rows = [], count = 0, page, limit }) {
  const totalPages = Math.max(1, Math.ceil(count / limit));
  return {
    rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

module.exports = { getPagination, makePageResponse };
