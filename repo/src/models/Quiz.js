/**
 * Quiz and QuizResult domain models.
 */

export function createQuiz({ id, title, classId, questionIds = [], rules = {}, createdBy, createdAt }) {
  return {
    id,
    title,
    classId,
    questionIds,
    rules,         // { totalQuestions, difficultyDistribution, chapterConstraints }
    createdBy,
    createdAt: createdAt || new Date().toISOString(),
  };
}

export function createQuizResult({ id, quizId, userId, answers = [], objectiveScore = null, subjectiveScores = {}, totalScore = null, gradedBy = null, gradedAt = null, submittedAt }) {
  return {
    id,
    quizId,
    userId,
    answers,             // [{ questionId, answer, isCorrect (for objective), autoGraded }]
    objectiveScore,
    subjectiveScores,    // { questionId: { score, notes, gradedBy } }
    totalScore,
    gradedBy,
    gradedAt,
    submittedAt: submittedAt || new Date().toISOString(),
  };
}
