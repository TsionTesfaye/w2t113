/**
 * Demo user seeds — only used when the server is started with DEMO_SEED=true.
 * These accounts are created automatically on first load, replacing the
 * manual bootstrap flow so testers can log in immediately.
 *
 * All four application roles are represented.
 */

import { USER_ROLES } from '../models/User.js';

export const DEMO_USERS = [
  {
    username:    'admin',
    password:    'Admin1234!',
    role:        USER_ROLES.ADMINISTRATOR,
    displayName: 'Administrator',
  },
  {
    username:    'reviewer',
    password:    'Review123!',
    role:        USER_ROLES.STAFF_REVIEWER,
    displayName: 'Staff Reviewer',
  },
  {
    username:    'instructor',
    password:    'Teach1234!',
    role:        USER_ROLES.INSTRUCTOR,
    displayName: 'Instructor',
  },
  {
    username:    'learner',
    password:    'Learn1234!',
    role:        USER_ROLES.LEARNER,
    displayName: 'Learner',
  },
];
