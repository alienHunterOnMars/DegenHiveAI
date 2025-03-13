import type { Comment, PrivateMessage, Submission } from 'snoowrap';
import Snoowrap from 'snoowrap';
import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import { v4 as uuid } from 'uuid';
import { RedditMessageHandler } from './handlers/messageHandler';
import { RedditPostHandler } from './handlers/postHandler';
import { RedditConfig, RedditPost } from './types';

interface RedditComment {
    id: string;
    author: { name: string } | null;
    body: string;
    created_utc: number;
    score: number;
    replies?: RedditComment[];
}

interface RedditPostWithComments {
    title: string;
    author: string;
    created: string;
    url: string;
    ups: number;
    downs: number;
    score: number;
    comments: number;
    subreddit_subscribers: number;
    num_comments: number;
    selftext: string;
    commentsList: Array<{
        author: string;
        body: string;
        score: number;
        replies: Array<{
            author: string;
            body: string;
            score: number;
        }>;
    }>;
}

interface ExpandedPostData {
    comments: Array<{
        id: string;
        author: { name: string } | null;
        body: string;
        created_utc: number;
        score: number;
        replies?: Array<{
            id: string;
            author: { name: string } | null;
            body: string;
            created_utc: number;
            score: number;
        }>;
    }>;
}

export class RedditAdapter extends EventEmitter {
    private static readonly POLLING_INTERVAL = 60000; // 1 minute
    private static readonly SUBREDDIT_MONITOR_INTERVAL = 900000; // 15 minutes
    private static readonly REQUEST_DELAY = 2000; // 2 seconds between requests
    private static readonly SUBREDDIT_BATCH_DELAY = 30000; // 30 seconds between subreddit batches
    private static readonly MAX_ITEMS_PER_REQUEST = 20;
    private static readonly MAX_POSTS_PER_SUBREDDIT = 25;
    private static readonly MAX_COMMENTS_PER_POST = 50;
    private static readonly SUBREDDITS_PER_BATCH = 3; // Process 3 subreddits at a time
 

    private client: Snoowrap;
    
    private messageHandler: RedditMessageHandler;
    private postHandler: RedditPostHandler;
    private config: RedditConfig;
    private redisClient: RedisClient;
    private pollInterval!: NodeJS.Timeout;

    private isInitialized: boolean = false;
    private isShuttingDown: boolean = false;

