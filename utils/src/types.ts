/**
 * Represents an actor/participant in a conversation
 */
export interface Actor {
    /** Display name */
    name: string;

    /** Username/handle */
    username: string;

    /** Additional profile details */
    details: {
        /** Short profile tagline */
        tagline: string;

        /** Longer profile summary */
        summary: string;

        /** Favorite quote */
        quote: string;
    };

    /** Unique identifier */
    id: UUID;
}


/**
 * Model size/type classification
 */
export enum ModelClass {
    SMALL = "small",
    MEDIUM = "medium",
    LARGE = "large",
    EMBEDDING = "embedding",
    IMAGE = "image",
}

/**
 * Available model providers
 */
export enum ModelProviderName {
    OPENAI = "openai",
    ETERNALAI = "eternalai",
    ANTHROPIC = "anthropic",
    GROK = "grok",
    GROQ = "groq",
    LLAMACLOUD = "llama_cloud",
    TOGETHER = "together",
    LLAMALOCAL = "llama_local",
    LMSTUDIO = "lmstudio",
    GOOGLE = "google",
    MISTRAL = "mistral",
    CLAUDE_VERTEX = "claude_vertex",
    REDPILL = "redpill",
    OPENROUTER = "openrouter",
    OLLAMA = "ollama",
    HEURIST = "heurist",
    GALADRIEL = "galadriel",
    FAL = "falai",
    GAIANET = "gaianet",
    ALI_BAILIAN = "ali_bailian",
    VOLENGINE = "volengine",
    NANOGPT = "nanogpt",
    HYPERBOLIC = "hyperbolic",
    VENICE = "venice",
    NVIDIA = "nvidia",
    NINETEEN_AI = "nineteen_ai",
    AKASH_CHAT_API = "akash_chat_api",
    LIVEPEER = "livepeer",
    LETZAI = "letzai",
    DEEPSEEK = "deepseek",
    INFERA = "infera",
    BEDROCK = "bedrock",
    ATOMA = "atoma",
}


/**
 * Represents a single objective within a goal
 */
export interface Objective {
    /** Optional unique identifier */
    id?: string;

    /** Description of what needs to be achieved */
    description: string;

    /** Whether objective is completed */
    completed: boolean;
}

/**
 * Status enum for goals
 */
export enum GoalStatus {
    DONE = "DONE",
    FAILED = "FAILED",
    IN_PROGRESS = "IN_PROGRESS",
}


/**
 * Represents a high-level goal composed of objectives
 */
export interface Goal {
    /** Optional unique identifier */
    id?: UUID;

    /** Room ID where goal exists */
    roomId: UUID;

    /** User ID of goal owner */
    userId: UUID;

    /** Name/title of the goal */
    name: string;

    /** Current status */
    status: GoalStatus;

    /** Component objectives */
    objectives: Objective[];
}

/**
 * Represents the current state/context of a conversation
 */
export interface State {
    /** ID of user who sent current message */
    userId?: UUID;

    /** ID of agent in conversation */
    agentId?: UUID;

    /** Agent's biography */
    bio: string;

    /** Agent's background lore */
    lore: string;

    /** Message handling directions */
    messageDirections: string;

    /** Post handling directions */
    postDirections: string;

    /** Current room/conversation ID */
    roomId: UUID;

    /** Optional agent name */
    agentName?: string;

    /** Optional message sender name */
    senderName?: string;

    /** String representation of conversation actors */
    actors: string;

    /** Optional array of actor objects */
    actorsData?: Actor[];

    /** Optional string representation of goals */
    goals?: string;

    /** Optional array of goal objects */
    goalsData?: Goal[];

    /** Recent message history as string */
    recentMessages: string;

    /** Recent message objects */
    recentMessagesData: Memory[];

    /** Optional valid action names */
    actionNames?: string;

    /** Optional action descriptions */
    actions?: string;

    /** Optional action objects */
    actionsData?: Action[];

    /** Optional action examples */
    actionExamples?: string;

