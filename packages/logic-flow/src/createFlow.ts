import { z } from 'zod';

export type Awaitable<T> = T | Promise<T>;
export type FlowEvent = { type: string };
export type FlowContextPatch<TContext> =
  | Partial<TContext>
  | ((context: TContext) => Partial<TContext>);
export type FlowEventUnion<TEvent extends FlowEvent> = TEvent;
export type FlowStateNames<TStates extends readonly string[]> = TStates[number];
export type FlowStateRefs<TState extends string> = { readonly [K in TState]: K };

export interface FlowSnapshot<TContext, TState extends string, TEvent extends FlowEvent> {
  state: TState;
  context: TContext;
  lastEvent?: TEvent;
  pendingEffects: string[];
}

export interface FlowApi<TContext, TAllEvents extends FlowEvent, TState extends string> {
  readonly ctx: TContext;
  readonly state: TState;
  readonly states: FlowStateRefs<TState>;
  update(patch: FlowContextPatch<TContext>): TContext;
  goto(state: TState): void;
  dispatch<TEvent extends FlowEvent>(event: TEvent): Promise<void>;
  effect<TResult>(name: string, task: () => Awaitable<TResult>): Promise<TResult>;
  schedule(
    ms: number,
    task: (api: FlowEnterApi<TContext, TAllEvents, TState>) => Awaitable<void>,
  ): () => void;
  getSnapshot(): FlowSnapshot<TContext, TState, TAllEvents>;
}

export interface FlowHandlerApi<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TEvent,
> extends FlowApi<TContext, TAllEvents, TState> {
  readonly event: TEvent;
}

export interface FlowEnterApi<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
> extends FlowApi<TContext, TAllEvents, TState> {
  readonly event: TAllEvents | undefined;
}

export type FlowHandler<TContext, TAllEvents extends FlowEvent, TState extends string, TEvent> = (
  api: FlowHandlerApi<TContext, TAllEvents, TState, TEvent>,
) => Awaitable<void>;

export type FlowEnterHandler<TContext, TEvent extends FlowEvent, TState extends string> = (
  api: FlowEnterApi<TContext, TEvent, TState>,
) => Awaitable<void>;

type EventShape = z.ZodRawShape;

type EventFromShape<TType extends string, TShape extends EventShape> = {
  type: TType;
} & z.infer<z.ZodObject<TShape>>;

interface EventRegistration<
  TContext,
  TState extends string,
  TType extends string,
  TShape extends EventShape,
> {
  kind: 'event';
  type: TType;
  schema: z.ZodObject<{ type: z.ZodLiteral<TType> } & TShape>;
  handler: unknown;
}

interface EnterRegistration<TContext, TState extends string> {
  kind: 'enter';
  handler: unknown;
}

type StepRegistration<TContext, TState extends string> =
  | EventRegistration<TContext, TState, string, EventShape>
  | EnterRegistration<TContext, TState>;

type StepEvent<TRegistration> =
  TRegistration extends EventRegistration<any, any, infer TType, infer TShape>
    ? EventFromShape<TType, TShape>
    : never;

type StepEvents<TRegistrations extends readonly unknown[]> = StepEvent<TRegistrations[number]>;

interface IStepDefinition<TContext, TAllEvents extends FlowEvent, TState extends string> {
  handlers: Partial<Record<string, FlowHandler<TContext, TAllEvents, TState, FlowEvent>>>;
  enterHandlers: Array<FlowEnterHandler<TContext, TAllEvents, TState>>;
}

interface ITransitionRef<TState extends string> {
  nextState?: TState;
}

interface ICreateFlowConfig<
  TContextSchema extends z.ZodTypeAny,
  TStates extends readonly [string, ...string[]],
> {
  name: string;
  context: TContextSchema;
  states: TStates;
  initial: FlowStateNames<TStates>;
  initialContext: z.infer<TContextSchema>;
}

interface IStepRegistrar<TContext, TAllEvents extends FlowEvent, TState extends string> {
  readonly states: FlowStateRefs<TState>;
  on<const TType extends string, TShape extends EventShape>(
    type: TType,
    shape: TShape,
    handler: FlowHandler<
      TContext,
      TAllEvents | EventFromShape<TType, TShape>,
      TState,
      EventFromShape<TType, TShape>
    >,
  ): EventRegistration<TContext, TState, TType, TShape>;
  enter(
    handler: FlowEnterHandler<TContext, TAllEvents, TState>,
  ): EnterRegistration<TContext, TState>;
}

export interface FlowDefinition<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly name: string;
  readonly initial: TState;
  readonly initialContext: TContext;
  createInstance(): FlowInstance<TContext, TEvent, TState>;
}