    constructor(config: RedditConfig) {
        super();
        this.config = config;

        // Initialize Reddit client with conservative rate limits
        this.client = new Snoowrap({
            userAgent: config.userAgent,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            username: config.username,
            password: config.password
        });

        // Initialize Redis client
        this.redisClient = new RedisClient({ url: config.redis_url });

        // Initialize handlers
        this.messageHandler = new RedditMessageHandler(this.client);
        this.postHandler = new RedditPostHandler(this.client);

        // Configure client with conservative rate limits
        this.client.config({
            requestDelay: 2000, // 2 seconds between requests
            maxRetryAttempts: 3,
            continueAfterRatelimitError: true,
            retryErrorCodes: [502, 503, 504, 522],
            debug: process.env.NODE_ENV === 'development'
        });

        // Setup process event handlers
        if (process.send) {
            process.on('SIGTERM', async () => {
                await this.stop();
                process.exit(0);
            });

            process.on('SIGINT', async () => {
                await this.stop();
                process.exit(0);
            });

            process.on('uncaughtException', async (error) => {
                Logger.error('Uncaught exception in Reddit adapter:', error);
                await this.stop();
                process.exit(1);
            });

            process.on('unhandledRejection', async (error) => {
                Logger.error('Unhandled rejection in Reddit adapter:', error);
                await this.stop();
                process.exit(1);
            });
        }
    }
 
 
    private async publishToRedis(type: string, payload: any): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.INTERNAL, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'INTERNAL',
                destination: 'reddit',
                source: 'reddit',
                payload: {
                    type,
                    payload
                }
            });
            Logger.info('REDDIT :: Published to Redis:');
        } catch (error) {
            Logger.error('Error publishing Reddit post to Redis:', error);
        }
    }


    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Reddit Adapter :: Received Redis message:", {
                type: message.type,
                source: message.source,
                destination: message.destination,
                payloadType: message.payload?.type
            });

            if (message.type !== 'REDDIT' || !message.payload) {
                Logger.warn('Skipping invalid message format:', { message });
                return;
            }

            switch (message.payload.type) {
                // case 'post':
                //     Logger.info('Creating new Reddit post:', {
                //         subreddit: message.payload.subreddit,
                //         title: message.payload.title
                //     });
                //     await this.postHandler.submitPost({
                //         subreddit: message.payload.subreddit,
                //         title: message.payload.title || 'New Post',
                //         content: message.payload.text,
                //         type: 'text'
                //     });
                //     Logger.info('Successfully created Reddit post');
                //     await this.publishToRedis('post', "SUCCESS");
                //     break;


                case 'fetch_posts':
                    if (!message.payload.subreddit) {
                        Logger.error('Missing subreddit for fetch_posts');
                        return;
                    }
                    Logger.info('Fetching posts from subreddit:', {
                        subreddit: message.payload.subreddit
                    });
                    let posts = await this.testGetSubredditPosts(message.payload.subreddit);
                    await this.publishToRedis('fetch_posts', posts);
                    Logger.info('Successfully fetched posts');
                    break;

                default:
                    Logger.warn('Unknown message type:', message.payload.type);
            }
        } catch (error) {
            Logger.error('Error handling Redis message:', {
                error,
                messageType: message.payload?.type,
                source: message.source
            });
        }
    }

    private async processPost(post: Submission): Promise<RedditPostWithComments> {
        // Get comments directly from the post
        const comments = await post.comments.fetchAll();
        
        const formattedComments = comments.map((comment: any) => ({
            author: comment.author ? comment.author.name : '[deleted]',
            body: comment.body,
            score: comment.score,
            replies: comment.replies ? comment.replies.map((reply: Comment) => ({
                author: reply.author ? reply.author.name : '[deleted]',
                body: reply.body,
                score: reply.score
            })) : []
        }));
        
        return {
            title: post.title,
            author: post.author.name,
            created: new Date(post.created_utc * 1000).toISOString(),
            url: post.url,
            ups: post.ups,
            downs: post.downs,
            score: post.score,
            comments: post.num_comments,
            subreddit_subscribers: post.subreddit_subscribers,
            num_comments: post.num_comments,
            selftext: post.selftext,
            commentsList: formattedComments
        };
    }

    private async testGetSubredditPosts(subredditName: string) {
        try {
            Logger.info(`Fetching posts from r/${subredditName}...`);
            const subreddit = this.client.getSubreddit(subredditName);
            
            const newPosts = await subreddit.getNew({ limit: 5 });

            console

            const postsWithComments = await Promise.all(newPosts.map(post => this.processPost(post)));

            Logger.info('Posts with comments:', postsWithComments);
            return postsWithComments ;
    
        } catch (error) {
            Logger.error('Error fetching subreddit posts:', error);
        }
    }

    async start(): Promise<void> {
        if (this.isInitialized) {
            Logger.warn('Reddit adapter already initialized');
            return;
        }

        try {
            // Subscribe to Redis messages
            await this.redisClient.subscribe(REDIS_CHANNELS.REDDIT, 
                async (message: RedisMessage) => {
                    if (message.source !== 'reddit') {
                        await this.handleIncomingRedisMessage(message);
                    }
            });

            // Verify credentials
            const me = await Promise.resolve(this.client.getMe() as any);
            Logger.info(`Reddit bot logged in as u/${me.name}`);

            this.isInitialized = true;
            Logger.info('Reddit adapter started successfully');

            // Notify parent process that we're ready if running as a child process
            if (process.send) {
                process.send({ type: 'ready', service: 'reddit' });
            }
        } catch (error) {
            Logger.error('Failed to start Reddit adapter:', error);
            throw error;
        }
    }
 

    async stop(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        Logger.info('Stopping Reddit adapter...');

        try {
            // Clear any polling intervals
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
            }

            // Disconnect from Redis
            await this.redisClient.disconnect();
            
            Logger.info('Reddit adapter stopped successfully');
        } catch (error) {
            Logger.error('Error stopping Reddit adapter:', error);
            throw error;
        }
    }
 
 
} 