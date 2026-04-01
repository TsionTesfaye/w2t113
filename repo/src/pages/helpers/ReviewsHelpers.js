/**
 * ReviewsHelpers — pure utility functions shared by ReviewsPage.
 *
 * Extracted from ReviewsPage to reduce module size and make the
 * eligible-class resolution and image-processing logic independently testable.
 */

import { escapeHtml, validateImageFile, readFileAsDataURL } from '../../utils/helpers.js';

/**
 * Return completed classes where userId is an eligible participant.
 * Eligible means: has an Approved registration, or is the class instructor.
 *
 * @param {object} classRepo  - repository with getAll()
 * @param {object} regRepo    - repository with getByUserId()
 * @param {string} userId
 * @returns {Promise<Array>}  - filtered array of class objects
 */
export async function getEligibleCompletedClasses(classRepo, regRepo, userId) {
  const allClasses = await classRepo.getAll();
  const completedClasses = allClasses.filter(c => c.status === 'completed');
  const userRegs = await regRepo.getByUserId(userId);
  const approvedClassIds = new Set(
    userRegs.filter(r => r.status === 'Approved').map(r => r.classId)
  );
  return completedClasses.filter(c => approvedClassIds.has(c.id) || c.instructorId === userId);
}

/**
 * Build an HTML string of <option> elements for a list of class objects.
 *
 * @param {Array} classes
 * @returns {string}
 */
export function buildClassOptions(classes) {
  return classes
    .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.title || c.id)}</option>`)
    .join('');
}

/**
 * Validate and convert an array of File objects to data-URL image records.
 * Throws an Error describing the first validation failure encountered.
 *
 * @param {File[]} files
 * @param {number} maxImages  default 6
 * @param {number} maxMB      default 2
 * @returns {Promise<Array<{dataUrl, filename, size, type}>>}
 */
export async function processImageFiles(files, maxImages = 6, maxMB = 2) {
  if (files.length > maxImages) {
    throw new Error(`Maximum ${maxImages} images allowed.`);
  }
  const images = [];
  for (const file of files) {
    const validation = validateImageFile(file, maxMB);
    if (!validation.valid) {
      throw new Error(`${file.name}: ${validation.error}`);
    }
    const dataUrl = await readFileAsDataURL(file);
    images.push({ dataUrl, filename: file.name, size: file.size, type: file.type });
  }
  return images;
}
