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
  dispatch<TEvent extends TAllEvents>(event: TEvent): Promise<void>;
  dispatch<TType extends string, TShape extends EventShape>(
    eventDefinition: FlowEventDefinition<TType, TShape>,
    ...args: EventPayloadArgs<TShape>
  ): Promise<void>;
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
type EventPayload<TShape extends EventShape> = z.infer<z.ZodObject<TShape>>;
type EventPayloadArgs<TShape extends EventShape> = keyof TShape extends never
  ? [] | [payload: EventPayload<TShape>]
  : [payload: EventPayload<TShape>];
type RequestStepRunResult<TShape extends EventShape> = keyof TShape extends never
  ? void | EventPayload<TShape>
  : EventPayload<TShape>;

type EventFromShape<TType extends string, TShape extends EventShape> = {
  type: TType;
} & z.infer<z.ZodObject<TShape>>;

interface EventFactory<TType extends string, TShape extends EventShape> {
  create(payload?: EventPayload<TShape>): EventFromShape<TType, TShape>;
}

declare const flowEventShapeBrand: unique symbol;

export interface FlowEventDefinition<TType extends string, TShape extends EventShape> {
  readonly type: TType;
  readonly [flowEventShapeBrand]?: TShape;
}

interface InternalFlowEventDefinition<TType extends string, TShape extends EventShape>
  extends FlowEventDefinition<TType, TShape>, EventFactory<TType, TShape> {
  readonly schema: z.ZodObject<{ type: z.ZodLiteral<TType> } & TShape>;
}

interface EventRegistration<
  TState extends string,
  TType extends string,
  TShape extends EventShape,
  TTargets extends FlowTransitionTargets<TState>,
