// Jest runs in native ESM mode (Nest 12 ships as ESM). `npm test` passes --experimental-vm-modules.
/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  testTimeout: 30000,
  extensionsToTreatAsEsm: ['.ts'],
  // Source uses NodeNext-style "./x.js" specifiers; map them back to the .ts files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    // 151002: ts-jest suggests isolatedModules for NodeNext; we keep full type information
    // because Nest's dependency injection relies on emitted decorator metadata.
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json', diagnostics: { ignoreCodes: [151002] } }],
  },
};
