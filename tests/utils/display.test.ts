import { describe, it, expect, afterEach } from 'vitest';
import * as display from '../../src/utils/display.js';

describe('display.error', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('marks the process as failed so scripts and CI can detect it', () => {
    process.exitCode = 0;
    display.error('boom');
    expect(process.exitCode).toBe(1);
  });
});
