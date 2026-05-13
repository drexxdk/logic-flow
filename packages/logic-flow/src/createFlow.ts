import { z } from 'zod';

type Awaitable<T> = T | Promise<T>;
export type FlowEvent = { type: string };
type FlowContextPatch<TContext> = Partial<TContext> | ((context: TContext) => Partial<TContext>);
type FlowStateNames<TStates extends readonly string[]> = TStates[number];
type FlowStateRefs<TState extends string> = { readonly [K in TState]: K };
type FlowTransitionTargets<TState extends string> = readonly TState[];
type FlowTransitionInput<
  TState extends string,
  TTargets extends FlowTransitionTargets<TState> = readonly TState[],
> = FlowTransitionOptions<TState, TTargets> | TTargets | TState;

interface FlowTransitionOptions<
  TState extends string,
  TTargets extends FlowTransitionTargets<TState>,
> {
  readonly targets: TTargets;
}

interface FlowTransitionDescriptor<TState extends string> {
  readonly kind: 'enter' | 'event';
  readonly event?: string;
  readonly targets: readonly TState[];
}

export interface FlowSnapshot<TContext, TState extends string, TEvent extends FlowEvent> {
  state: TState;
  context: TContext;
  lastEvent?: TEvent;
  pendingEffects: string[];
}

export interface FlowInstanceOptions {
  autoStart?: boolean;
}

interface FlowApi<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TGotoState extends TState = TState,
> {
  readonly ctx: TContext;
  readonly state: TState;
  readonly states: FlowStateRefs<TState>;
  update(patch: FlowContextPatch<TContext>): TContext;
  goto(state: TGotoState): never;
  dispatch<TEvent extends FlowEvent>(event: TEvent): Promise<void>;
  effect<TResult>(name: string, task: () => Awaitable<TResult>): Promise<TResult>;
  schedule(
    ms: number,
    task: (api: FlowEnterApi<TContext, TAllEvents, TState, TGotoState>) => Awaitable<void>,
  ): () => void;
  getSnapshot(): FlowSnapshot<TContext, TState, TAllEvents>;
}

interface FlowHandlerApi<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TEvent,
  TGotoState extends TState = TState,
> extends FlowApi<TContext, TAllEvents, TState, TGotoState> {
  readonly event: TEvent;
}

interface FlowEnterApi<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TGotoState extends TState = TState,
> extends FlowApi<TContext, TAllEvents, TState, TGotoState> {
  readonly event: TAllEvents | undefined;
}

type FlowHandler<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TEvent,
  TGotoState extends TState = TState,
> = (api: FlowHandlerApi<TContext, TAllEvents, TState, TEvent, TGotoState>) => Awaitable<void>;

type FlowEnterHandler<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
  TGotoState extends TState = TState,
> = (api: FlowEnterApi<TContext, TEvent, TState, TGotoState>) => Awaitable<void>;

type EventShape = z.ZodRawShape;

type EventFromShape<TType extends string, TShape extends EventShape> = {
  type: TType;
} & z.infer<z.ZodObject<TShape>>;

interface EventRegistration<
  TState extends string,
  TType extends string,
  TShape extends EventShape,
  TTargets extends FlowTransitionTargets<TState>,
> {
  kind: 'event';
  type: TType;
  schema: z.ZodObject<{ type: z.ZodLiteral<TType> } & TShape>;
  targets: TTargets;
  handler: unknown;
}

interface EnterRegistration<TState extends string, TTargets extends FlowTransitionTargets<TState>> {
  kind: 'enter';
  targets: TTargets;
  handler: unknown;
}

type StepRegistration<TState extends string> =
  | EventRegistration<TState, string, EventShape, FlowTransitionTargets<TState>>
  | EnterRegistration<TState, FlowTransitionTargets<TState>>;

type StepEvent<TRegistration> =
  TRegistration extends EventRegistration<string, infer TType, infer TShape, readonly string[]>
    ? EventFromShape<TType, TShape>
    : never;