    /** Optional provider descriptions */
    providers?: string;

    /** Optional response content */
    responseData?: Content;

    /** Optional recent interaction objects */
    recentInteractionsData?: Memory[];

    /** Optional recent interactions string */
    recentInteractions?: string;

    /** Optional formatted conversation */
    formattedConversation?: string;

    /** Optional formatted knowledge */
    knowledge?: string;
    /** Optional knowledge data */
    knowledgeData?: KnowledgeItem[];
    /** Optional knowledge data */
    ragKnowledgeData?: RAGKnowledgeItem[];

    /** Additional dynamic properties */
    [key: string]: unknown;
}

/**
 * Represents an action the agent can perform
 */
export interface Action {
    /** Similar action descriptions */
    similes: string[];

    /** Detailed description */
    description: string;

    /** Example usages */
    examples: ActionExample[][];

    /** Handler function */
    handler: Handler;

    /** Action name */
    name: string;

    /** Validation function */
    validate: Validator;

    /** Whether to suppress the initial message when this action is used */
    suppressInitialMessage?: boolean;
}


/**
 * Handler function type for processing messages
 */
export type Handler = (
    runtime: any,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
) => Promise<unknown>;


/**
 * Callback function type for handlers
 */
export type HandlerCallback = (
    response: Content,
    files?: any,
) => Promise<Memory[]>;

/**
 * Validator function type for actions/evaluators
 */
export type Validator = (
    runtime: any,
    message: Memory,
    state?: State,
) => Promise<boolean>;

/**
 * Example content with associated user for demonstration purposes
 */
export interface ActionExample {
    /** User associated with the example */
    user: string;

    /** Content of the example */
    content: Content;
}

export type KnowledgeItem = {
    id: UUID;
    content: Content;
};

export interface RAGKnowledgeItem {
    id: UUID;
    agentId: UUID;
    content: {
        text: string;
        metadata?: {
            isMain?: boolean;
            isChunk?: boolean;
            originalId?: UUID;
            chunkIndex?: number;
            source?: string;
            type?: string;
            isShared?: boolean;
            [key: string]: unknown;
        };
    };
    embedding?: Float32Array;
    createdAt?: number;
    similarity?: number;
    score?: number;
}


/**
 * Represents a stored memory/message
 */
export interface Memory {
    /** Optional unique identifier */
    id?: UUID;

    /** Associated user ID */
    userId: UUID;

    /** Associated agent ID */
    agentId: UUID;

    /** Optional creation timestamp */
    createdAt?: number;

    /** Memory content */
    content: Content;

    /** Optional embedding vector */
    embedding?: number[];

    /** Associated room ID */
    roomId: UUID;

    /** Whether memory is unique */
    unique?: boolean;

    /** Embedding similarity score */
    similarity?: number;
}

export enum CacheStore {
    REDIS = "redis",
    DATABASE = "database",
    FILESYSTEM = "filesystem",
}


export interface ICacheManager {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
    delete(key: string): Promise<void>;
}

export type CacheOptions = {
    expires?: number;
};

/**
 * Represents a UUID string in the format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Represents the content of a message or communication
 */
export interface Content {
    /** The main text content */
    text: string;

    /** Optional action associated with the message */
    action?: string;

    /** Optional source/origin of the content */
    source?: string;

    /** URL of the original message/post (e.g. tweet URL, Discord message link) */
    url?: string;

    /** UUID of parent message if this is a reply/thread */
    inReplyTo?: UUID;

    /** Array of media attachments */
    attachments?: Media[];

    /** Additional dynamic properties */
    [key: string]: unknown;
}

/**
 * Represents a media attachment
 */
export type Media = {
    /** Unique identifier */
    id: string;

    /** Media URL */
    url: string;

    /** Media title */
    title: string;

    /** Media source */
    source: string;

    /** Media description */
    description: string;

    /** Text content */
    text: string;

    /** Content type */
    contentType?: string;
};


/** Image model settings */
export type ImageModelSettings = {
    name: string;
    steps?: number;
};

