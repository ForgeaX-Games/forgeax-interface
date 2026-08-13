import { describe, expect, it } from 'bun:test';
import { FAMILY_ORDER, familyOf } from './file-family';

describe('file family taxonomy', () => {
  it('exposes the ten shared families in stable order', () => {
    expect(FAMILY_ORDER.map(({ key }) => key)).toEqual([
      'code', 'config', 'doc', 'scene', 'pack',
      'meta', 'image', 'audio', 'model', 'data',
    ]);
  });

  it('classifies representative extensions', () => {
    expect(familyOf('src/main.ts')).toBe('code');
    expect(familyOf('config/game.yaml')).toBe('config');
    expect(familyOf('README.md')).toBe('doc');
    expect(familyOf('levels/intro.scene')).toBe('scene');
    expect(familyOf('assets/world.fxpack')).toBe('pack');
    expect(familyOf('assets/world.meta')).toBe('meta');
    expect(familyOf('assets/hero.png')).toBe('image');
    expect(familyOf('audio/theme.ogg')).toBe('audio');
    expect(familyOf('models/hero.glb')).toBe('model');
    expect(familyOf('tables/enemies.csv')).toBe('data');
  });

  it('normalizes separators and defaults unknown files to data', () => {
    expect(familyOf(String.raw`src\main.TSX`)).toBe('code');
    expect(familyOf('LICENSE')).toBe('data');
  });
});
