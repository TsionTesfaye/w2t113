/**
 * Q&A domain models — QuestionThread and Answer.
 */

export function createQuestionThread({ id, authorId, title, content, classId = null, createdAt }) {
  return {
    id,
    authorId,
    title,
    content,
    classId,
    createdAt: createdAt || new Date().toISOString(),
  };
}

export function createAnswer({ id, threadId, authorId, content, createdAt }) {
  return {
    id,
    threadId,
    authorId,
    content,
    createdAt: createdAt || new Date().toISOString(),
  };
}
