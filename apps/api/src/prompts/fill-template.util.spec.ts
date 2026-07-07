import { fillTemplate } from './fill-template.util';
import { DEBUG_TEMPLATE_V1, HINT_TEMPLATE_V1 } from './templates.constant';

describe('fillTemplate', () => {
  it('substitutes every placeholder in the hint template and changes nothing else', () => {
    const filled = fillTemplate(HINT_TEMPLATE_V1, {
      problem_name: 'Two Arrays',
      platform: 'Codeforces',
      contest_name: 'Codeforces Round 1002',
      problem_statement: 'Given two arrays, find...',
    });

    expect(filled).toContain(
      'I am stuck on: Two Arrays (Codeforces, contest: Codeforces Round 1002).',
    );
    expect(filled).toContain('Problem statement (if provided): Given two arrays, find...');
    // The rest of the template — every rule, verbatim — must survive
    // untouched. Spot-check a few distinctive lines rather than the
    // entire body, so this test doesn't just re-encode the whole
    // constant a second time.
    expect(filled).toContain('Give hints in exactly 3 stages, one at a time.');
    expect(filled).toContain('Give me Stage 1 only right now.');
    expect(filled).not.toContain('{problem_name}');
    expect(filled).not.toContain('{platform}');
    expect(filled).not.toContain('{contest_name}');
    expect(filled).not.toContain('{problem_statement}');
  });

  it('leaves the problem_statement line blank (not omitted, not defaulted text) when the caller supplies an empty string', () => {
    
    const filled = fillTemplate(HINT_TEMPLATE_V1, {
      problem_name: 'Two Arrays',
      platform: 'Codeforces',
      contest_name: 'Codeforces Round 1002',
      problem_statement: '',
    });

    expect(filled).toContain('Problem statement (if provided): \n');
  });

  it('substitutes every placeholder in the debug template, including a multi-line user_code block', () => {
    const userCode = 'for (int i = 0; i <= n; i++) {\n  sum += a[i];\n}';

    const filled = fillTemplate(DEBUG_TEMPLATE_V1, {
      problem_name: 'Two Arrays',
      platform: 'Codeforces',
      contest_name: 'Codeforces Round 1002',
      user_code: userCode,
    });

    expect(filled).toContain(
      'I am working on: Two Arrays (Codeforces, contest: Codeforces Round 1002).',
    );
    expect(filled).toContain(`My current code:\n${userCode}`);
    expect(filled).toContain('CASE A — Logic is fundamentally correct');
    expect(filled).toContain('CASE B — Logic is partially right but has a conceptual flaw');
    expect(filled).toContain('CASE C — Logic is fundamentally the wrong approach');
    expect(filled).not.toContain('{user_code}');
  });

  it('leaves an unrecognized placeholder token untouched rather than silently deleting it', () => {
    const filled = fillTemplate('Hello {name}, welcome to {unknown_key}.', { name: 'Alex' });

    expect(filled).toBe('Hello Alex, welcome to {unknown_key}.');
  });

  it('does not reword or restructure anything outside the placeholder tokens themselves', () => {
    const filled = fillTemplate(HINT_TEMPLATE_V1, {
      problem_name: 'X',
      platform: 'Codeforces',
      contest_name: 'Y',
      problem_statement: 'Z',
    });

    // Every literal line of the template body (with placeholders
    // resolved) must appear verbatim and in order — this is the closest
    // thing to a snapshot without depending on Jest's snapshot files,
    // which the rest of this repo doesn't use elsewhere.
    const expectedLines = HINT_TEMPLATE_V1.replace('{problem_name}', 'X')
      .replace('{platform}', 'Codeforces')
      .replace('{contest_name}', 'Y')
      .replace('{problem_statement}', 'Z')
      .split('\n');

    expect(filled.split('\n')).toEqual(expectedLines);
  });
});
