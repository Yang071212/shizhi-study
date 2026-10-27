import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { SUBJECTS, LESSONS } from '../dist/content.mjs';

test('published curriculum contains 40 complete lessons, valid quizzes, real examples and renderable mathematics', () => {
  const expectedSubjects = ['c', 'python', 'calculus', 'linear'];
  assert.deepEqual(SUBJECTS.map(subject => subject.id).sort(), [...expectedSubjects].sort());
  assert.equal(LESSONS.length, 40, 'README promises 40 published lessons');
  assert.equal(new Set(LESSONS.map(lesson => lesson.id)).size, 40, 'lesson IDs must remain unique');

  const unfinished = /\b(?:TODO|TBD|FIXME|placeholder|coming soon|lorem ipsum)\b|待补充|待完善|占位内容/i;
  for (const subjectId of expectedSubjects) {
    const subject = SUBJECTS.find(item => item.id === subjectId);
    const lessons = LESSONS.filter(lesson => lesson.subject === subjectId);
    assert.equal(lessons.length, 10, `${subjectId}: README promises ten lessons per subject`);
    for (let number = 1; number <= 10; number += 1) {
      assert.ok(lessons.some(lesson => lesson.id === `${subjectId}-${String(number).padStart(2, '0')}`), `${subjectId}: stable lesson ${number} is missing`);
    }

    for (const lesson of lessons) {
      assert.ok(subject.chapters.includes(lesson.chapter), `${lesson.id}: unknown chapter`);
      assert.ok(lesson.content.trim().length >= 400, `${lesson.id}: substantive explanation is missing`);
      assert.doesNotMatch([lesson.title, lesson.summary, lesson.content, lesson.quiz?.explanation].join('\n'), unfinished, `${lesson.id}: unfinished content`);
      assert.ok(Array.isArray(lesson.quiz?.options) && lesson.quiz.options.length === 4, `${lesson.id}: four answer choices required`);
      assert.equal(new Set(lesson.quiz.options).size, 4, `${lesson.id}: answer choices must be distinct`);
      assert.ok(lesson.quiz.options.every(option => typeof option === 'string' && option.trim()), `${lesson.id}: empty answer choice`);
      assert.ok(Number.isInteger(lesson.quiz.answer) && lesson.quiz.answer >= 0 && lesson.quiz.answer < 4, `${lesson.id}: correct answer is outside the options`);
      assert.ok(lesson.quiz.question?.trim() && lesson.quiz.explanation?.trim(), `${lesson.id}: question or explanation missing`);
      const text = [lesson.title, lesson.summary, lesson.content, ...lesson.objectives, ...lesson.takeaways, lesson.quiz.question, ...lesson.quiz.options, lesson.quiz.explanation].join('\n');
      assert.doesNotMatch(text, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, `${lesson.id}: invisible control characters corrupt displayed content`);

      if (subjectId === 'c' || subjectId === 'python') {
        const language = subjectId === 'c' ? 'c' : 'python';
        const blocks = [...lesson.content.matchAll(new RegExp(`^~~~${language}\\r?\\n([\\s\\S]*?)^~~~\\s*$`, 'gm'))];
        assert.ok(blocks.length, `${lesson.id}: runnable ${language} example is missing`);
        assert.ok(blocks.every(block => block[1].trim().length > 20), `${lesson.id}: empty code example`);
        if (subjectId === 'c') assert.ok(blocks.some(block => /int\s+main\s*\(/.test(block[1])), `${lesson.id}: complete C entry point missing`);
      }

      for (const formula of lesson.content.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)) {
        assert.doesNotThrow(() => katex.renderToString(formula[1] ?? formula[2], { displayMode: formula[1] !== undefined, throwOnError: true, strict: 'error' }), `${lesson.id}: invalid mathematics ${formula[0]}`);
      }
    }
  }
});
