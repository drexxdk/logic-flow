import { createFlow } from 'logic-flow';
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
  .step('closed', ({ on, states }) => [
    on('OPEN', {}, { targets: [states.editing] as const }, ({ ctx, goto, update }) => {
      update({ modalOpen: true, heading: ctx.savedHeading, error: undefined });
      goto(states.editing);
    }),
  ])
  .step('editing', ({ on, states }) => [
    on('CHANGE', { value: z.string() }, ({ ctx, event, update }) => {
      const normalizedValue = event.value.trim().toLowerCase();
      let error: string | undefined;

      if (event.value.trim().length === 0) {
        error = 'Heading is required.';
      } else if (event.value.length > MAX_HEADING_LENGTH) {
        error = `Heading must be ${MAX_HEADING_LENGTH} characters or fewer.`;
      } else if (
        ctx.versions.some((version) => version.toLowerCase() === normalizedValue) &&
        normalizedValue !== ctx.savedHeading.toLowerCase()
      ) {
        error = 'Heading must be unique.';
      }

      update({ heading: event.value, error });
    }),
    on('CLOSE', {}, { targets: [states.closed] as const }, ({ goto, update }) => {
      update({ modalOpen: false, error: undefined });
      goto(states.closed);
    }),
    on('SAVE', {}, { targets: [states.saving] as const }, ({ ctx, goto }) => {
      if (ctx.error || ctx.heading.trim().length === 0) {
        return;
      }

      goto(states.saving);
    }),
  ])
  .step('saving', ({ enter, on, states }) => [
    enter(async ({ ctx, dispatch, effect }) => {
      try {
        await effect('renameRequest', async () => {
          await wait(800);
        });
        await dispatch({ type: 'SAVED', heading: ctx.heading.trim() });
      } catch {
        await dispatch({ type: 'FAILED', message: 'Saving failed. Try again.' });
      }
    }),
    on(
      'FAILED',
      { message: z.string() },
      { targets: [states.editing] as const },
      ({ event, goto, update }) => {
        update({ error: event.message });
        goto(states.editing);
      },
    ),
    on(
      'SAVED',
      { heading: z.string() },
      { targets: [states.success] as const },
      ({ event, goto, update }) => {
        update({
          savedHeading: event.heading,
          heading: event.heading,
          modalOpen: false,
          error: undefined,
        });
        goto(states.success);
      },
    ),
  ])
  .step('success', ({ enter, states }) => [
    enter({ targets: [states.closed] as const }, ({ schedule }) => {
      schedule(1200, ({ goto: delayedGoto }) => {
        delayedGoto(states.closed);
      });
    }),
  ])
  .build();
