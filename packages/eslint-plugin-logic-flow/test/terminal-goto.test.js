import { RuleTester } from 'eslint';

import { terminalGotoRule } from '../index.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('terminal-goto', terminalGotoRule, {
  valid: [
    {
      code: `
        on('SAVE', {}, ({ goto }) => {
          goto('done');
        });
      `,
    },
    {
      code: `
        enter(async ({ dispatch }) => {
          await dispatch({ type: 'DONE' });
        });
      `,
    },
    {
      code: `
        function navigate(goto) {
          goto('/dashboard');
          console.log('still reachable');
        }
      `,
    },
    {
      code: `
        const request = {
          handle: ({ dispatch }) => {
            dispatch({ type: 'DONE' });
            console.log('not a requestStep callback');
          },
        };
      `,
    },
  ],
  invalid: [
    {
      code: `
        on('SAVE', {}, ({ goto }) => {
          goto('done');
          console.log('unreachable');
        });
      `,
      errors: [{ messageId: 'terminalGoto' }],
    },
    {
      code: `
        enter(async ({ dispatch }) => {
          await dispatch({ type: 'DONE' });
          console.log('unreachable');
        });
      `,
      errors: [{ messageId: 'terminalGoto' }],
    },
    {
      code: `
        requestStep(api, {
          run: async ({ dispatch }) => {
            await dispatch({ type: 'DONE' });
            console.log('unreachable');
          },
        });
      `,
      errors: [{ messageId: 'terminalGoto' }],
    },
  ],
});