type StepEvents<TRegistrations> = TRegistrations extends readonly unknown[]
  ? StepEvent<TRegistrations[number]>
  : StepEvent<TRegistrations>;
type StepRegistrationResult<TState extends string> =
  | StepRegistration<TState>
  | readonly StepRegistration<TState>[];

interface IStepDefinition<TContext, TAllEvents extends FlowEvent, TState extends string> {
  handlers: Partial<Record<string, FlowHandler<TContext, TAllEvents, TState, FlowEvent>>>;
  enterHandlers: Array<FlowEnterHandler<TContext, TAllEvents, TState>>;
  transitions: readonly FlowTransitionDescriptor<TState>[];
}

class FlowTransitionSignal<TState extends string> {
  public constructor(public readonly nextState: TState) {}
}

class FlowExecutionTerminatedError extends Error {
  public constructor(reason: 'dispatch') {
    super(`The current flow execution already ended after ${reason}(...).`);
  }
}

interface IExecutionContext {
  active: boolean;
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
  ): EventRegistration<TState, TType, TShape, readonly TState[]>;
  on<const TType extends string, TShape extends EventShape, const TTarget extends TState>(
    type: TType,
    shape: TShape,
    target: TTarget,
    handler: FlowHandler<
      TContext,
      TAllEvents | EventFromShape<TType, TShape>,
      TState,
      EventFromShape<TType, TShape>,
      TTarget
    >,
  ): EventRegistration<TState, TType, TShape, readonly [TTarget]>;
  on<
    const TType extends string,
    TShape extends EventShape,
    const TTargets extends readonly TState[],
  >(
    type: TType,
    shape: TShape,
    targets: FlowTransitionInput<TState, TTargets>,
    handler: FlowHandler<
      TContext,
      TAllEvents | EventFromShape<TType, TShape>,
      TState,
      EventFromShape<TType, TShape>,
      TTargets[number]
    >,
  ): EventRegistration<TState, TType, TShape, TTargets>;
  enter(
    handler: FlowEnterHandler<TContext, TAllEvents, TState>,
  ): EnterRegistration<TState, readonly TState[]>;
  enter<const TTarget extends TState>(
    target: TTarget,
    handler: FlowEnterHandler<TContext, TAllEvents, TState, TTarget>,
  ): EnterRegistration<TState, readonly [TTarget]>;
  enter<const TTargets extends readonly TState[]>(
    targets: FlowTransitionInput<TState, TTargets>,
    handler: FlowEnterHandler<TContext, TAllEvents, TState, TTargets[number]>,
  ): EnterRegistration<TState, TTargets>;
}

