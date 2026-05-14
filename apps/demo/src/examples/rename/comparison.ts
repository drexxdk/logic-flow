import type { CodeExample } from '../../components/CodeComparison';

export const renameComparison: CodeExample = {
  title: 'Complete authoring comparison',
  xstateCode: `import { assign, fromPromise, setup } from 'xstate';

const MAX_HEADING_LENGTH = 24;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const renameMachine = setup({
  types: {
    context: {} as {
      modalOpen: boolean;
      heading: string;
      savedHeading: string;
      versions: string[];
      error?: string;
    },
    events: {} as
      | { type: 'OPEN' }
      | { type: 'CHANGE'; value: string }
      | { type: 'CLOSE' }
      | { type: 'SAVE' },
  },
  actors: {
    renameHeading: fromPromise(async ({ input }: { input: { heading: string } }) => {
      await wait(800);
      return { heading: input.heading.trim() };
    }),
  },
}).createMachine({
  initial: 'closed',
  context: {
    modalOpen: false,
    heading: 'Rename me',
    savedHeading: 'Rename me',
    versions: ['Original course', 'Teacher notes', 'Rename me'],
  },
  states: {
    closed: {
      on: {
        OPEN: {
          target: 'editing',
          actions: assign(({ context }) => ({
            modalOpen: true,
            heading: context.savedHeading,
            error: undefined,
          })),
        },
      },
    },
    editing: {
      on: {
        CHANGE: {
          actions: assign(({ context, event }) => {
            const normalizedValue = event.value.trim().toLowerCase();
            let error: string | undefined;

            if (event.value.trim().length === 0) {
              error = 'Heading is required.';
            } else if (event.value.length > MAX_HEADING_LENGTH) {
              error = 'Heading must be ' + MAX_HEADING_LENGTH + ' characters or fewer.';
            } else if (
              context.versions.some((version) => version.toLowerCase() === normalizedValue) &&
              normalizedValue !== context.savedHeading.toLowerCase()
            ) {
              error = 'Heading must be unique.';
            }

            return {
              heading: event.value,
              error,
            };
          }),
        },
        CLOSE: {
          target: 'closed',
          actions: assign({ modalOpen: false, error: undefined }),
        },
        SAVE: {
          target: 'saving',
          guard: ({ context }) => !context.error && context.heading.trim().length > 0,
        },
      },
    },
    saving: {
      invoke: {
        src: 'renameHeading',
        input: ({ context }) => ({ heading: context.heading }),
        onDone: {
          target: 'success',
          actions: assign(({ event }) => ({
            savedHeading: event.output.heading,
            heading: event.output.heading,
            modalOpen: false,
            error: undefined,
          })),
        },
        onError: {
          target: 'editing',
          actions: assign({ error: 'Saving failed. Try again.' }),
        },
      },
    },
    success: {
      after: {
        1200: { target: 'closed' },
      },
    },
  },
});`,
  logicFlowCode: `import { createFlow } from 'logic-flow';
import { z } from 'zod';

const MAX_HEADING_LENGTH = 24;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const renameFlow = createFlow({
  name: 'rename-demo',
  context: z.object({
    modalOpen: z.boolean(),
    heading: z.string(),
    savedHeading: z.string(),
    versions: z.array(z.string()),
    error: z.string().optional(),
  }),
  states: ['closed', 'editing', 'saving', 'success'] as const,
  initial: 'closed',
  initialContext: {
    modalOpen: false,
    heading: 'Rename me',
    savedHeading: 'Rename me',
    versions: ['Original course', 'Teacher notes', 'Rename me'],
  },
})
  .step('closed', ({ on, states }) =>
    on('OPEN', {}, states.editing, ({ ctx, goto, update }) => {
      update({ modalOpen: true, heading: ctx.savedHeading, error: undefined });
      goto(states.editing);
    }),
  )
  .step('editing', ({ on, states }) => [
    on('CHANGE', { value: z.string() }, ({ ctx, event, update }) => {
      const normalizedValue = event.value.trim().toLowerCase();
      let error: string | undefined;

      if (event.value.trim().length === 0) {
        error = 'Heading is required.';
      } else if (event.value.length > MAX_HEADING_LENGTH) {
        error = 'Heading must be ' + MAX_HEADING_LENGTH + ' characters or fewer.';
      } else if (
        ctx.versions.some((version) => version.toLowerCase() === normalizedValue) &&
        normalizedValue !== ctx.savedHeading.toLowerCase()
      ) {
        error = 'Heading must be unique.';
      }

      update({ heading: event.value, error });
    }),
    on('CLOSE', {}, states.closed, ({ goto, update }) => {
      update({ modalOpen: false, error: undefined });
      goto(states.closed);
    }),
    on('SAVE', {}, states.saving, ({ ctx, goto }) => {
      if (!ctx.error && ctx.heading.trim().length > 0) {
        goto(states.saving);
      }
    }),
  ])
  .step('saving', ({ enter, on, states }) => {
    const failed = on('FAILED', { message: z.string() }, states.editing, ({ event, goto, update }) => {
      update({ error: event.message });
      goto(states.editing);
    });
    const saved = on('SAVED', { heading: z.string() }, states.success, ({ event, goto, update }) => {
      update({
        savedHeading: event.heading,
        heading: event.heading,
        modalOpen: false,
        error: undefined,
      });
      goto(states.success);
    });

    return [
      enter(async ({ ctx, dispatch, effect }) => {
        try {
          await effect('renameRequest', async () => {
            await wait(800);
          });
          await dispatch(saved, { heading: ctx.heading.trim() });
        } catch {
          await dispatch(failed, { message: 'Saving failed. Try again.' });
        }
      }),
      failed,
      saved,
    ];
  })
  .step('success', ({ enter, states }) =>
    enter(states.closed, ({ schedule }) => {
      schedule(1200, ({ goto }) => {
        goto(states.closed);
      });
    }),
  );`,
  typedLineNumbers: [7, 23, 45, 51, 66, 72, 86, 101],
  typedReasons: [
    'The flow keeps the runtime schema and the inferred context type in the same declaration, instead of maintaining a separate type-only context shape.',
    'Event payloads are declared next to each handler instead of being predeclared in a global event union before the machine definition.',
    'Dispatching through the local `saved` and `failed` registrations keeps the async success and failure payloads aligned with the handler contracts.',
  ],
};
