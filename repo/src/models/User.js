/**
 * User domain model.
 * Roles: Administrator, Staff Reviewer, Instructor, Learner.
 */

export const USER_ROLES = {
  ADMINISTRATOR: 'Administrator',
  STAFF_REVIEWER: 'Staff Reviewer',
  INSTRUCTOR: 'Instructor',
  LEARNER: 'Learner',
};

export function createUser({ id, username, passwordHash, role, displayName = '', email = '', lockoutUntil = null, createdAt, updatedAt }) {
  return {
    id,
    username,
    passwordHash,
    role,
    displayName: displayName || username,
    email,
    lockoutUntil,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

export default { USER_ROLES, createUser };
