/** @type {import('jest-expo').JestPreset} */
module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '**/utils/__tests__/**/*.test.ts',
    '**/components/__tests__/**/*.test.tsx',
  ],
};
