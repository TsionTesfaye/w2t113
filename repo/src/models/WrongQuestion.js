/**
 * WrongQuestion (wrong-question notebook) domain model.
 */

export function createWrongQuestion({ id, userId, questionId, userAnswer, correctAnswer, explanation = '', quizId = null, createdAt }) {
  return {
    id,
    userId,
    questionId,
    userAnswer,
    correctAnswer,
    explanation,
    quizId,
    createdAt: createdAt || new Date().toISOString(),
  };
}