interface IFlowDefinitionRuntime<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> extends FlowDefinition<TContext, TEvent, TState> {
  getStep(state: TState): IStepDefinition<TContext, TEvent, TState>;
  getStates(): FlowStateRefs<TState>;
  validateContext(context: TContext): TContext;
  validateEvent(event: FlowEvent): TEvent;
  isKnownState(state: string): state is TState;
}

class InternalFlowDefinition<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
  TContextSchema extends z.ZodTypeAny,
> implements IFlowDefinitionRuntime<TContext, TEvent, TState> {
  public readonly initialContext: TContext;

  public constructor(
    public readonly name: string,
    public readonly initial: TState,
    private readonly contextSchema: TContextSchema,
    private readonly eventSchemas: ReadonlyMap<string, z.ZodType<FlowEvent>>,
    private readonly stateRefs: FlowStateRefs<TState>,
    private readonly steps: Map<TState, IStepDefinition<TContext, TEvent, TState>>,
    initialContext: TContext,
  ) {
    this.initialContext = this.validateContext(initialContext);
  }

  public createInstance(): FlowInstance<TContext, TEvent, TState> {
    return new FlowInstance(this);
  }

  public getStep(state: TState): IStepDefinition<TContext, TEvent, TState> {
    const step = this.steps.get(state);

    if (!step) {
      throw new Error(`State "${state}" is not defined in flow "${this.name}".`);
    }

    return step;
  }

  public getStates(): FlowStateRefs<TState> {
    return this.stateRefs;
  }

  public validateContext(context: TContext): TContext {
    return this.contextSchema.parse(context);
  }

  public validateEvent(event: FlowEvent): TEvent {
    const schema = this.eventSchemas.get(event.type);

    if (!schema) {
      throw new Error(`Unknown event type "${String(event.type)}" in flow "${this.name}".`);
    }

    return schema.parse(event) as TEvent;
  }

  public isKnownState(state: string): state is TState {
    return state in this.stateRefs;
  }
}

export class FlowInstance<TContext, TEvent extends FlowEvent, TState extends string> {
  private readonly listeners = new Set<
    (snapshot: FlowSnapshot<TContext, TState, TEvent>) => void
  >();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly queue: TEvent[] = [];
  private isProcessing = false;
  private snapshot: FlowSnapshot<TContext, TState, TEvent>;

  public constructor(
    private readonly definition: IFlowDefinitionRuntime<TContext, TEvent, TState>,
  ) {
    this.snapshot = {
      state: definition.initial,
      context: definition.initialContext,
      pendingEffects: [],
    };
  }

  public getSnapshot(): FlowSnapshot<TContext, TState, TEvent> {
    return this.snapshot;
  }

  public subscribe(
    listener: (snapshot: FlowSnapshot<TContext, TState, TEvent>) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async start(): Promise<FlowSnapshot<TContext, TState, TEvent>> {
    await this.runEnterHandlers(undefined);
    return this.snapshot;
  }

  public async dispatch<TDispatchedEvent extends FlowEvent>(
    event: TDispatchedEvent,
  ): Promise<void> {
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
    task: (api: FlowEnterApi<TContext, TEvent, TState>) => Awaitable<void>,
    event: TEvent | undefined,
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
    task: (api: FlowEnterApi<TContext, TEvent, TState>) => Awaitable<void>,
    event: TEvent | undefined,
  ): Promise<void> {
    const transition: ITransitionRef<TState> = {};
    const api = this.createEnterApi(event, transition);

    await task(api);

    if (transition.nextState) {
      await this.transitionTo(transition.nextState, event);
    }
  }

  private createApiBase(
    event: TEvent | undefined,
    transition: ITransitionRef<TState>,
  ): FlowApi<TContext, TEvent, TState> {
    const readSnapshot = () => this.snapshot;
    const stateRefs = this.definition.getStates();

    return {
      get ctx() {
        return readSnapshot().context;
      },
      get state() {
        return readSnapshot().state;
      },
      states: stateRefs,
      update: (patch: FlowContextPatch<TContext>) => this.applyUpdate(patch),
      goto: (state: TState) => {
        if (!this.definition.isKnownState(state)) {
          throw new Error(`Unknown state "${state}" in flow "${this.definition.name}".`);
        }

        transition.nextState = state;
      },
      dispatch: <TDispatchedEvent extends FlowEvent>(nextEvent: TDispatchedEvent) =>
        this.dispatch(nextEvent),
      effect: <TResult>(name: string, task: () => Awaitable<TResult>) => this.runEffect(name, task),
      schedule: (
        ms: number,
        task: (api: FlowEnterApi<TContext, TEvent, TState>) => Awaitable<void>,
      ) => this.scheduleTask(ms, task, event),
      getSnapshot: () => this.snapshot,
    };
  }

  private createHandlerApi<TCurrentEvent extends TEvent>(
    event: TCurrentEvent,
    transition: ITransitionRef<TState>,
  ): FlowHandlerApi<TContext, TEvent, TState, TCurrentEvent> {
    const baseApi = this.createApiBase(event, transition);

    return {
      ...baseApi,
      event,
    };
  }

  private createEnterApi(
    event: TEvent | undefined,
    transition: ITransitionRef<TState>,
  ): FlowEnterApi<TContext, TEvent, TState> {
    const baseApi = this.createApiBase(event, transition);

    return {
      ...baseApi,
      event,
    };
  }

  private async handleEvent(event: TEvent): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      lastEvent: event,
    };
    this.notify();

