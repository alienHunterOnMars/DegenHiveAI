import { Logger } from "./logger";
import { getModelSettings, getEndpoint, models } from "./models";
import { ModelClass, ModelProviderName, TokenizerType, IVerifiableInferenceAdapter, VerifiableInferenceOptions, TelemetrySettings } from "./types";
import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    type CoreTool,
    type GenerateObjectResult,
    type StepResult as AIStepResult,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { encodingForModel, type TiktokenModel } from "js-tiktoken";
import { AutoTokenizer } from "@huggingface/transformers";
import Together from "together-ai";
import settings from "./settings";
import {
    parseBooleanFromText,
    parseJsonArrayFromText,
    parseJSONObjectFromText,
    parseShouldRespondFromText,
    parseActionResponseFromText,
} from "./parsing";
import type { ZodSchema } from "zod";

const jsonBlockPattern = /```json\n([\s\S]*?)\n```/;
type StepResult = AIStepResult<any>;


/**
 * Configuration options for generating objects with a model.
 */
export interface GenerationOptions {
    runtime: any;
    context: string;
    modelClass: ModelClass;
    schema?: ZodSchema;
    schemaName?: string;
    schemaDescription?: string;
    stop?: string[];
    mode?: "auto" | "json" | "tool";
    experimental_providerMetadata?: Record<string, unknown>;
    verifiableInference?: boolean;
    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    verifiableInferenceOptions?: VerifiableInferenceOptions;
}

/**
 * Base settings for model generation.
 */
interface ModelSettings {
    prompt: string;
    temperature: number;
    maxTokens: number;
    frequencyPenalty: number;
    presencePenalty: number;
    stop?: string[];
    experimental_telemetry?: TelemetrySettings;
}

/**
 * Interface for provider-specific generation options.
 */
interface ProviderOptions {
    runtime: any;
    provider: ModelProviderName;
    model: any;
    apiKey: string;
    schema?: ZodSchema;
    schemaName?: string;
    schemaDescription?: string;
    mode?: "auto" | "json" | "tool";
    experimental_providerMetadata?: Record<string, unknown>;
    modelOptions: ModelSettings;
    modelClass: ModelClass;
    context: string;
    verifiableInference?: boolean;
    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    verifiableInferenceOptions?: VerifiableInferenceOptions;
}




/**
 * Trims the provided text context to a specified token limit using a tokenizer model and type.
 *
 * The function dynamically determines the truncation method based on the tokenizer settings
 * provided by the runtime. If no tokenizer settings are defined, it defaults to using the
 * TikToken truncation method with the "gpt-4o" model.
 *
 * @async
 * @function trimTokens
 * @param {string} context - The text to be tokenized and trimmed.
 * @param {number} maxTokens - The maximum number of tokens allowed after truncation.
 * @param {any} runtime - The runtime interface providing tokenizer settings.
 *
 * @returns {Promise<string>} A promise that resolves to the trimmed text.
 *
 * @throws {Error} Throws an error if the runtime settings are invalid or missing required fields.
 *
 * @example
 * const trimmedText = await trimTokens("This is an example text", 50, runtime);
 * console.log(trimmedText); // Output will be a truncated version of the input text.
 */
export async function trimTokens(
    context: string,
    maxTokens: number,
    runtime: any
) {
    if (!context) return "";
    if (maxTokens <= 0) throw new Error("maxTokens must be positive");

    const tokenizerModel = runtime.getSetting("TOKENIZER_MODEL");
    const tokenizerType = runtime.getSetting("TOKENIZER_TYPE");

    if (!tokenizerModel || !tokenizerType) {
        // Default to TikToken truncation using the "gpt-4o" model if tokenizer settings are not defined
        return truncateTiktoken("gpt-4o", context, maxTokens);
    }

    // Choose the truncation method based on tokenizer type
    if (tokenizerType === TokenizerType.Auto) {
        return truncateAuto(tokenizerModel, context, maxTokens);
    }

    if (tokenizerType === TokenizerType.TikToken) {
        return truncateTiktoken(
            tokenizerModel as TiktokenModel,
            context,
            maxTokens
        );
    }

    Logger.warn(`Unsupported tokenizer type: ${tokenizerType}`);
    return truncateTiktoken("gpt-4o", context, maxTokens);
}

