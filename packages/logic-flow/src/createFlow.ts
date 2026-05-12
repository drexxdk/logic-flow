import type { z } from 'zod';

export type Awaitable<T> = T | Promise<T>;
export type FlowEventSchemas = Record<string, z.ZodType<{ type: string }>>;
export type FlowContextPatch<TContext> =
  | Partial<TContext>
  | ((context: TContext) => Partial<TContext>);
export type FlowEventUnion<TSchemas extends FlowEventSchemas> = {
  [K in keyof TSchemas]: z.infer<TSchemas[K]>;
}[keyof TSchemas];
export type FlowStateNames<TStates extends readonly string[]> = TStates[number];

export interface FlowSnapshot<TContext, TState extends string, TEvent> {
  state: TState;
  context: TContext;
  lastEvent?: TEvent;
  pendingEffects: string[];
}

export interface FlowApi<TContext, TAllEvents, TState extends string> {
  readonly ctx: TContext;
  readonly state: TState;
  update(patch: FlowContextPatch<TContext>): TContext;
  goto(state: TState): void;
  dispatch(event: TAllEvents): Promise<void>;
  effect<TResult>(name: string, task: () => Awaitable<TResult>): Promise<TResult>;
  schedule(
    ms: number,
    task: (api: FlowEnterApi<TContext, TAllEvents, TState>) => Awaitable<void>,
  ): () => void;
  getSnapshot(): FlowSnapshot<TContext, TState, TAllEvents>;
}

export interface FlowHandlerApi<
  TContext,
  TAllEvents,
  TState extends string,
  TEvent,
> extends FlowApi<TContext, TAllEvents, TState> {
  readonly event: TEvent;
}

export interface FlowEnterApi<TContext, TAllEvents, TState extends string> extends FlowApi<
  TContext,
  TAllEvents,
  TState
> {
  readonly event: TAllEvents | undefined;
}

export type FlowHandler<TContext, TAllEvents, TState extends string, TEvent> = (
  api: FlowHandlerApi<TContext, TAllEvents, TState, TEvent>,
) => Awaitable<void>;

export type FlowEnterHandler<TContext, TEvent, TState extends string> = (
  api: FlowEnterApi<TContext, TEvent, TState>,
) => Awaitable<void>;

type HandlerMap<TContext, TSchemas extends FlowEventSchemas, TState extends string> = Partial<{
  [K in Extract<keyof TSchemas, string>]: FlowHandler<
    TContext,
    FlowEventUnion<TSchemas>,
    TState,
    z.infer<TSchemas[K]>
  >;
}>;

interface IStepDefinition<TContext, TSchemas extends FlowEventSchemas, TState extends string> {
  handlers: HandlerMap<TContext, TSchemas, TState>;
  enterHandlers: Array<FlowEnterHandler<TContext, FlowEventUnion<TSchemas>, TState>>;
}

interface IStepRegistrar<TContext, TSchemas extends FlowEventSchemas, TState extends string> {
  on<TKey extends Extract<keyof TSchemas, string>>(
    type: TKey,
    handler: FlowHandler<TContext, FlowEventUnion<TSchemas>, TState, z.infer<TSchemas[TKey]>>,
  ): void;
  enter(handler: FlowEnterHandler<TContext, FlowEventUnion<TSchemas>, TState>): void;
}

interface ITransitionRef<TState extends string> {
  nextState?: TState;
}

interface ICreateFlowConfig<
  TContextSchema extends z.ZodTypeAny,
  TSchemas extends FlowEventSchemas,
  TStates extends readonly [string, ...string[]],
> {
  name: string;
  context: TContextSchema;
  events: TSchemas;
  states: TStates;
  initial: FlowStateNames<TStates>;
  initialContext: z.infer<TContextSchema>;
}

export interface FlowDefinition<
  TContext,
  TSchemas extends FlowEventSchemas,
  TState extends string,
> {
  readonly name: string;
  readonly initial: TState;
  readonly initialContext: TContext;
  createInstance(): FlowInstance<TContext, TSchemas, TState>;
}

interface IFlowDefinitionRuntime<
  TContext,
  TSchemas extends FlowEventSchemas,
  TState extends string,
> extends FlowDefinition<TContext, TSchemas, TState> {
  getStep(state: TState): IStepDefinition<TContext, TSchemas, TState>;
  validateContext(context: TContext): TContext;
  validateEvent(event: FlowEventUnion<TSchemas>): FlowEventUnion<TSchemas>;
  isKnownState(state: string): state is TState;
}

class InternalFlowDefinition<
  TContext,
  TSchemas extends FlowEventSchemas,
  TState extends string,
  TContextSchema extends z.ZodTypeAny,