export interface FlowDefinition<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly name: string;
  readonly initial: TState;
  readonly initialContext: TContext;
  readonly transitions: Readonly<Record<TState, readonly FlowTransitionDescriptor<TState>[]>>;
  createInstance(options?: FlowInstanceOptions): FlowInstance<TContext, TEvent, TState>;
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
  public readonly transitions: Readonly<
    Record<TState, readonly FlowTransitionDescriptor<TState>[]>
  >;

  public constructor(
    public readonly name: string,
    public readonly initial: TState,
    private readonly contextSchema: TContextSchema,
    private readonly eventSchemas: ReadonlyMap<string, z.ZodType<FlowEvent>>,
    private readonly stateRefs: FlowStateRefs<TState>,
    private readonly steps: Map<TState, IStepDefinition<TContext, TEvent, TState>>,
    transitions: Readonly<Record<TState, readonly FlowTransitionDescriptor<TState>[]>>,
    initialContext: TContext,
  ) {
    this.transitions = transitions;
    this.initialContext = this.validateContext(initialContext);
  }

  public createInstance(options?: FlowInstanceOptions): FlowInstance<TContext, TEvent, TState> {
    const instance = new FlowInstance(this);

    if (options?.autoStart) {
      void instance.start();
    }

    return instance;
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
  private isDestroyed = false;
  private hasStarted = false;
  private isProcessing = false;
  private startPromise: Promise<FlowSnapshot<TContext, TState, TEvent>> | undefined;
  private snapshot: FlowSnapshot<TContext, TState, TEvent>;

  public readonly send = <TDispatchedEvent extends TEvent>(event: TDispatchedEvent) =>
    this.dispatch(event);

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
    if (this.isDestroyed) {
      return () => {};
    }

    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async start(): Promise<FlowSnapshot<TContext, TState, TEvent>> {
    if (this.isDestroyed) {
      return this.snapshot;
    }

    if (this.hasStarted) {
      return this.snapshot;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      await this.runEnterHandlers(undefined);
      this.hasStarted = true;
      return this.snapshot;
    })();

    try {
      return await this.startPromise;
    } finally {
      if (!this.hasStarted) {
        this.startPromise = undefined;
      }
    }
  }

  public async dispatch<TDispatchedEvent extends FlowEvent>(
    event: TDispatchedEvent,
  ): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.queue.push(this.definition.validateEvent(event));

    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (!this.isDestroyed && this.queue.length > 0) {
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
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.queue.length = 0;
    this.clearTimers();
    this.snapshot = {
      ...this.snapshot,
      pendingEffects: [],
    };
    this.listeners.clear();
  }

  private notify(): void {
    if (this.isDestroyed) {
      return;
    }

    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  private applyUpdate(patch: FlowContextPatch<TContext>): TContext {
    if (this.isDestroyed) {
      return this.snapshot.context;
    }

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
    if (this.isDestroyed) {
      return undefined as TResult;
    }

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

      if (!this.isDestroyed) {
        this.snapshot = {
          ...this.snapshot,
          pendingEffects: nextPendingEffects,
        };
        this.notify();
      }
    }
  }

  private scheduleTask(
    ms: number,
    task: (api: FlowEnterApi<TContext, TEvent, TState>) => Awaitable<void>,
    event: TEvent | undefined,
  ): () => void {
    if (this.isDestroyed) {
      return () => {};
    }

    const timer = setTimeout(() => {
      this.timers.delete(timer);

      if (!this.isDestroyed) {
        void this.runScheduledTask(task, event);
      }
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
    if (this.isDestroyed) {
      return;
    }

    const api = this.createEnterApi(event);
    const nextState = await this.captureTransition(task, api);

    if (!this.isDestroyed && nextState) {
      await this.transitionTo(nextState, event);
    }
  }

  private createApiBase(event: TEvent | undefined): FlowApi<TContext, TEvent, TState> {
    const readSnapshot = () => this.snapshot;
    const stateRefs = this.definition.getStates();
    const execution: IExecutionContext = { active: true };

    const assertActive = () => {
      if (!execution.active) {
        throw new FlowExecutionTerminatedError('dispatch');
      }

      return !this.isDestroyed;
    };

    return {
      get ctx() {
        return readSnapshot().context;
      },
      get state() {
        return readSnapshot().state;
      },
      states: stateRefs,
      update: (patch: FlowContextPatch<TContext>) => {
        if (!assertActive()) {
          return readSnapshot().context;
        }

        return this.applyUpdate(patch);
      },
      goto: (state: TState) => {
        if (!assertActive()) {
          return undefined as never;
        }

        execution.active = false;

        if (!this.definition.isKnownState(state)) {
          throw new Error(`Unknown state "${state}" in flow "${this.definition.name}".`);
        }

        throw new FlowTransitionSignal(state);
      },
      dispatch: <TDispatchedEvent extends FlowEvent>(nextEvent: TDispatchedEvent) => {
        if (!assertActive()) {
          return Promise.resolve();
        }

        execution.active = false;
        return this.dispatch(nextEvent);
      },
      effect: <TResult>(name: string, task: () => Awaitable<TResult>) => {
        if (!assertActive()) {
          return Promise.resolve(undefined as TResult);
        }

        return this.runEffect(name, task);
      },
      schedule: (
        ms: number,
        task: (api: FlowEnterApi<TContext, TEvent, TState>) => Awaitable<void>,
      ) => {
        if (!assertActive()) {
          return () => {};
        }

        return this.scheduleTask(ms, task, event);
      },
      getSnapshot: () => {
        if (!assertActive()) {
          return readSnapshot();
        }

        return this.snapshot;
      },
    };
  }

  private createHandlerApi<TCurrentEvent extends TEvent>(
    event: TCurrentEvent,
  ): FlowHandlerApi<TContext, TEvent, TState, TCurrentEvent> {
    const baseApi = this.createApiBase(event);

    return {
      ...baseApi,
      event,
    };
  }

  private createEnterApi(event: TEvent | undefined): FlowEnterApi<TContext, TEvent, TState> {
    const baseApi = this.createApiBase(event);

    return {
      ...baseApi,
      event,
    };
  }

  private isTransitionSignal(error: unknown): error is FlowTransitionSignal<TState> {
    return error instanceof FlowTransitionSignal;
  }

  private async captureTransition<TApi>(
    task: (api: TApi) => Awaitable<void>,
    api: TApi,
  ): Promise<TState | undefined> {
    try {
      await task(api);
      return undefined;
    } catch (error) {
      if (this.isTransitionSignal(error)) {
        return error.nextState;
      }

      throw error;
    }
  }

  private async handleEvent(event: TEvent): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

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

    const api = this.createHandlerApi(event);
    const nextState = await this.captureTransition(
      handler as FlowHandler<TContext, TEvent, TState, TEvent>,
      api,
    );

    if (!this.isDestroyed && nextState) {
      await this.transitionTo(nextState, event);
    }
  }

  private async transitionTo(nextState: TState, event: TEvent | undefined): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.clearTimers();
    this.snapshot = {
      ...this.snapshot,
      state: nextState,
    };
    this.notify();

    await this.runEnterHandlers(event);
  }

  private async runEnterHandlers(event: TEvent | undefined): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const step = this.definition.getStep(this.snapshot.state);

    for (const enterHandler of step.enterHandlers) {
      const api = this.createEnterApi(event);
      const nextState = await this.captureTransition(enterHandler, api);

      if (this.isDestroyed) {
        return;
      }

      if (nextState) {
        await this.transitionTo(nextState, event);
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
  step(name: FlowStateNames<TStates>): FlowBuilder<TContextSchema, TStates, TAllEvents>;
  step<TRegistrations extends StepRegistrationResult<FlowStateNames<TStates>>>(
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

function isTransitionOptions<TState extends string>(
  targetOrTargets: FlowTransitionInput<TState, readonly TState[]>,
): targetOrTargets is FlowTransitionOptions<TState, readonly TState[]> {
  return !Array.isArray(targetOrTargets);
}

function normalizeTargets<TState extends string>(
  targetOrTargets?: FlowTransitionInput<TState, readonly TState[]>,
): readonly TState[] {
  if (typeof targetOrTargets === 'string') {
    return [targetOrTargets];
  }

  if (Array.isArray(targetOrTargets)) {
    return targetOrTargets;
  }

  if (!targetOrTargets) {
    return [];
  }

  return isTransitionOptions(targetOrTargets) ? targetOrTargets.targets : [];
}

function normalizeStepRegistrations<TState extends string>(
  registrations: StepRegistrationResult<TState>,
): readonly StepRegistration<TState>[] {
  return Array.isArray(registrations) ? registrations : [registrations as StepRegistration<TState>];
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
    step: (<TRegistrations extends StepRegistrationResult<TState>>(
      name: TState,
      register?: (api: IStepRegistrar<TContext, TAllEvents, TState>) => TRegistrations,
    ) => {
      if (steps.has(name)) {
        throw new Error(`State "${name}" is already defined in flow "${config.name}".`);
      }

      const definition: IStepDefinition<TContext, FlowEvent, TState> = {
        handlers: {},
        enterHandlers: [],
        transitions: [],
      };

      const registrar: IStepRegistrar<TContext, TAllEvents, TState> = {
        states: stateRefs,
        on: ((
          type: string,
          shape: EventShape,
          optionsOrHandler:
            | FlowTransitionInput<TState, readonly TState[]>
            | FlowHandler<TContext, FlowEvent, TState, FlowEvent>,
          maybeHandler?: FlowHandler<TContext, FlowEvent, TState, FlowEvent>,
        ) => {
          const hasOptions = typeof maybeHandler === 'function';
          const options = hasOptions ? optionsOrHandler : undefined;
          const handler = hasOptions ? maybeHandler : optionsOrHandler;

          return {
            kind: 'event',
            type,
            schema: createEventSchema(type, shape),
            targets: normalizeTargets(options as FlowTransitionInput<TState, readonly TState[]>),
            handler,
          } as EventRegistration<TState, typeof type, typeof shape, readonly TState[]>;
        }) as IStepRegistrar<TContext, TAllEvents, TState>['on'],
        enter: ((
          optionsOrHandler:
            | FlowTransitionInput<TState, readonly TState[]>
            | FlowEnterHandler<TContext, FlowEvent, TState>,
          maybeHandler?: FlowEnterHandler<TContext, FlowEvent, TState>,
        ) => {
          const hasOptions = typeof maybeHandler === 'function';
          const options = hasOptions ? optionsOrHandler : undefined;
          const handler = hasOptions ? maybeHandler : optionsOrHandler;

          return {
            kind: 'enter',
            targets: normalizeTargets(options as FlowTransitionInput<TState, readonly TState[]>),
            handler,
          };
        }) as IStepRegistrar<TContext, TAllEvents, TState>['enter'],
      };

      const registrations = register ? normalizeStepRegistrations(register(registrar)) : [];

      for (const registration of registrations) {
        if (registration.kind === 'enter') {
          definition.enterHandlers.push(
            registration.handler as FlowEnterHandler<TContext, FlowEvent, TState>,
          );
          if (registration.targets.length > 0) {
            definition.transitions = [
              ...definition.transitions,
              {
                kind: 'enter',
                targets: registration.targets,
              },
            ];
          }
          continue;
        }

        if (registration.type in definition.handlers) {
          throw new Error(
            `Event "${registration.type}" is already defined for state "${name}" in flow "${config.name}".`,
          );
        }

        definition.handlers[registration.type] = registration.handler as FlowHandler<
          TContext,
          FlowEvent,
          TState,
          FlowEvent
        >;

        if (registration.targets.length > 0) {
          definition.transitions = [
            ...definition.transitions,
            {
              kind: 'event',
              event: registration.type,
              targets: registration.targets,
            },
          ];
        }

        if (!eventSchemas.has(registration.type)) {
          eventSchemas.set(registration.type, registration.schema as z.ZodType<FlowEvent>);
        }
      }

      steps.set(name, definition);
      return register
        ? createBuilder<TAllEvents | StepEvents<TRegistrations>>()
        : createBuilder<TAllEvents>();
    }) as FlowBuilder<TContextSchema, TStates, TAllEvents>['step'],
    build() {
      if (!steps.has(config.initial)) {
        throw new Error(`Initial state "${config.initial}" must be defined before build().`);
      }

      for (const state of config.states) {
        if (!steps.has(state)) {
          throw new Error(`State "${state}" must be defined before build().`);
        }
      }

      const transitions = Object.freeze(
        Object.fromEntries(
          config.states.map((state) => [state, Object.freeze(steps.get(state)?.transitions ?? [])]),
        ) as Record<TState, readonly FlowTransitionDescriptor<TState>[]>,
      );

      return new InternalFlowDefinition<TContext, TAllEvents, TState, TContextSchema>(
        config.name,
        config.initial,
        config.context,
        eventSchemas,
        stateRefs,
        steps as Map<TState, IStepDefinition<TContext, TAllEvents, TState>>,
        transitions,
        config.initialContext,
      );
    },
  });

  return createBuilder<never>();
}
