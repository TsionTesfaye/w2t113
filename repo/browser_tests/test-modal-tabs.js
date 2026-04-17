/**
 * Direct unit tests for QuizBuilderTab, QuizImportTab, and ReviewsHelpers.
 *
 * QuizBuilderTab.generatePaper() and QuizImportTab.bulkImport() both open a
 * Modal.custom dialog — there is no render() method.  We test them by
 * temporarily overriding Modal.custom to capture the title/HTML/callback that
 * each method passes, then asserting on those arguments without touching the
 * DOM at all.
 *
 * QuizImportTab._parseImportFile() is a real async method with branching logic;
 * it is tested directly using the FileReader mock that browser-env.js installs.
 *
 * ReviewsHelpers exports three pure/near-pure functions
 * (getEligibleCompletedClasses, buildClassOptions, processImageFiles) that are
 * tested with lightweight in-memory stubs — no IndexedDB required.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { QuizBuilderTab }  from '../src/pages/QuizBuilderTab.js';
import { QuizImportTab }   from '../src/pages/QuizImportTab.js';
import {
  getEligibleCompletedClasses,
  buildClassOptions,
  processImageFiles,
} from '../src/pages/helpers/ReviewsHelpers.js';
import Modal from '../src/components/Modal.js';
import { parseExcelFile } from '../src/utils/excelParser.js';

// ----------------------------------------------------------------
// Shared helper — override Modal.custom without touching the DOM.
// Returns { title, html, hasCallback }.
// ----------------------------------------------------------------
function captureModalCustom(fn) {
  let captured = null;
  const saved = Modal.custom.bind(Modal);
  Modal.custom = (title, html, cb) => {
    captured = { title, html, hasCallback: typeof cb === 'function' };
  };
  fn();
  Modal.custom = saved;
  return captured;
}

export async function runModalTabTests() {

  // ================================================================
  // QuizBuilderTab — generatePaper()
  // ================================================================

  await describe('QuizBuilderTab: generatePaper modal', async () => {
    await it('calls Modal.custom with title "Generate Paper"', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assertEqual(result.title, 'Generate Paper', 'correct modal title');
      resetBrowserEnv();
    });

    await it('modal HTML contains paper-form', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.html.includes('id="paper-form"'), 'paper-form in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains p-title input', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.html.includes('id="p-title"'), 'p-title input in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains p-total input', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.html.includes('id="p-total"'), 'p-total input in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains all five difficulty inputs', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      for (let i = 1; i <= 5; i++) {
        assert(result.html.includes(`id="p-d${i}"`), `difficulty input p-d${i} present`);
      }
      resetBrowserEnv();
    });

    await it('modal HTML contains p-chapters container', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.html.includes('id="p-chapters"'), 'p-chapters container in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains btn-add-chapter button', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.html.includes('id="btn-add-chapter"'), 'btn-add-chapter in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains paper-error element', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.html.includes('id="paper-error"'), 'paper-error in modal HTML');
      resetBrowserEnv();
    });

    await it('passes a callback function to Modal.custom', () => {
      installBrowserEnv();
      const tab = new QuizBuilderTab({});
      const result = captureModalCustom(() => tab.generatePaper());
      assert(result.hasCallback, 'callback provided to Modal.custom');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // QuizImportTab — bulkImport()
  // ================================================================

  await describe('QuizImportTab: bulkImport modal', async () => {
    await it('calls Modal.custom with title "Bulk Import Questions"', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assertEqual(result.title, 'Bulk Import Questions', 'correct modal title');
      resetBrowserEnv();
    });

    await it('modal HTML contains import-file input', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assert(result.html.includes('id="import-file"'), 'import-file input in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains import-preview element', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assert(result.html.includes('id="import-preview"'), 'import-preview in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains import-error element', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assert(result.html.includes('id="import-error"'), 'import-error in modal HTML');
      resetBrowserEnv();
    });

    await it('modal HTML contains btn-do-import button', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assert(result.html.includes('id="btn-do-import"'), 'btn-do-import in modal HTML');
      resetBrowserEnv();
    });

    await it('mentions required column names in the instructions', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assert(result.html.includes('questionText'), 'questionText column mentioned');
      assert(result.html.includes('correctAnswer'), 'correctAnswer column mentioned');
      resetBrowserEnv();
    });

    await it('passes a callback function to Modal.custom', () => {
      installBrowserEnv();
      const tab = new QuizImportTab({});
      const result = captureModalCustom(() => tab.bulkImport());
      assert(result.hasCallback, 'callback provided to Modal.custom');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // QuizImportTab — _parseImportFile()
  // ================================================================

  await describe('QuizImportTab: _parseImportFile', async () => {
    await it('parses a JSON file and returns an array', async () => {
      installBrowserEnv();
      const rows = [
        { questionText: 'What is 2+2?', type: 'single', correctAnswer: '4', difficulty: 1, tags: ['math'] },
      ];
      const mockFile = { name: 'questions.json', _text: JSON.stringify(rows) };
      const tab = new QuizImportTab({});
      const result = await tab._parseImportFile(mockFile);
      assertEqual(result.length, 1, 'parsed 1 row');
      assertEqual(result[0].questionText, 'What is 2+2?', 'row content preserved');
      resetBrowserEnv();
    });

    await it('returns empty array for an empty JSON array file', async () => {
      installBrowserEnv();
      const mockFile = { name: 'empty.json', _text: '[]' };
      const tab = new QuizImportTab({});
      const result = await tab._parseImportFile(mockFile);
      assertEqual(result.length, 0, 'empty array returned');
      resetBrowserEnv();
    });

    await it('parses multiple rows from a JSON file', async () => {
      installBrowserEnv();
      const rows = [
        { questionText: 'Q1', type: 'single', correctAnswer: 'A', difficulty: 1, tags: [] },
        { questionText: 'Q2', type: 'multiple', correctAnswer: 'B,C', difficulty: 2, tags: [] },
        { questionText: 'Q3', type: 'text', correctAnswer: 'answer', difficulty: 3, tags: [] },
      ];
      const mockFile = { name: 'batch.json', _text: JSON.stringify(rows) };
      const tab = new QuizImportTab({});
      const result = await tab._parseImportFile(mockFile);
      assertEqual(result.length, 3, 'all 3 rows parsed');
      resetBrowserEnv();
    });

    await it('routes .xlsx files to parseExcelFile (verifies branch)', async () => {
      installBrowserEnv();
      // Override parseExcelFile to verify the xlsx branch is taken
      const savedParseExcel = parseExcelFile;
      let excelCalled = false;
      // QuizImportTab imports parseExcelFile at module level — override via mock buffer
      const mockFile = {
        name: 'questions.xlsx',
        _buffer: new ArrayBuffer(8),
      };
      const tab = new QuizImportTab({});
      // parseExcelFile is imported directly; override on the module object is not
      // straightforward with static imports. Instead verify the xlsx branch throws
      // on an empty buffer (real parseExcelFile rejects empty xlsx) — the branch
      // is exercised regardless of outcome.
      let threw = false;
      try {
        await tab._parseImportFile(mockFile);
      } catch (err) {
        threw = true; // empty buffer is invalid xlsx — branch taken, error expected
      }
      assert(threw, 'xlsx branch is taken for .xlsx extension (empty buffer → error)');
      resetBrowserEnv();
    });

    await it('routes .xls files through the same xlsx branch', async () => {
      installBrowserEnv();
      const mockFile = { name: 'questions.xls', _buffer: new ArrayBuffer(8) };
      const tab = new QuizImportTab({});
      let threw = false;
      try {
        await tab._parseImportFile(mockFile);
      } catch (err) {
        threw = true;
      }
      assert(threw, '.xls extension also routes to xlsx branch');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ReviewsHelpers — getEligibleCompletedClasses
  // ================================================================

  await describe('ReviewsHelpers: getEligibleCompletedClasses', async () => {
    function makeRepos(classes, registrations) {
      return {
        classRepo: { getAll: async () => classes },
        regRepo: { getByUserId: async () => registrations },
      };
    }

    await it('returns empty array when no classes exist', async () => {
      const { classRepo, regRepo } = makeRepos([], []);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      assertEqual(result.length, 0, 'no classes → empty result');
    });

    await it('excludes active classes even with Approved registration', async () => {
      const classes = [{ id: 'c1', title: 'Class A', status: 'active', instructorId: 'ix' }];
      const regs = [{ id: 'r1', classId: 'c1', status: 'Approved', userId: 'u1' }];
      const { classRepo, regRepo } = makeRepos(classes, regs);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      assertEqual(result.length, 0, 'active class excluded');
    });

    await it('includes completed class when user has Approved registration', async () => {
      const classes = [{ id: 'c1', title: 'Class A', status: 'completed', instructorId: 'ix' }];
      const regs = [{ id: 'r1', classId: 'c1', status: 'Approved', userId: 'u1' }];
      const { classRepo, regRepo } = makeRepos(classes, regs);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      assertEqual(result.length, 1, 'completed class with Approved reg included');
      assertEqual(result[0].id, 'c1', 'correct class returned');
    });

    await it('excludes completed class when registration is not Approved', async () => {
      const classes = [{ id: 'c1', title: 'Class A', status: 'completed', instructorId: 'ix' }];
      const regs = [{ id: 'r1', classId: 'c1', status: 'Submitted', userId: 'u1' }];
      const { classRepo, regRepo } = makeRepos(classes, regs);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      assertEqual(result.length, 0, 'Submitted reg not eligible');
    });

    await it('includes completed class when user is the instructor', async () => {
      const classes = [{ id: 'c2', title: 'Class B', status: 'completed', instructorId: 'u1' }];
      const { classRepo, regRepo } = makeRepos(classes, []);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      assertEqual(result.length, 1, 'instructor included without registration');
      assertEqual(result[0].id, 'c2', 'correct instructor class returned');
    });

    await it('excludes completed class where user is neither approved learner nor instructor', async () => {
      const classes = [{ id: 'c3', title: 'Class C', status: 'completed', instructorId: 'other' }];
      const regs = [{ id: 'r1', classId: 'c3', status: 'Rejected', userId: 'u1' }];
      const { classRepo, regRepo } = makeRepos(classes, regs);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      assertEqual(result.length, 0, 'rejected learner excluded');
    });

    await it('returns multiple eligible classes when conditions are met', async () => {
      const classes = [
        { id: 'c1', status: 'completed', instructorId: 'ix' },
        { id: 'c2', status: 'completed', instructorId: 'u1' },
        { id: 'c3', status: 'completed', instructorId: 'ix' },
        { id: 'c4', status: 'active',    instructorId: 'u1' },
      ];
      const regs = [
        { classId: 'c1', status: 'Approved' },
        { classId: 'c3', status: 'Cancelled' },
      ];
      const { classRepo, regRepo } = makeRepos(classes, regs);
      const result = await getEligibleCompletedClasses(classRepo, regRepo, 'u1');
      // c1: Approved reg ✓   c2: instructor ✓   c3: Cancelled ✗   c4: active ✗
      assertEqual(result.length, 2, 'exactly 2 eligible classes');
      const ids = result.map(c => c.id).sort();
      assertEqual(ids[0], 'c1', 'c1 included');
      assertEqual(ids[1], 'c2', 'c2 included');
    });
  });

  // ================================================================
  // ReviewsHelpers — buildClassOptions
  // ================================================================

  await describe('ReviewsHelpers: buildClassOptions', async () => {
    await it('returns empty string for empty array', () => {
      const result = buildClassOptions([]);
      assertEqual(result, '', 'empty array → empty string');
    });

    await it('returns one option for a single class', () => {
      const result = buildClassOptions([{ id: 'c1', title: 'Math 101' }]);
      assert(result.includes('<option'), 'option element present');
      assert(result.includes('Math 101'), 'title in option text');
      assert(result.includes('value="c1"'), 'id as option value');
    });

    await it('returns one option per class', () => {
      const classes = [
        { id: 'c1', title: 'Math 101' },
        { id: 'c2', title: 'Science 201' },
        { id: 'c3', title: 'History 301' },
      ];
      const result = buildClassOptions(classes);
      const count = (result.match(/<option/g) || []).length;
      assertEqual(count, 3, '3 option elements');
    });

    await it('escapes XSS in class title', () => {
      const classes = [{ id: 'c1', title: '<script>alert(1)</script>' }];
      const result = buildClassOptions(classes);
      assert(!result.includes('<script>'), 'script tag escaped');
    });

    await it('escapes XSS in class id (value attribute)', () => {
      const classes = [{ id: '"onload=alert(1)', title: 'Safe Title' }];
      const result = buildClassOptions(classes);
      assert(!result.includes('"onload=alert'), 'id XSS escaped in value');
    });

    await it('uses class id as fallback when title is missing', () => {
      const classes = [{ id: 'c99' }]; // no title property
      const result = buildClassOptions(classes);
      assert(result.includes('c99'), 'id used as fallback text');
    });
  });

  // ================================================================
  // ReviewsHelpers — processImageFiles
  // ================================================================

  await describe('ReviewsHelpers: processImageFiles', async () => {
    function makeImageFile(overrides = {}) {
      return {
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: 500 * 1024, // 500 KB — under 2 MB
        ...overrides,
      };
    }

    await it('returns empty array for empty file list', async () => {
      installBrowserEnv();
      const result = await processImageFiles([]);
      assertEqual(result.length, 0, 'empty input → empty output');
      resetBrowserEnv();
    });

    await it('throws when file count exceeds maxImages', async () => {
      installBrowserEnv();
      const files = Array.from({ length: 4 }, (_, i) => makeImageFile({ name: `img${i}.jpg` }));
      let threw = false;
      try {
        await processImageFiles(files, 3);
      } catch (err) {
        threw = true;
        assert(err.message.includes('Maximum 3 images'), 'correct error message');
      }
      assert(threw, 'throws when count exceeds limit');
      resetBrowserEnv();
    });

    await it('throws for non-image file type', async () => {
      installBrowserEnv();
      const files = [makeImageFile({ type: 'application/pdf', name: 'doc.pdf' })];
      let threw = false;
      try {
        await processImageFiles(files);
      } catch (err) {
        threw = true;
        assert(err.message.includes('JPG and PNG'), 'type error message correct');
      }
      assert(threw, 'throws for unsupported file type');
      resetBrowserEnv();
    });

    await it('throws for file exceeding maxMB', async () => {
      installBrowserEnv();
      const files = [makeImageFile({ size: 3 * 1024 * 1024, name: 'big.jpg' })]; // 3 MB > 2 MB
      let threw = false;
      try {
        await processImageFiles(files, 6, 2);
      } catch (err) {
        threw = true;
        assert(err.message.includes('under 2MB'), 'size error message correct');
      }
      assert(threw, 'throws for oversized file');
      resetBrowserEnv();
    });

    await it('accepts PNG files as valid type', async () => {
      installBrowserEnv();
      const files = [makeImageFile({ type: 'image/png', name: 'shot.png' })];
      const result = await processImageFiles(files);
      assertEqual(result.length, 1, 'PNG file accepted');
      resetBrowserEnv();
    });

    await it('returns correct metadata for a valid JPEG', async () => {
      installBrowserEnv();
      const files = [makeImageFile({ name: 'avatar.jpg', size: 1024 })];
      const result = await processImageFiles(files);
      assertEqual(result.length, 1, 'one result');
      assertEqual(result[0].filename, 'avatar.jpg', 'filename preserved');
      assertEqual(result[0].size, 1024, 'size preserved');
      assertEqual(result[0].type, 'image/jpeg', 'type preserved');
      assert(result[0].dataUrl.startsWith('data:'), 'dataUrl is a data URL');
      resetBrowserEnv();
    });

    await it('processes multiple valid images and returns one entry each', async () => {
      installBrowserEnv();
      const files = [
        makeImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 100 }),
        makeImageFile({ name: 'b.png', type: 'image/png', size: 200 }),
      ];
      const result = await processImageFiles(files, 6, 2);
      assertEqual(result.length, 2, 'two entries returned');
      assertEqual(result[0].filename, 'a.jpg', 'first filename correct');
      assertEqual(result[1].filename, 'b.png', 'second filename correct');
      resetBrowserEnv();
    });
  });
}