> implements IFlowDefinitionRuntime<TContext, TSchemas, TState> {
  public readonly initialContext: TContext;

  public constructor(
    public readonly name: string,
    public readonly initial: TState,
    private readonly contextSchema: TContextSchema,
    private readonly eventSchemas: TSchemas,
    private readonly states: readonly TState[],
    private readonly steps: Map<TState, IStepDefinition<TContext, TSchemas, TState>>,
    initialContext: TContext,
  ) {
    this.initialContext = this.validateContext(initialContext);
  }

  public createInstance(): FlowInstance<TContext, TSchemas, TState> {
    return new FlowInstance(this);
  }

  public getStep(state: TState): IStepDefinition<TContext, TSchemas, TState> {
    const step = this.steps.get(state);

    if (!step) {
      throw new Error(`State "${state}" is not defined in flow "${this.name}".`);
    }

    return step;
  }

  public validateContext(context: TContext): TContext {
    return this.contextSchema.parse(context);
  }

  public validateEvent(event: FlowEventUnion<TSchemas>): FlowEventUnion<TSchemas> {
    const type = (event as { type?: string }).type;
    const schema = type ? this.eventSchemas[type] : undefined;

    if (!schema) {
      throw new Error(`Unknown event type "${String(type)}" in flow "${this.name}".`);
    }

    return schema.parse(event) as FlowEventUnion<TSchemas>;
  }

  public isKnownState(state: string): state is TState {
    return this.states.includes(state as TState);
  }
}

export class FlowInstance<TContext, TSchemas extends FlowEventSchemas, TState extends string> {
  private readonly listeners = new Set<
    (snapshot: FlowSnapshot<TContext, TState, FlowEventUnion<TSchemas>>) => void
  >();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly queue: Array<FlowEventUnion<TSchemas>> = [];
  private isProcessing = false;
  private snapshot: FlowSnapshot<TContext, TState, FlowEventUnion<TSchemas>>;

  public constructor(
    private readonly definition: IFlowDefinitionRuntime<TContext, TSchemas, TState>,
  ) {
    this.snapshot = {
      state: definition.initial,
      context: definition.initialContext,
      pendingEffects: [],
    };
  }

  public getSnapshot(): FlowSnapshot<TContext, TState, FlowEventUnion<TSchemas>> {
    return this.snapshot;
  }

  public subscribe(
    listener: (snapshot: FlowSnapshot<TContext, TState, FlowEventUnion<TSchemas>>) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async start(): Promise<FlowSnapshot<TContext, TState, FlowEventUnion<TSchemas>>> {
    await this.runEnterHandlers(undefined);
    return this.snapshot;
  }

  public async dispatch(event: FlowEventUnion<TSchemas>): Promise<void> {
    this.queue.push(this.definition.validateEvent(event));

    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const nextEvent = this.queue.shift();

        if (nextEvent) {
          await this.handleEvent(nextEvent);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public destroy(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  private applyUpdate(patch: FlowContextPatch<TContext>): TContext {
    const partial = typeof patch === 'function' ? patch(this.snapshot.context) : patch;
    const nextContext = this.definition.validateContext({
      ...this.snapshot.context,
      ...partial,
    });

    this.snapshot = {
      ...this.snapshot,
      context: nextContext,
    };
    this.notify();

    return nextContext;
  }

  private async runEffect<TResult>(name: string, task: () => Awaitable<TResult>): Promise<TResult> {
    this.snapshot = {
      ...this.snapshot,
      pendingEffects: [...this.snapshot.pendingEffects, name],
    };
    this.notify();

    try {
      return await task();
    } finally {
      const nextPendingEffects = [...this.snapshot.pendingEffects];
      const effectIndex = nextPendingEffects.lastIndexOf(name);

      if (effectIndex >= 0) {
        nextPendingEffects.splice(effectIndex, 1);
      }

      this.snapshot = {
        ...this.snapshot,
        pendingEffects: nextPendingEffects,
      };
      this.notify();
    }
  }

  private scheduleTask(
    ms: number,
    task: (api: FlowEnterApi<TContext, FlowEventUnion<TSchemas>, TState>) => Awaitable<void>,
    event: FlowEventUnion<TSchemas> | undefined,
  ): () => void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void this.runScheduledTask(task, event);
    }, ms);

    this.timers.add(timer);

    return () => {
      clearTimeout(timer);
      this.timers.delete(timer);
    };
  }

  private async runScheduledTask(
    task: (api: FlowEnterApi<TContext, FlowEventUnion<TSchemas>, TState>) => Awaitable<void>,
    event: FlowEventUnion<TSchemas> | undefined,
  ): Promise<void> {
    const transition: ITransitionRef<TState> = {};
    const api = this.createEnterApi(event, transition);

    await task(api);

    if (transition.nextState) {
      await this.transitionTo(transition.nextState, event);
    }
  }

  private createApiBase(
    event: FlowEventUnion<TSchemas> | undefined,
    transition: ITransitionRef<TState>,
  ): FlowApi<TContext, FlowEventUnion<TSchemas>, TState> {
    const readSnapshot = () => this.snapshot;

    return {
      get ctx() {
        return readSnapshot().context;
      },
      get state() {
        return readSnapshot().state;
      },
      update: (patch: FlowContextPatch<TContext>) => this.applyUpdate(patch),
      goto: (state: TState) => {
        if (!this.definition.isKnownState(state)) {
          throw new Error(`Unknown state "${state}" in flow "${this.definition.name}".`);
        }
        transition.nextState = state;
      },
      dispatch: (nextEvent: FlowEventUnion<TSchemas>) => this.dispatch(nextEvent),
      effect: <TResult>(name: string, task: () => Awaitable<TResult>) => this.runEffect(name, task),
      schedule: (
        ms: number,
        task: (api: FlowEnterApi<TContext, FlowEventUnion<TSchemas>, TState>) => Awaitable<void>,
      ) => this.scheduleTask(ms, task, event),
      getSnapshot: () => this.snapshot,
    };
  }

  private createHandlerApi<TEvent extends FlowEventUnion<TSchemas>>(
    event: TEvent,
    transition: ITransitionRef<TState>,
  ): FlowHandlerApi<TContext, FlowEventUnion<TSchemas>, TState, TEvent> {
    const baseApi = this.createApiBase(event, transition);

    return {
      ...baseApi,
      event,
    };
  }

  private createEnterApi(
    event: FlowEventUnion<TSchemas> | undefined,
    transition: ITransitionRef<TState>,
  ): FlowEnterApi<TContext, FlowEventUnion<TSchemas>, TState> {
    const baseApi = this.createApiBase(event, transition);

    return {
      ...baseApi,
      event,
    };
  }

  private async handleEvent(event: FlowEventUnion<TSchemas>): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      lastEvent: event,
    };
    this.notify();

