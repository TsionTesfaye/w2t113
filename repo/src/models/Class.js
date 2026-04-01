/**
 * Class domain model — represents a training class.
 */

export function createClass({ id, title, description = '', instructorId, capacity, startDate, endDate, status = 'active', createdAt, updatedAt }) {
  return {
    id,
    title,
    description,
    instructorId,
    capacity,           // max seats
    startDate,
    endDate,
    status,             // 'active', 'completed', 'cancelled'
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}
