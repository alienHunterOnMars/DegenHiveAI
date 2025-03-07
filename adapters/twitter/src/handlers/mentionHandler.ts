import TwitterApi from 'twitter-api-v2';
import { Logger } from '@hiveai/utils';

export class MentionHandler {
    private client: TwitterApi;
    private readOnlyClient: TwitterApi;

    constructor(client: TwitterApi, readOnlyClient: TwitterApi) {
        this.client = client;
        this.readOnlyClient = readOnlyClient;
    }

    async getRecentMentions(limit: number = 10, sinceId?: string): Promise<any[]> {
        try {
            Logger.info('Fetching recent mentions:', { limit, sinceId });
            
            // Get the authenticated user's ID
            const me : any = await this.client.v2.me();
            
            // Prepare query parameters
            const params: any = {
                max_results: limit,
                'tweet.fields': 'created_at,referenced_tweets,in_reply_to_user_id',
                'user.fields': 'username,profile_image_url',
                expansions: 'author_id,referenced_tweets.id'
            };
            
            if (sinceId) {
                params.since_id = sinceId;
            }
            
            // Search for mentions
            const query = `@${me.screen_name}`;
            const result = await this.readOnlyClient.v2.search(query, params);
            
            const tweets = result.data.data || [];
            const users = result.data.includes?.users || [];
            
            return tweets.map((tweet: any) => {
                const author = users.find((user: any) => user.id === tweet.author_id);
                
                // Determine if this is a reply to another tweet
                let inReplyToTweetId: string | undefined;
                if (tweet.referenced_tweets) {
                    const replyRef = tweet.referenced_tweets.find((ref: any) => ref.type === 'replied_to');
                    if (replyRef) {
                        inReplyToTweetId = replyRef.id;
                    }
                }
                
                return {
                    id: tweet.id,
                    text: tweet.text,
                    authorId: tweet.author_id,
                    authorUsername: author?.username || 'unknown',
                    createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
                    inReplyToTweetId
                };
            });
        } catch (error) {
            Logger.error('Error fetching mentions:', error);
            return [];
        }
    }

    async replyToMention(mentionId: string, text: string): Promise<any> {
        try {
            Logger.info('Replying to mention:', { mentionId, text });
            const result = await this.client.v2.reply(text, mentionId);
            
            return {
                id: result.data.id,
                text: text,
                inReplyToTweetId: mentionId
            };
        } catch (error) {
            Logger.error('Error replying to mention:', error);
            throw error;
        }
    }

 

    async getMentionContext(mentionId: string): Promise<any> {
        try {
            Logger.info('Getting mention context:', { mentionId });
            
            // Get the mention tweet
            const mention = await this.readOnlyClient.v2.singleTweet(mentionId, {
                'tweet.fields': 'created_at,referenced_tweets,conversation_id',
                'user.fields': 'username,profile_image_url',
                expansions: 'author_id,referenced_tweets.id'
            });
            
            // If this is a reply, get the original tweet
            let originalTweet = null;
            if (mention.data.referenced_tweets) {
                const replyRef = mention.data.referenced_tweets.find((ref: any) => ref.type === 'replied_to');
                if (replyRef) {
                    originalTweet = await this.readOnlyClient.v2.singleTweet(replyRef.id, {
                        'tweet.fields': 'created_at,text',
                        'user.fields': 'username',
                        expansions: 'author_id'
                    });
                }
            }
            
            // Get conversation context (other replies in the thread)
            let conversationTweets : any = [];
            if (mention.data.conversation_id) {
                const query = `conversation_id:${mention.data.conversation_id}`;
                const conversation = await this.readOnlyClient.v2.search(query, {
                    max_results: 10,
                    'tweet.fields': 'created_at,referenced_tweets',
                    'user.fields': 'username',
                    expansions: 'author_id'
                });
                
                conversationTweets = conversation.data.data || [];
            }
            
            return {
                mention: mention.data,
                originalTweet: originalTweet?.data,
                conversation: conversationTweets
            };
        } catch (error) {
            Logger.error('Error getting mention context:', error);
            return null;
        }
    }
} 