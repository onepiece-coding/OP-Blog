import { validateCreateCategory } from '../../src/validations/categoryValidations.js';

describe('validateCreateCategory schema', () => {
  test('accepts a string title, trims it and sanitizes (escapes scripts) and preserves safe tags', () => {
    const input = {
      title: '   <script>alert(1)</script> Hello <b>world</b>   ',
    };

    const parsed = validateCreateCategory.safeParse(input);
    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      throw parsed.error;
    }

    expect(parsed.data.title).toBe('&lt;script&gt;alert(1)&lt;/script&gt; Hello <b>world</b>');
  });

  test('rejects non-string title values (preprocess returns same non-string -> string schema fails)', () => {
    const input = { title: 12345 };

    const parsed = validateCreateCategory.safeParse(input);
    expect(parsed.success).toBe(false);

    expect(parsed.error!.issues.length).toBeGreaterThan(0);

    const paths = parsed.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('title');
  });

  test('rejects empty/whitespace-only title after trim  min length enforced by schema)', () => {
    const input = { title: '    ' };
    const parsed = validateCreateCategory.safeParse(input);
    expect(parsed.success).toBe(false);
    if (parsed.success) expect(parsed.data.title).toBe('');
  });
});