async function truncateAuto(
    modelPath: string,
    context: string,
    maxTokens: number
) {
    try {
        const tokenizer = await AutoTokenizer.from_pretrained(modelPath);
        const tokens = tokenizer.encode(context);

        // If already within limits, return unchanged
        if (tokens.length <= maxTokens) {
            return context;
        }

        // Keep the most recent tokens by slicing from the end
        const truncatedTokens = tokens.slice(-maxTokens);

        // Decode back to text - js-tiktoken decode() returns a string directly
        return tokenizer.decode(truncatedTokens);
    } catch (error) {
        Logger.error("Error in trimTokens:", error);
        // Return truncated string if tokenization fails
        return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
    }
}

async function truncateTiktoken(
    model: TiktokenModel,
    context: string,
    maxTokens: number
) {
    try {
        const encoding = encodingForModel(model);

        // Encode the text into tokens
        const tokens = encoding.encode(context);

        // If already within limits, return unchanged
        if (tokens.length <= maxTokens) {
            return context;
        }

        // Keep the most recent tokens by slicing from the end
        const truncatedTokens = tokens.slice(-maxTokens);

        // Decode back to text - js-tiktoken decode() returns a string directly
        return encoding.decode(truncatedTokens);
    } catch (error) {
        Logger.error("Error in trimTokens:", error);
        // Return truncated string if tokenization fails
        return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
    }
}


/**
 * Handles AI generation based on the specified provider.
 *
 * @param {ProviderOptions} options - Configuration options specific to the provider.
 * @returns {Promise<any[]>} - A promise that resolves to an array of generated objects.
 */
