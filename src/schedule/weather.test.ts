import { describe, expect, it } from 'vitest';
import { describeSky, skyOf, worthMentioning } from './weather';

describe('skyOf', () => {
  it('reads the codes a forecast actually sends', () => {
    expect(skyOf(0)).toBe('clear');
    expect(skyOf(1)).toBe('partly');
    expect(skyOf(2)).toBe('partly');
    expect(skyOf(3)).toBe('cloudy');
    expect(skyOf(45)).toBe('fog');
    expect(skyOf(53)).toBe('drizzle');
    expect(skyOf(63)).toBe('rain');
    expect(skyOf(73)).toBe('snow');
    expect(skyOf(95)).toBe('thunder');
  });

  it('keeps showers with rain and snow showers with snow', () => {
    // These sit far from their own family in the numbering, which is exactly
    // the sort of gap that ends up drawing a cloud over a thunderstorm.
    expect(skyOf(80)).toBe('rain');
    expect(skyOf(82)).toBe('rain');
    expect(skyOf(85)).toBe('snow');
    expect(skyOf(86)).toBe('snow');
  });

  it('keeps freezing rain out of the snow bucket', () => {
    expect(skyOf(66)).toBe('rain');
    expect(skyOf(67)).toBe('rain');
  });

  it('falls back to cloud for anything undefined', () => {
    // A wrong picture is worse than a plain one.
    expect(skyOf(4)).toBe('cloudy');
    expect(skyOf(-1)).toBe('cloudy');
    expect(skyOf(999)).toBe('cloudy');
  });

  it('has words for every code, so none renders blank', () => {
    for (let code = 0; code <= 99; code++) {
      expect(describeSky(code), `code ${code}`).toBeTruthy();
    }
  });
});

describe('worthMentioning', () => {
  it('stays quiet about a chance nobody would act on', () => {
    expect(worthMentioning(0)).toBe(false);
    expect(worthMentioning(29)).toBe(false);
  });

  it('speaks up once it would change what you bring', () => {
    expect(worthMentioning(30)).toBe(true);
    expect(worthMentioning(80)).toBe(true);
  });
});
