export type MediaData = {
    data: Buffer;
    mediaType: string;
};

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

export interface TwitterSpaceDecisionOptions {
    maxSpeakers?: number;
    topics?: string[];
    typicalDurationMinutes?: number;
    idleKickTimeoutMs?: number;
    minIntervalBetweenSpacesMinutes?: number;
    businessHoursOnly?: boolean;
    randomChance?: number;
    enableIdleMonitor?: boolean;
    enableSttTts?: boolean;
    enableRecording?: boolean;
    voiceId?: string;
    sttLanguage?: string;
    speakerMaxDurationMs?: number;
}

export interface ITranscriptionService extends Service {
    transcribeAttachment(audioBuffer: ArrayBuffer): Promise<string | null>;
    transcribeAttachmentLocally(
        audioBuffer: ArrayBuffer,
    ): Promise<string | null>;
    transcribe(audioBuffer: ArrayBuffer): Promise<string | null>;
    transcribeLocally(audioBuffer: ArrayBuffer): Promise<string | null>;
}


export type TemplateType = string | ((options: { state: State }) => string);

export enum ActionTimelineType {
    ForYou = "foryou",
    Following = "following",
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


export enum ServiceType {
    IMAGE_DESCRIPTION = "image_description",
    TRANSCRIPTION = "transcription",
    VIDEO = "video",
    TEXT_GENERATION = "text_generation",
    BROWSER = "browser",
    SPEECH_GENERATION = "speech_generation",
    PDF = "pdf",
    INTIFACE = "intiface",
    AWS_S3 = "aws_s3",
    BUTTPLUG = "buttplug",
    SLACK = "slack",
    VERIFIABLE_LOGGING = "verifiable_logging",
    IRYS = "irys",
    TEE_LOG = "tee_log",
    GOPLUS_SECURITY = "goplus_security",
    WEB_SEARCH = "web_search",
    EMAIL_AUTOMATION = "email_automation",
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
 * Status enum for goals
 */
export enum GoalStatus {
    DONE = "DONE",
    FAILED = "FAILED",
    IN_PROGRESS = "IN_PROGRESS",
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

export abstract class Service {
    private static instance: Service | null = null;

    static get serviceType(): ServiceType {
        throw new Error("Service must implement static serviceType getter");
    }

    public static getInstance<T extends Service>(): T {
        if (!Service.instance) {
            Service.instance = new (this as any)();
        }
        return Service.instance as T;
    }

    get serviceType(): ServiceType {
        return (this.constructor as typeof Service).serviceType;
    }

    // Add abstract initialize method that must be implemented by derived classes
    abstract initialize(runtime: any): Promise<void>;
}


/**
 * Callback function type for handlers
 */
export type HandlerCallback = (
    response: Content,
    files?: any,
) => Promise<Memory[]>;

export interface IImageDescriptionService extends Service {
    describeImage(
        imageUrl: string,
    ): Promise<{ title: string; description: string }>;
}

export interface ActionResponse {
    like: boolean;
    retweet: boolean;
    quote?: boolean;
    reply?: boolean;
}