/** Embedding model settings */
export type EmbeddingModelSettings = {
    name: string;
    dimensions?: number;
};


export type TelemetrySettings = {
    /**
     * Enable or disable telemetry. Disabled by default while experimental.
     */
    isEnabled?: boolean;
    /**
     * Enable or disable input recording. Enabled by default.
     *
     * You might want to disable input recording to avoid recording sensitive
     * information, to reduce data transfers, or to increase performance.
     */
    recordInputs?: boolean;
    /**
     * Enable or disable output recording. Enabled by default.
     *
     * You might want to disable output recording to avoid recording sensitive
     * information, to reduce data transfers, or to increase performance.
     */
    recordOutputs?: boolean;
    /**
     * Identifier for this function. Used to group telemetry data by function.
     */
    functionId?: string;
};

/**
 * Model settings
 */
export type ModelSettings = {
    /** Model name */
    name: string;

    /** Maximum input tokens */
    maxInputTokens: number;

    /** Maximum output tokens */
    maxOutputTokens: number;

    /** Optional frequency penalty */
    frequency_penalty?: number;

    /** Optional presence penalty */
    presence_penalty?: number;

    /** Optional repetition penalty */
    repetition_penalty?: number;

    /** Stop sequences */
    stop: string[];

    /** Temperature setting */
    temperature: number;

    /** Optional telemetry configuration (experimental) */
    experimental_telemetry?: TelemetrySettings;
};

/**
 * Configuration for an AI model
 */
export type Model = {
    /** Optional API endpoint */
    endpoint?: string;

    /** Model names by size class */
    model: {
        [ModelClass.SMALL]?: ModelSettings;
        [ModelClass.MEDIUM]?: ModelSettings;
        [ModelClass.LARGE]?: ModelSettings;
        [ModelClass.EMBEDDING]?: EmbeddingModelSettings;
        [ModelClass.IMAGE]?: ImageModelSettings;
    };
};

/**
 * Available verifiable inference providers
 */
export enum VerifiableInferenceProvider {
    RECLAIM = "reclaim",
    OPACITY = "opacity",
    PRIMUS = "primus",
}


/**
 * Options for verifiable inference
 */
export interface VerifiableInferenceOptions {
    /** Custom endpoint URL */
    endpoint?: string;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Provider-specific options */
    providerOptions?: Record<string, unknown>;
}

/**
 * Result of a verifiable inference request
 */
export interface VerifiableInferenceResult {
    /** Generated text */
    text: string;
    /** Proof */
    proof: any;
    /** Proof id */
    id?: string;
    /** Provider information */
    provider: VerifiableInferenceProvider;
    /** Timestamp */
    timestamp: number;
}


/**
 * Interface for verifiable inference adapters
 */
export interface IVerifiableInferenceAdapter {
   options: any;
   /**
    * Generate text with verifiable proof
    * @param context The input text/prompt
    * @param modelClass The model class/name to use
    * @param options Additional provider-specific options
    * @returns Promise containing the generated text and proof data
    */
   generateText(
       context: string,
       modelClass: string,
       options?: VerifiableInferenceOptions,
   ): Promise<VerifiableInferenceResult>;

   /**
    * Verify the proof of a generated response
    * @param result The result containing response and proof to verify
    * @returns Promise indicating if the proof is valid
    */
   verifyProof(result: VerifiableInferenceResult): Promise<boolean>;
}

/**
 * Model configurations by provider
 */
export type Models = {
    [ModelProviderName.OPENAI]: Model;
    [ModelProviderName.GOOGLE]: Model;
    [ModelProviderName.MISTRAL]: Model;
    [ModelProviderName.DEEPSEEK]: Model;
    [ModelProviderName.ATOMA]: Model;
};

export interface ActionResponse {
    like: boolean;
    retweet: boolean;
    quote?: boolean;
    reply?: boolean;
}

export enum TokenizerType {
    Auto = "auto",
    TikToken = "tiktoken",
}
 