> extends InternalFlowEventDefinition<TType, TShape> {
  kind: 'event';
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

interface IQueuedDispatch<TEvent> {
  readonly event: TEvent;
  readonly completion: IDispatchCompletion;
}

interface IDispatchCompletion {
  pendingCount: number;
  settled: boolean;
  resolve(): void;
  reject(error: unknown): void;
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
    eventDefinition: FlowEventDefinition<TType, TShape>,
    handler: FlowHandler<
      TContext,
      TAllEvents | EventFromShape<TType, TShape>,
      TState,
      EventFromShape<TType, TShape>
    >,
  ): EventRegistration<TState, TType, TShape, readonly TState[]>;
  on<const TType extends string, TShape extends EventShape, const TTarget extends TState>(
    eventDefinition: FlowEventDefinition<TType, TShape>,
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
    eventDefinition: FlowEventDefinition<TType, TShape>,
    targets: FlowTransitionInput<TState, TTargets>,
    handler: FlowHandler<
      TContext,
      TAllEvents | EventFromShape<TType, TShape>,
      TState,
      EventFromShape<TType, TShape>,
      TTargets[number]
    >,
  ): EventRegistration<TState, TType, TShape, TTargets>;
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

interface RequestStepTransitionConfig<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TType extends string,
  TShape extends EventShape = {},
> {
  type: TType;
  shape?: TShape;
  target?: FlowTransitionInput<TState, readonly TState[]>;
  handle?: FlowHandler<
    TContext,
    TAllEvents | EventFromShape<TType, TShape>,
    TState,
    EventFromShape<TType, TShape>
  >;
}

interface RequestStepFailureConfig<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TType extends string,
  TShape extends EventShape,
> extends RequestStepTransitionConfig<TContext, TAllEvents, TState, TType, TShape> {
  mapError: (
    error: unknown,
    api: FlowEnterApi<TContext, TAllEvents, TState>,
  ) => Awaitable<z.infer<z.ZodObject<TShape>>>;
}

interface RequestStepConfig<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TSuccessType extends string,
  TSuccessShape extends EventShape,
  TFailureType extends string,
  TFailureShape extends EventShape,
> {
  run: (
    api: FlowEnterApi<TContext, TAllEvents, TState>,
  ) => Awaitable<RequestStepRunResult<TSuccessShape>>;
  success: RequestStepTransitionConfig<
    TContext,
    | TAllEvents
    | EventFromShape<TSuccessType, TSuccessShape>
    | EventFromShape<TFailureType, TFailureShape>,
    TState,
    TSuccessType,
    TSuccessShape
  >;
  failure: RequestStepFailureConfig<
    TContext,
    | TAllEvents
    | EventFromShape<TSuccessType, TSuccessShape>
    | EventFromShape<TFailureType, TFailureShape>,
    TState,
    TFailureType,
    TFailureShape
  >;
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
  private readonly queue: IQueuedDispatch<TEvent>[] = [];
  private isDestroyed = false;
  private hasStarted = false;
  private isProcessing = false;
  private currentCompletion: IDispatchCompletion | undefined;
  private startPromise: Promise<FlowSnapshot<TContext, TState, TEvent>> | undefined;
  private snapshot: FlowSnapshot<TContext, TState, TEvent>;

  public readonly send: {
    <TDispatchedEvent extends TEvent>(event: TDispatchedEvent): Promise<void>;
    <TType extends string, TShape extends EventShape>(
      eventDefinition: FlowEventDefinition<TType, TShape>,
      ...args: EventPayloadArgs<TShape>
    ): Promise<void>;
  } = ((eventOrDefinition: TEvent | FlowEventDefinition<string, EventShape>, payload?: unknown) =>
    this.dispatch(eventOrDefinition as never, payload as never)) as {
    <TDispatchedEvent extends TEvent>(event: TDispatchedEvent): Promise<void>;
    <TType extends string, TShape extends EventShape>(
      eventDefinition: FlowEventDefinition<TType, TShape>,
      ...args: EventPayloadArgs<TShape>
    ): Promise<void>;
  };

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

  public async dispatch<TDispatchedEvent extends TEvent>(event: TDispatchedEvent): Promise<void>;
  public async dispatch<TType extends string, TShape extends EventShape>(
    eventDefinition: FlowEventDefinition<TType, TShape>,
    ...args: EventPayloadArgs<TShape>
  ): Promise<void>;
  public async dispatch(
    eventOrDefinition: TEvent | FlowEventDefinition<string, EventShape>,
    payload?: unknown,
  ): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const event = isFlowEventDefinition(eventOrDefinition)
      ? eventOrDefinition.create(payload as never)
      : eventOrDefinition;

    return await this.enqueueExternalDispatch(this.definition.validateEvent(event));
  }

  private enqueueExternalDispatch(event: TEvent): Promise<void> {
    const { completion, promise } = this.createDispatchCompletion();

    this.enqueueValidatedDispatch(event, completion);

    return promise;
  }

  private createDispatchCompletion(): {
    completion: IDispatchCompletion;
    promise: Promise<void>;
  } {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;

    const promise = new Promise<void>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });

    return {
      completion: {
        pendingCount: 0,
        settled: false,
        resolve,
        reject,
      },
      promise,
    };
  }

  private enqueueValidatedDispatch(event: TEvent, completion: IDispatchCompletion): void {
    completion.pendingCount += 1;
    this.queue.push({ event, completion });

    if (!this.isProcessing) {
      this.isProcessing = true;
      void this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    try {
      while (!this.isDestroyed && this.queue.length > 0) {
        const nextDispatch = this.queue.shift();

        if (!nextDispatch) {
          continue;
        }

        this.currentCompletion = nextDispatch.completion;

        try {
          await this.handleEvent(nextDispatch.event);
          this.resolveDispatchCompletion(nextDispatch.completion);
        } catch (error) {
          this.rejectDispatchCompletion(nextDispatch.completion, error);
        } finally {
          this.currentCompletion = undefined;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private resolveDispatchCompletion(completion: IDispatchCompletion): void {
    if (completion.settled) {
      return;
    }

    completion.pendingCount -= 1;

    if (completion.pendingCount === 0) {
      completion.settled = true;
      completion.resolve();
    }
  }

  private rejectDispatchCompletion(completion: IDispatchCompletion, error: unknown): void {
    if (completion.settled) {
      return;
    }

    completion.settled = true;
    completion.reject(error);
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    const queuedCompletions = new Set(this.queue.map(({ completion }) => completion));

    queuedCompletions.forEach((completion) => {
      if (!completion.settled) {
        completion.settled = true;
        completion.resolve();
      }
    });

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

    const dispatch: FlowApi<TContext, TEvent, TState>['dispatch'] = ((
      nextEventOrRegistration: TEvent | FlowEventDefinition<string, EventShape>,
      payload?: unknown,
    ) => {
      if (!assertActive()) {
        return Promise.resolve();
      }

      execution.active = false;

      const nextEvent = isFlowEventDefinition(nextEventOrRegistration)
        ? (nextEventOrRegistration.create(payload as never) as TEvent)
        : (nextEventOrRegistration as TEvent);

      if (this.isProcessing && this.currentCompletion) {
        this.enqueueValidatedDispatch(
          this.definition.validateEvent(nextEvent),
          this.currentCompletion,
        );
        return Promise.resolve();
      }

      return this.dispatch(nextEvent);
    }) as FlowApi<TContext, TEvent, TState>['dispatch'];

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
      dispatch,
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

export interface FlowBuilder<
  TContextSchema extends z.ZodTypeAny,
  TStates extends readonly [string, ...string[]],
  TAllEvents extends FlowEvent,
> extends FlowDefinition<z.infer<TContextSchema>, TAllEvents, FlowStateNames<TStates>> {
  step(name: FlowStateNames<TStates>): FlowBuilder<TContextSchema, TStates, TAllEvents>;
  step<TRegistrations extends StepRegistrationResult<FlowStateNames<TStates>>>(
    name: FlowStateNames<TStates>,
    register: (
      api: IStepRegistrar<z.infer<TContextSchema>, TAllEvents, FlowStateNames<TStates>>,
    ) => TRegistrations,
  ): FlowBuilder<TContextSchema, TStates, TAllEvents | StepEvents<TRegistrations>>;
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

function createInternalEventDefinition<const TType extends string, TShape extends EventShape>(
  type: TType,
  shape: TShape,
): InternalFlowEventDefinition<TType, TShape> {
  return {
    type,
    schema: createEventSchema(type, shape),
    create: (payload?: EventPayload<TShape>) =>
      ({
        type,
        ...(payload ?? {}),
      }) as EventFromShape<TType, TShape>,
  };
}

export function defineEvent<const TType extends string, TShape extends EventShape>(
  type: TType,
  shape: TShape,
): FlowEventDefinition<TType, TShape> {
  return createInternalEventDefinition(type, shape);
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

function isFlowEventDefinition(
  value: unknown,
): value is InternalFlowEventDefinition<string, EventShape> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'schema' in value &&
    'create' in value
  );
}

const EMPTY_EVENT_SHAPE = {} as EventShape;

function hasShapeFields<TShape extends EventShape>(shape: TShape): boolean {
  return Object.keys(shape).length > 0;
}

function createRequestStepEventRegistration<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  TType extends string,
  TShape extends EventShape,
>(
  on: IStepRegistrar<TContext, TAllEvents, TState>['on'],
  config: RequestStepTransitionConfig<TContext, TAllEvents, TState, TType, TShape>,
): EventRegistration<TState, TType, TShape, readonly TState[]> {
  const shape = (config.shape ?? EMPTY_EVENT_SHAPE) as TShape;
  const handler = (config.handle ??
    (({ goto }) => {
      if (config.target) {
        goto(normalizeTargets(config.target)[0] as TState);
      }
    })) as FlowHandler<
    TContext,
    TAllEvents | EventFromShape<TType, TShape>,
    TState,
    EventFromShape<TType, TShape>
  >;

  if (!config.target) {
    return on(createInternalEventDefinition(config.type, shape), handler) as EventRegistration<
      TState,
      TType,
      TShape,
      readonly TState[]
    >;
  }

  return (
    on as (
      eventDefinition: FlowEventDefinition<TType, TShape>,
      targets: FlowTransitionInput<TState, readonly TState[]>,
      eventHandler: FlowHandler<
        TContext,
        TAllEvents | EventFromShape<TType, TShape>,
        TState,
        EventFromShape<TType, TShape>
      >,
    ) => EventRegistration<TState, TType, TShape, readonly TState[]>
  )(createInternalEventDefinition(config.type, shape), config.target, handler);
}

export function requestStep<
  TContext,
  TAllEvents extends FlowEvent,
  TState extends string,
  const TSuccessType extends string,
  TSuccessShape extends EventShape,
  const TFailureType extends string,
  TFailureShape extends EventShape,
>(
  api: Pick<IStepRegistrar<TContext, TAllEvents, TState>, 'enter' | 'on'>,
  config: RequestStepConfig<
    TContext,
    TAllEvents,
    TState,
    TSuccessType,
    TSuccessShape,
    TFailureType,
    TFailureShape
  >,
): readonly [
  EnterRegistration<TState, readonly TState[]>,
  EventRegistration<TState, TSuccessType, TSuccessShape, readonly TState[]>,
  EventRegistration<TState, TFailureType, TFailureShape, readonly TState[]>,
] {
  const success = createRequestStepEventRegistration(api.on, config.success);
  const failure = createRequestStepEventRegistration(api.on, config.failure);
  const successShape = (config.success.shape ?? EMPTY_EVENT_SHAPE) as TSuccessShape;

  return [
    api.enter(async (enterApi) => {
      try {
        const successPayload = await config.run(enterApi);

        if (hasShapeFields(successShape) || typeof successPayload !== 'undefined') {
          await enterApi.dispatch(success, successPayload as EventPayload<TSuccessShape>);
        } else {
          await enterApi.dispatch(success, {} as EventPayload<TSuccessShape>);
        }
      } catch (error) {
        const failurePayload = await config.failure.mapError(error, enterApi);
        await enterApi.dispatch(failure, failurePayload);
      }
    }),
    success,
    failure,
  ] as const;
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

  const buildDefinition = <TAllEvents extends FlowEvent>(): FlowDefinition<
    TContext,
    TAllEvents,
    TState
  > => {
    if (!steps.has(config.initial)) {
      throw new Error(`Initial state "${config.initial}" must be defined before using the flow.`);
    }

    for (const state of config.states) {
      if (!steps.has(state)) {
        throw new Error(`State "${state}" must be defined before using the flow.`);
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
  };

  const createBuilder = <TAllEvents extends FlowEvent>(): FlowBuilder<
    TContextSchema,
    TStates,
    TAllEvents
  > => ({
    name: config.name,
    initial: config.initial,
    initialContext: config.initialContext,
    get transitions() {
      return buildDefinition<TAllEvents>().transitions;
    },
    createInstance(options?: FlowInstanceOptions) {
      return buildDefinition<TAllEvents>().createInstance(options);
    },
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
          eventOrType: string | FlowEventDefinition<string, EventShape>,
          shapeOrOptionsOrHandler:
            | EventShape
            | FlowTransitionInput<TState, readonly TState[]>
            | FlowHandler<TContext, FlowEvent, TState, FlowEvent>,
          optionsOrHandler?:
            | FlowTransitionInput<TState, readonly TState[]>
            | FlowHandler<TContext, FlowEvent, TState, FlowEvent>,
          maybeHandler?: FlowHandler<TContext, FlowEvent, TState, FlowEvent>,
        ) => {
          const eventDefinition =
            typeof eventOrType === 'string'
              ? createInternalEventDefinition(eventOrType, shapeOrOptionsOrHandler as EventShape)
              : (eventOrType as InternalFlowEventDefinition<string, EventShape>);
          const hasOptions =
            typeof eventOrType === 'string'
              ? typeof maybeHandler === 'function'
              : typeof optionsOrHandler === 'function';
          const handlerOrTargets =
            typeof eventOrType === 'string'
              ? optionsOrHandler
              : hasOptions
                ? shapeOrOptionsOrHandler
                : shapeOrOptionsOrHandler;
          const options = hasOptions ? handlerOrTargets : undefined;
          const handler =
            typeof eventOrType === 'string'
              ? hasOptions
                ? maybeHandler
                : handlerOrTargets
              : hasOptions
                ? optionsOrHandler
                : shapeOrOptionsOrHandler;

          return {
            kind: 'event',
            type: eventDefinition.type,
            schema: eventDefinition.schema,
            targets: normalizeTargets(options as FlowTransitionInput<TState, readonly TState[]>),
            handler,
            create: eventDefinition.create,
          } as EventRegistration<TState, string, EventShape, readonly TState[]>;
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
  });

  return createBuilder<never>();
}