    const step = this.definition.getStep(this.snapshot.state);
    const handler = step.handlers[event.type];

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

  private async transitionTo(nextState: TState, event: TEvent | undefined): Promise<void> {
    this.clearTimers();
    this.snapshot = {
      ...this.snapshot,
      state: nextState,
    };
    this.notify();

    await this.runEnterHandlers(event);
  }

  private async runEnterHandlers(event: TEvent | undefined): Promise<void> {
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

interface FlowBuilder<
  TContextSchema extends z.ZodTypeAny,
  TStates extends readonly [string, ...string[]],
  TAllEvents extends FlowEvent,
> {
  step<
    TRegistrations extends readonly StepRegistration<
      z.infer<TContextSchema>,
      FlowStateNames<TStates>
    >[],
  >(
    name: FlowStateNames<TStates>,
    register: (
      api: IStepRegistrar<z.infer<TContextSchema>, TAllEvents, FlowStateNames<TStates>>,
    ) => TRegistrations,
  ): FlowBuilder<TContextSchema, TStates, TAllEvents | StepEvents<TRegistrations>>;
  build(): FlowDefinition<z.infer<TContextSchema>, TAllEvents, FlowStateNames<TStates>>;
}

function createStateRefs<TState extends string>(states: readonly TState[]): FlowStateRefs<TState> {
  return Object.freeze(
    Object.fromEntries(states.map((state) => [state, state])) as FlowStateRefs<TState>,
  );
}

function createEventSchema<const TType extends string, TShape extends EventShape>(
  type: TType,
  shape: TShape,
): z.ZodObject<{ type: z.ZodLiteral<TType> } & TShape> {
  return z.object({
    type: z.literal(type),
    ...shape,
  } as { type: z.ZodLiteral<TType> } & TShape);
}

export function createFlow<
  TContextSchema extends z.ZodTypeAny,
  const TStates extends readonly [string, ...string[]],
>(config: ICreateFlowConfig<TContextSchema, TStates>) {
  type TContext = z.infer<TContextSchema>;
  type TState = FlowStateNames<TStates>;

  const steps = new Map<TState, IStepDefinition<TContext, FlowEvent, TState>>();
  const eventSchemas = new Map<string, z.ZodType<FlowEvent>>();
  const stateRefs = createStateRefs(config.states as readonly TState[]);

  const createBuilder = <TAllEvents extends FlowEvent>(): FlowBuilder<
    TContextSchema,
    TStates,
    TAllEvents
  > => ({
    step<TRegistrations extends readonly StepRegistration<TContext, TState>[]>(
      name: TState,
      register: (api: IStepRegistrar<TContext, TAllEvents, TState>) => TRegistrations,
    ) {
      const definition: IStepDefinition<TContext, FlowEvent, TState> = {
        handlers: {},
        enterHandlers: [],
      };

      const registrar: IStepRegistrar<TContext, TAllEvents, TState> = {
        states: stateRefs,
        on(type, shape, handler) {
          return {
            kind: 'event',
            type,
            schema: createEventSchema(type, shape),
            handler,
          } as EventRegistration<TContext, TState, typeof type, typeof shape>;
        },
        enter(handler) {
          return {
            kind: 'enter',
            handler,
          };
        },
      };

      const registrations = register(registrar);

      for (const registration of registrations) {
        if (registration.kind === 'enter') {
          definition.enterHandlers.push(
            registration.handler as FlowEnterHandler<TContext, FlowEvent, TState>,
          );
          continue;
        }

        definition.handlers[registration.type] = registration.handler as FlowHandler<
          TContext,
          FlowEvent,
          TState,
          FlowEvent
        >;

        if (!eventSchemas.has(registration.type)) {
          eventSchemas.set(registration.type, registration.schema as z.ZodType<FlowEvent>);
        }
      }

      steps.set(name, definition);
      return createBuilder<TAllEvents | StepEvents<TRegistrations>>();
    },
    build() {
      if (!steps.has(config.initial)) {
        throw new Error(`Initial state "${config.initial}" must be defined before build().`);
      }

      return new InternalFlowDefinition<TContext, TAllEvents, TState, TContextSchema>(
        config.name,
        config.initial,
        config.context,
        eventSchemas,
        stateRefs,
        steps as Map<TState, IStepDefinition<TContext, TAllEvents, TState>>,
        config.initialContext,
      );
    },
  });

  return createBuilder<never>();
}
