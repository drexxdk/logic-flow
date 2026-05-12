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
  events: {
    OPEN: z.object({ type: z.literal('OPEN') }),
    CLOSE: z.object({ type: z.literal('CLOSE') }),
    CHANGE: z.object({ type: z.literal('CHANGE'), value: z.string() }),
    SAVE: z.object({ type: z.literal('SAVE') }),
    SAVED: z.object({ type: z.literal('SAVED'), heading: z.string() }),
    FAILED: z.object({ type: z.literal('FAILED'), message: z.string() }),
  },
  states: ['closed', 'editing', 'saving', 'success'] as const,
  initial: 'closed',
  initialContext: {
    modalOpen: false,
    heading: 'Rename me',
    savedHeading: 'Rename me',
    versions: ['Original course', 'Teacher notes', 'Rename me'],
  },
})
  .step('closed', ({ on }) => {
    on('OPEN', ({ ctx, goto, update }) => {
      update({ modalOpen: true, heading: ctx.savedHeading, error: undefined });
      goto('editing');
    });
  })
  .step('editing', ({ on }) => {
    on('CHANGE', ({ ctx, event, update }) => {
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
    });

    on('CLOSE', ({ goto, update }) => {
      update({ modalOpen: false, error: undefined });
      goto('closed');
    });

    on('SAVE', async ({ ctx, dispatch, effect, goto }) => {
      if (ctx.error || ctx.heading.trim().length === 0) {
        return;
      }

      goto('saving');

      try {
        await effect('renameRequest', async () => {
          await wait(800);
        });
        await dispatch({ type: 'SAVED', heading: ctx.heading.trim() });
      } catch {
        await dispatch({ type: 'FAILED', message: 'Saving failed. Try again.' });
      }
    });
  })
  .step('saving', ({ on }) => {
    on('FAILED', ({ event, goto, update }) => {
      update({ error: event.message });
      goto('editing');
    });

    on('SAVED', ({ event, goto, update }) => {
      update({
        savedHeading: event.heading,
        heading: event.heading,
        modalOpen: false,
        error: undefined,
      });
      goto('success');
    });
  })
  .step('success', ({ enter }) => {
    enter(({ schedule }) => {
      schedule(1200, ({ goto: delayedGoto }) => {
        delayedGoto('closed');
      });
    });
  })
  .build();
