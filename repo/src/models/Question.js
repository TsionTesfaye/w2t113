/**
 * Question domain model for the question bank.
 */

export const QUESTION_TYPES = {
  SINGLE: 'single',
  MULTIPLE: 'multiple',
  FILL_IN: 'fill-in',
  SUBJECTIVE: 'subjective',
};

export function createQuestion({ id, questionText, type, options = [], correctAnswer, difficulty, tags = [], chapter = '', explanation = '', createdAt, updatedAt }) {
  return {
    id,
    questionText,
    type,
    options,          // array of { label, value } for single/multiple choice
    correctAnswer,    // string or array of strings (for multiple choice)
    difficulty,       // 1–5
    tags: Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()),
    chapter,
    explanation,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}
