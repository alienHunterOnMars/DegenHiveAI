import TwitterApi from 'twitter-api-v2';
import { Logger } from '@hiveai/utils';

export class TweetHandler {
    private client: TwitterApi;

    constructor(client: TwitterApi) {
        this.client = client;
    }

    async postTweet(text: string): Promise<any> {
        try {
            Logger.info('Posting tweet:', { text });
            const result = await this.client.v2.tweet(text);
            
            return {
                id: result.data.id,
                text: text
            };
        } catch (error) {
            Logger.error('Error posting tweet:', error);
            throw error;
        }
    }

    async replyToTweet(tweetId: string, text: string): Promise<any> {
        try {
            Logger.info('Replying to tweet:', { tweetId, text });
            const result = await this.client.v2.reply(text, tweetId);
            
            return {
                id: result.data.id,
                text: text
            };
        } catch (error) {
            Logger.error('Error replying to tweet:', error);
            throw error;
        }
    }

    async retweet(loggedUserId: string, tweetId: string): Promise<any> {
        try {
            Logger.info('Retweeting tweet:', { tweetId });
            const result = await this.client.v2.retweet(loggedUserId, tweetId);
            
            return {
                retweetedId: tweetId
            };
        } catch (error) {
            Logger.error('Error retweeting tweet:', error);
            throw error;
        }
    }

 
    async deleteTweet(tweetId: string): Promise<void> {
        try {
            Logger.info('Deleting tweet:', { tweetId });
            await this.client.v2.deleteTweet(tweetId);
        } catch (error) {
            Logger.error('Error deleting tweet:', error);
            throw error;
        }
    }
} 