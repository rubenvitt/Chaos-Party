import { CHARACTER_IDS as SDK_CHARACTER_IDS } from '@chaos-party/minigame-sdk';
import { CHARACTER_ANIMATIONS as SDK_ANIMATIONS } from '@chaos-party/minigame-sdk/babylon';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ANIMATIONS, CHARACTER_IDS } from './contract.ts';

describe('Figuren-Vertrag der Assets', () => {
  it('stimmt mit dem minigame-sdk überein', () => {
    expect([...CHARACTER_IDS]).toEqual([...SDK_CHARACTER_IDS]);
    expect([...CHARACTER_ANIMATIONS]).toEqual([...SDK_ANIMATIONS]);
  });
});