    const step = this.definition.getStep(this.snapshot.state);
    const handler = step.handlers[event.type as Extract<keyof TSchemas, string>];

    if (!handler) {
      return;
    }

    const transition: ITransitionRef<TState> = {};
    const api = this.createHandlerApi(event, transition);

    await handler(api as never);

    if (transition.nextState) {
      await this.transitionTo(transition.nextState, event);
    }
  }

  private async transitionTo(
    nextState: TState,
    event: FlowEventUnion<TSchemas> | undefined,
  ): Promise<void> {
    this.clearTimers();
    this.snapshot = {
      ...this.snapshot,
      state: nextState,
    };
    this.notify();

    await this.runEnterHandlers(event);
  }

  private async runEnterHandlers(event: FlowEventUnion<TSchemas> | undefined): Promise<void> {
    const step = this.definition.getStep(this.snapshot.state);

    for (const enterHandler of step.enterHandlers) {
      const transition: ITransitionRef<TState> = {};
      const api = this.createEnterApi(event, transition);

      await enterHandler(api);

      if (transition.nextState) {
        await this.transitionTo(transition.nextState, event);
        return;
      }
    }
  }
}

export function createFlow<
  TContextSchema extends z.ZodTypeAny,
  TSchemas extends FlowEventSchemas,
  const TStates extends readonly [string, ...string[]],
>(config: ICreateFlowConfig<TContextSchema, TSchemas, TStates>) {
  type TContext = z.infer<TContextSchema>;
  type TState = FlowStateNames<TStates>;

  const steps = new Map<TState, IStepDefinition<TContext, TSchemas, TState>>();

  const builder = {
    step(name: TState, register: (api: IStepRegistrar<TContext, TSchemas, TState>) => void) {
      const definition: IStepDefinition<TContext, TSchemas, TState> = {
        handlers: {},
        enterHandlers: [],
      };

      const registrar: IStepRegistrar<TContext, TSchemas, TState> = {
        on(type, handler) {
          definition.handlers[type] = handler as HandlerMap<
            TContext,
            TSchemas,
            TState
          >[typeof type];
        },
        enter(handler) {
          definition.enterHandlers.push(handler);
        },
      };

      register(registrar);
      steps.set(name, definition);
      return builder;
    },
    build(): FlowDefinition<TContext, TSchemas, TState> {
      if (!steps.has(config.initial)) {
        throw new Error(`Initial state "${config.initial}" must be defined before build().`);
      }

      return new InternalFlowDefinition<TContext, TSchemas, TState, TContextSchema>(
        config.name,
        config.initial,
        config.context,
        config.events,
        config.states,
        steps,
        config.initialContext,
      );
    },
  };

  return builder;
}
