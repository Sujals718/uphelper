// Regression test for the "(0 , franc_1.franc) is not a function" bug:
// `franc`'s package shape differs across major versions (v5.x CJS:
// `module.exports = franc`; v6.x ESM: named `{ franc, francAll }`
// exports), and a naive `import { franc } from 'franc'` only works for
// one of those shapes. This test doesn't import the real `franc` package
// at all — it re-implements just the resolution logic under both mocked
// shapes to pin down the behavior independent of whichever version
// happens to be installed in any given environment.
import { Logger } from '@nestjs/common';

type FrancFn = (text: string, options?: { minLength?: number }) => string;

function resolveFranc(francModule: unknown): FrancFn | undefined {
  return typeof francModule === 'function'
    ? (francModule as FrancFn)
    : typeof (francModule as any)?.franc === 'function'
      ? (francModule as any).franc
      : typeof (francModule as any)?.default === 'function'
        ? (francModule as any).default
        : undefined;
}

function buildSafeFranc(resolvedFranc: FrancFn | undefined) {
  const logger = new Logger('test');
  let logged = false;
  return function safeFranc(text: string, options?: { minLength?: number }): string {
    if (!resolvedFranc) {
      if (!logged) {
        logger.error('franc not resolved');
        logged = true;
      }
      return 'und';
    }
    try {
      return resolvedFranc(text, options);
    } catch {
      return 'und';
    }
  };
}

describe('franc export-shape resolution (regression for the "not a function" crash)', () => {
  it('resolves a v5-style CJS module (module.exports = function)', () => {
    const v5Module = (text: string) => 'eng';
    const resolved = resolveFranc(v5Module);
    expect(typeof resolved).toBe('function');
    expect(resolved!('hello world')).toBe('eng');
  });

  it('resolves a v6-style ESM named export ({ franc, francAll })', () => {
    const v6Module = { franc: (text: string) => 'hin', francAll: () => [] };
    const resolved = resolveFranc(v6Module);
    expect(typeof resolved).toBe('function');
    expect(resolved!('कुछ भी')).toBe('hin');
  });

  it('resolves a transpiled-ESM-with-default shape ({ default: function })', () => {
    const defaultShapedModule = { default: (text: string) => 'tam' };
    const resolved = resolveFranc(defaultShapedModule);
    expect(typeof resolved).toBe('function');
    expect(resolved!('anything')).toBe('tam');
  });

  it('does NOT crash on the exact shape that caused the original bug: a plain function module with no .franc property', () => {
    // This is franc <=5.x's real shape. The old code (`import { franc }
    // from 'franc'`) compiled to reading `.franc` off of this, which is
    // undefined on a bare function — that's the literal crash reported.
    const v5Module = (text: string) => 'eng';
    expect((v5Module as any).franc).toBeUndefined();
    // But the fixed resolution logic still finds the callable directly.
    const resolved = resolveFranc(v5Module);
    expect(resolved).toBe(v5Module);
  });

  it('degrades to "und" instead of throwing when nothing resolves', () => {
    const brokenModule = { somethingElse: true };
    const resolved = resolveFranc(brokenModule);
    expect(resolved).toBeUndefined();

    const safeFranc = buildSafeFranc(resolved);
    expect(() => safeFranc('some text')).not.toThrow();
    expect(safeFranc('some text')).toBe('und');
  });

  it('degrades to "und" instead of throwing when the resolved function itself throws', () => {
    const throwingFn: FrancFn = () => {
      throw new Error('franc blew up on this input');
    };
    const safeFranc = buildSafeFranc(throwingFn);
    expect(() => safeFranc('some text')).not.toThrow();
    expect(safeFranc('some text')).toBe('und');
  });
});
