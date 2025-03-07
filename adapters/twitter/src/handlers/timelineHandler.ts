import TwitterApi from 'twitter-api-v2';
import { Logger } from '@hiveai/utils';

export class TimelineHandler {
    private client: TwitterApi;

    constructor(client: TwitterApi) {
        this.client = client;
    }

    async getUserTimeline(username: string, limit: number = 10, sinceId?: string): Promise<any[]> {
        try {
            Logger.info('Fetching user timeline:', { username, limit });
            
            // First get the user ID from username
            const user = await this.client.v2.userByUsername(username);
            if (!user.data) {
                throw new Error(`User not found: ${username}`);
            }
            
            const userId = user.data.id;
            
            // Prepare query parameters
            const params: any = {
                max_results: limit,
                'tweet.fields': 'created_at,public_metrics,referenced_tweets',
                'user.fields': 'username,profile_image_url',
                expansions: 'author_id'
            };
            
            if (sinceId) {
                params.since_id = sinceId;
            }
            
            // Get user timeline
            const timeline = await this.client.v2.userTimeline(userId, params);
            const tweets = timeline.data.data || [];
            const users = timeline.data.includes?.users || [];
            
            // Format the response
            return tweets.map((tweet: any) => {
                const author = users.find((user: any) => user.id === tweet.author_id);
                
                return {
                    id: tweet.id,
                    text: tweet.text,
                    authorId: tweet.author_id,
                    authorUsername: author?.username || 'unknown',
                    createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
                    metrics: tweet.public_metrics ? {
                        retweets: tweet.public_metrics.retweet_count,
                        replies: tweet.public_metrics.reply_count,
                        likes: tweet.public_metrics.like_count,
                        quotes: tweet.public_metrics.quote_count
                    } : undefined
                };
            });
        } catch (error) {
            Logger.error('Error fetching user timeline:', error);
            return [];
        }
    }

    async getTweet(tweetId: string): Promise<any> {
        try {
            Logger.info('Fetching tweet:', { tweetId });
            
            const result = await this.client.v2.singleTweet(tweetId, {
                'tweet.fields': 'created_at,public_metrics,referenced_tweets',
                'user.fields': 'username,profile_image_url',
                expansions: 'author_id'
            });
            
            const tweet = result.data;
            const author = result.includes?.users?.[0];
            
            return {
                id: tweet.id,
                text: tweet.text,
                authorId: tweet.author_id,
                authorUsername: author?.username || 'unknown',
                createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
                metrics: tweet.public_metrics ? {
                    retweets: tweet.public_metrics.retweet_count,
                    replies: tweet.public_metrics.reply_count,
                    likes: tweet.public_metrics.like_count,
                    quotes: tweet.public_metrics.quote_count
                } : undefined
            };
        } catch (error) {
            Logger.error('Error fetching tweet:', error);
            throw error;
        }
    }

    async searchTweets(query: string, limit: number = 10): Promise<any[]> {
        try {
            Logger.info('Searching tweets:', { query, limit });
            
            const result = await this.client.v2.search(query, {
                max_results: limit,
                'tweet.fields': 'created_at,public_metrics,referenced_tweets',
                'user.fields': 'username,profile_image_url',
                expansions: 'author_id'
            });
            
            const tweets = result.data.data || [];
            const users = result.data.includes?.users || [];
            
            return tweets.map((tweet: any) => {
                const author = users.find((user: any) => user.id === tweet.author_id);
                
                return {
                    id: tweet.id,
                    text: tweet.text,
                    authorId: tweet.author_id,
                    authorUsername: author?.username || 'unknown',
                    createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
                    metrics: tweet.public_metrics ? {
                        retweets: tweet.public_metrics.retweet_count,
                        replies: tweet.public_metrics.reply_count,
                        likes: tweet.public_metrics.like_count,
                        quotes: tweet.public_metrics.quote_count
                    } : undefined
                };
            });
        } catch (error) {
            Logger.error('Error searching tweets:', error);
            return [];
        }
    }

    async getTweetReplies(tweetId: string, limit: number = 10): Promise<any[]> {
        try {
            Logger.info('Fetching tweet replies:', { tweetId, limit });
            
            // Search for tweets that are replies to the specified tweet
            const query = `conversation_id:${tweetId}`;
            const result = await this.client.v2.search(query, {
                max_results: limit,
                'tweet.fields': 'created_at,public_metrics,referenced_tweets,in_reply_to_user_id',
                'user.fields': 'username,profile_image_url',
                expansions: 'author_id'
            });
            
            const tweets = result.data.data || [];
            const users = result.data.includes?.users || [];
            
            // Filter to only include actual replies to the tweet
            const replies = tweets.filter((tweet: any) => 
                tweet.referenced_tweets?.some((ref: any) => 
                    ref.type === 'replied_to' && ref.id === tweetId
                )
            );
            
            return replies.map((tweet: any) => {
                const author = users.find((user: any) => user.id === tweet.author_id);
                
                return {
                    id: tweet.id,
                    text: tweet.text,
                    authorId: tweet.author_id,
                    authorUsername: author?.username || 'unknown',
                    createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
                    inReplyToTweetId: tweetId,
                    metrics: tweet.public_metrics ? {
                        retweets: tweet.public_metrics.retweet_count,
                        replies: tweet.public_metrics.reply_count,
                        likes: tweet.public_metrics.like_count,
                        quotes: tweet.public_metrics.quote_count
                    } : undefined
                };
            });
        } catch (error) {
            Logger.error('Error fetching tweet replies:', error);
            return [];
        }
    }
} 