export async function handleProvider(
    options: ProviderOptions
): Promise<GenerateObjectResult<unknown>> {
    const {
        provider,
        runtime,
        context,
        modelClass,
        //verifiableInference,
        //verifiableInferenceAdapter,
        //verifiableInferenceOptions,
    } = options;
    switch (provider) {
        case ModelProviderName.OPENAI:
        // case ModelProviderName.ETERNALAI:
        // case ModelProviderName.ALI_BAILIAN:
        // case ModelProviderName.VOLENGINE:
        // case ModelProviderName.LLAMACLOUD:
        // case ModelProviderName.TOGETHER:
        // case ModelProviderName.NANOGPT:
        // case ModelProviderName.AKASH_CHAT_API:
        // case ModelProviderName.LMSTUDIO:
        //     return await handleOpenAI(options);
        // case ModelProviderName.ANTHROPIC:
        // case ModelProviderName.CLAUDE_VERTEX:
        //     return await handleAnthropic(options);
        // case ModelProviderName.GROK:
        //     return await handleGrok(options);
        // case ModelProviderName.GROQ:
        //     return await handleGroq(options);
        // case ModelProviderName.LLAMALOCAL:
            return await generateObjectDeprecated({
                runtime,
                context,
                modelClass,
            });
        // case ModelProviderName.GOOGLE:
        //     return await handleGoogle(options);
        // case ModelProviderName.MISTRAL:
        //     return await handleMistral(options);
        // case ModelProviderName.REDPILL:
        //     return await handleRedPill(options);
        // case ModelProviderName.OPENROUTER:
        //     return await handleOpenRouter(options);
        // case ModelProviderName.OLLAMA:
        //     return await handleOllama(options);
        case ModelProviderName.DEEPSEEK:
            return await handleDeepSeek(options);
        // case ModelProviderName.LIVEPEER:
        //     return await handleLivepeer(options);
        default: {
            const errorMessage = `Unsupported provider: ${provider}`;
            Logger.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
}


export async function generateObjectDeprecated({
    runtime,
    context,
    modelClass,
}: {
    runtime: any;
    context: string;
    modelClass: ModelClass;
}): Promise<any> {
    if (!context) {
        Logger.error("generateObjectDeprecated context is empty");
        return null;
    }
    let retryDelay = 1000;

    while (true) {
        try {
            // this is slightly different than generateObjectArray, in that we parse object, not object array
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });
            const parsedResponse = parseJSONObjectFromText(response);
            if (parsedResponse) {
                return parsedResponse;
            }
        } catch (error) {
            Logger.error("Error in generateObject:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}


/**
 * Handles object generation for DeepSeek models.
 *
 * @param {ProviderOptions} options - Options specific to DeepSeek.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleDeepSeek({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
}: ProviderOptions): Promise<any> {
    const openai = createOpenAI({ apiKey, baseURL: models.deepseek.endpoint });
    
    // @ts-ignore - Bypass deep type instantiation error
    return await aiGenerateObject({
        model: (openai.languageModel(model) as any),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}




/**
 * Send a message to the model for a text generateText - receive a string back and parse how you'd like
 * @param opts - The options for the generateText request.
 * @param opts.context The context of the message to be completed.
 * @param opts.stop A list of strings to stop the generateText at.
 * @param opts.model The model to use for generateText.
 * @param opts.frequency_penalty The frequency penalty to apply to the generateText.
 * @param opts.presence_penalty The presence penalty to apply to the generateText.
 * @param opts.temperature The temperature to apply to the generateText.
 * @param opts.max_context_length The maximum length of the context to apply to the generateText.
 * @returns The completed message.
 */

export async function generateText({
    runtime,
    context,
    modelClass,
    tools = {},
    onStepFinish,
    maxSteps = 1,
    stop,
    customSystemPrompt,
    verifiableInference = process.env.VERIFIABLE_INFERENCE_ENABLED === "true",
    verifiableInferenceOptions,
}: {
    runtime: any;
    context: string;
    modelClass: ModelClass;
    tools?: Record<string, any>;
    onStepFinish?: (event: StepResult) => Promise<void> | void;
    maxSteps?: number;
    stop?: string[];
    customSystemPrompt?: string;
    verifiableInference?: boolean;
    verifiableInferenceAdapter?: any;
    verifiableInferenceOptions?: any;
}): Promise<string> {
    if (!context) {
        console.error("generateText context is empty");
        return "";
    }

    Logger.log("Generating text...");

    Logger.info("Generating text with options:", {
        modelProvider: runtime.modelProvider,
        model: modelClass,
        verifiableInference,
    });
    Logger.log("Using provider:", runtime.modelProvider);
    // If verifiable inference is requested and adapter is provided, use it
    if (verifiableInference && runtime.verifiableInferenceAdapter) {
        Logger.log(
            "Using verifiable inference adapter:",
            runtime.verifiableInferenceAdapter
        );
        try {
            const result: any =
                await runtime.verifiableInferenceAdapter.generateText(
                    context,
                    modelClass,
                    verifiableInferenceOptions
                );
            Logger.log("Verifiable inference result:", result);
            // Verify the proof
            const isValid =
                await runtime.verifiableInferenceAdapter.verifyProof(result);
            if (!isValid) {
                throw new Error("Failed to verify inference proof");
            }

            return result.text;
        } catch (error) {
            Logger.error("Error in verifiable inference:", error);
            throw error;
        }
    }

    const provider = (runtime.modelProvider as ModelProviderName);
    Logger.debug("Provider settings:", {
        provider,
        hasRuntime: !!runtime,
        runtimeSettings: {
            CLOUDFLARE_GW_ENABLED: runtime.getSetting("CLOUDFLARE_GW_ENABLED"),
            CLOUDFLARE_AI_ACCOUNT_ID: runtime.getSetting(
                "CLOUDFLARE_AI_ACCOUNT_ID"
            ),
            CLOUDFLARE_AI_GATEWAY_ID: runtime.getSetting(
                "CLOUDFLARE_AI_GATEWAY_ID"
            ),
        },
    });

    const endpoint =
        runtime.character.modelEndpointOverride || getEndpoint(provider);
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    let model = modelSettings.name;

    // allow character.json settings => secrets to override models
    // FIXME: add MODEL_MEDIUM support
    switch (provider) {
        // if runtime.getSetting("LLAMACLOUD_MODEL_LARGE") is true and modelProvider is LLAMACLOUD, then use the large model
        case ModelProviderName.LLAMACLOUD:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("LLAMACLOUD_MODEL_LARGE") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("LLAMACLOUD_MODEL_SMALL") ||
                                model;
                        }
                        break;
                }
            }
            break;
        case ModelProviderName.TOGETHER:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("TOGETHER_MODEL_LARGE") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("TOGETHER_MODEL_SMALL") ||
                                model;
                        }
                        break;
                }
            }
            break;
        case ModelProviderName.OPENROUTER:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("LARGE_OPENROUTER_MODEL") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("SMALL_OPENROUTER_MODEL") ||
                                model;
                        }
                        break;
                }
            }
            break;
    }

    Logger.info("Selected model:", model);

    const modelConfiguration = runtime.character?.settings?.modelConfig;
    const temperature =
        modelConfiguration?.temperature || modelSettings.temperature;
    const frequency_penalty =
        modelConfiguration?.frequency_penalty ||
        modelSettings.frequency_penalty;
    const presence_penalty =
        modelConfiguration?.presence_penalty || modelSettings.presence_penalty;
    const max_context_length =
        modelConfiguration?.maxInputTokens || modelSettings.maxInputTokens;
    const max_response_length =
        modelConfiguration?.max_response_length ||
        modelSettings.maxOutputTokens;
    const experimental_telemetry =
        modelConfiguration?.experimental_telemetry ||
        modelSettings.experimental_telemetry;

    const apiKey = runtime.token;

    try {
        Logger.debug(
            `Trimming context to max length of ${max_context_length} tokens.`
        );

        context = await trimTokens(context, max_context_length, runtime);

        let response: string;

        const _stop = stop || modelSettings.stop;
        Logger.debug(
            `Using provider: ${provider}, model: ${model}, temperature: ${temperature}, max response length: ${max_response_length}`
        );

        switch (provider) {
            // case ModelProviderName.ATOMA: {
            //     Logger.debug("Initializing Atoma model.");
            //     const atoma = createOpenAI({
            //         apiKey,
            //         baseURL: endpoint,
            //         fetch: runtime.fetch,
            //     });

            //     const { text: atomaResponse } = await aiGenerateText({
            //         model: atoma.languageModel(model),
            //         prompt: context,
            //         system:
            //             runtime.character.system ??
            //             settings.SYSTEM_PROMPT ??
            //             undefined,
            //         tools: tools,
            //         onStepFinish: onStepFinish,
            //         maxSteps: maxSteps,
            //         temperature: temperature,
            //         maxTokens: max_response_length,
            //         frequencyPenalty: frequency_penalty,
            //         presencePenalty: presence_penalty,
            //         experimental_telemetry: experimental_telemetry,
            //     });

            case ModelProviderName.DEEPSEEK: {
                Logger.debug("Initializing Deepseek model.");
                const apiKeyValue: string | undefined = apiKey || undefined;
                const serverUrl = models[provider].endpoint;
                const deepseek = createOpenAI({
                    apiKey: apiKeyValue,
                    baseURL: serverUrl,
                    fetch: (runtime.fetch ?? undefined) as ((input: string | URL | Request, init?: RequestInit) => Promise<Response>) | undefined
                });

                const { text: deepseekResponse } = await aiGenerateText({
                    model: deepseek.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = deepseekResponse;
                Logger.debug("Received response from Deepseek model.");
                break;
            }

    

            default: {
                const errorMessage = `Unsupported provider: ${provider}`;
                Logger.error(errorMessage);
                throw new Error(errorMessage);
            }
        }

        return response;
    } catch (error) {
        Logger.error("Error in generateText:", error);
        throw error;
    }
}















export async function generateObjectArray({
    runtime,
    context,
    modelClass,
}: {
    runtime: any;
    context: string;
    modelClass: ModelClass;
}): Promise<any[]> {
    if (!context) {
        Logger.error("generateObjectArray context is empty");
        return [];
    }
    let retryDelay = 1000;

    while (true) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseJsonArrayFromText(response);
            if (parsedResponse) {
                return parsedResponse;
            }
        } catch (error) {
            Logger.error("Error in generateTextArray:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}



 


/**
 * Sends a message to the model and parses the response as a boolean value
 * @param opts - The options for the generateText request
 * @param opts.context The context to evaluate for the boolean response
 * @param opts.stop A list of strings to stop the generateText at
 * @param opts.model The model to use for generateText
 * @param opts.frequency_penalty The frequency penalty to apply (0.0 to 2.0)
 * @param opts.presence_penalty The presence penalty to apply (0.0 to 2.0)
 * @param opts.temperature The temperature to control randomness (0.0 to 2.0)
 * @param opts.serverUrl The URL of the API server
 * @param opts.max_context_length Maximum allowed context length in tokens
 * @param opts.max_response_length Maximum allowed response length in tokens
 * @returns Promise resolving to a boolean value parsed from the model's response
 */
export async function generateTrueOrFalse({
    runtime,
    context = "",
    modelClass,
}: {
    runtime: any;
    context: string;
    modelClass: ModelClass;
}): Promise<boolean> {
    let retryDelay = 1000;
    const modelSettings: any = getModelSettings(runtime.modelProvider, modelClass);
    const stop = Array.from(
        new Set([...(modelSettings.stop || []), ["\n"]])
    ) as string[];

    while (true) {
        try {
            const response = await generateText({
                stop,
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseBooleanFromText(response.trim());
            if (parsedResponse !== null) {
                return parsedResponse;
            }
        } catch (error) {
            Logger.error("Error in generateTrueOrFalse:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}

/**
 * Generates structured objects from a prompt using specified AI models and configuration options.
 *
 * @param {GenerationOptions} options - Configuration options for generating objects.
 * @returns {Promise<any[]>} - A promise that resolves to an array of generated objects.
 * @throws {Error} - Throws an error if the provider is unsupported or if generation fails.
 */
export const generateObject = async ({
    runtime,
    context,
    modelClass,
    schema,
    schemaName,
    schemaDescription,
    stop,
    mode = "json",
    verifiableInference = false,
    verifiableInferenceAdapter,
    verifiableInferenceOptions,
}: GenerationOptions): Promise<GenerateObjectResult<unknown>> => {
    if (!context) {
        const errorMessage = "generateObject context is empty";
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    const model = modelSettings.name;
    const temperature = modelSettings.temperature;
    const frequency_penalty = modelSettings.frequency_penalty;
    const presence_penalty = modelSettings.presence_penalty;
    const max_context_length = modelSettings.maxInputTokens;
    const max_response_length = modelSettings.maxOutputTokens;
    const experimental_telemetry = modelSettings.experimental_telemetry;
    const apiKey = runtime.token;

    try {
        context = await trimTokens(context, max_context_length, runtime);

        const modelOptions: ModelSettings = {
            prompt: context,
            temperature,
            maxTokens: max_response_length,
            frequencyPenalty: frequency_penalty ?? 0,
            presencePenalty: presence_penalty ?? 0,
            stop: stop || modelSettings.stop,
            experimental_telemetry: experimental_telemetry,
        };

        const response = await handleProvider({
            provider,
            model,
            apiKey: apiKey ?? "",
            schema,
            schemaName,
            schemaDescription,
            mode,
            modelOptions,
            runtime,
            context,
            modelClass,
            verifiableInference,
            verifiableInferenceAdapter,
            verifiableInferenceOptions,
        });

        return response;
    } catch (error) {
        console.error("Error in generateObject:", error);
        throw error;
    }
};
