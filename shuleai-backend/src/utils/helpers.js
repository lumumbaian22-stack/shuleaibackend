const moment = require('moment');

/**
 * Format date to YYYY-MM-DD
 * @param {Date|String} date
 * @returns {String}
 */
const formatDate = (date) => moment(date).format('YYYY-MM-DD');

/**
 * Calculate age from date of birth
 * @param {Date} dob
 * @returns {Number}
 */
const calculateAge = (dob) => moment().diff(moment(dob), 'years');

/**
 * Generate a random string (e.g., for temporary passwords)
 * @param {Number} length
 * @returns {String}
 */
const randomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Paginate results
 * @param {Array} data - Full array of results
 * @param {Number} page - Page number (1-indexed)
 * @param {Number} limit - Items per page
 * @returns {Object} - { data, total, page, totalPages }
 */
const paginate = (data, page = 1, limit = 10) => {
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedData = data.slice(start, end);
  return {
    data: paginatedData,
    total: data.length,
    page,
    totalPages: Math.ceil(data.length / limit)
  };
};

/**
 * Deep clone an object
 * @param {Object} obj
 * @returns {Object}
 */
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * Check if a string is a valid email
 * @param {String} email
 * @returns {Boolean}
 */
const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

/**
 * Sanitize user input (basic XSS prevention)
 * @param {String} str
 * @returns {String}
 */
const sanitize = (str) => {
  return str.replace(/[&<>"]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return m;
  });
};

/**
 * Convert grade to points (for 8-4-4 system)
 * @param {String} grade
 * @returns {Number}
 */
const gradeToPoints = (grade) => {
  const map = {
    'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
    'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1
  };
  return map[grade] || 0;
};

module.exports = {
  formatDate,
  calculateAge,
  randomString,
  paginate,
  deepClone,
  isValidEmail,
  sanitize,
  gradeToPoints
};