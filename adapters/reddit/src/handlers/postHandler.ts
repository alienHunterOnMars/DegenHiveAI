import Snoowrap from 'snoowrap';
import { Logger } from '@hiveai/utils';
import { PendingPost, RedditPost } from '../types';

export class RedditPostHandler {
    private client: Snoowrap;
    private pendingPosts: Map<string, PendingPost> = new Map();

    constructor(client: Snoowrap ) {
        this.client = client;
    }

    async submitPost(post: RedditPost): Promise<void> {
        try {
            const postId = `post-${Date.now()}`;
            const pendingPost: PendingPost = {
                ...post,
                id: postId,
                timestamp: Date.now(),
                status: 'pending'
            };

            this.pendingPosts.set(postId, pendingPost);
            await this.requestFounderApproval(pendingPost);

        } catch (error) {
            Logger.error('Error submitting Reddit post:', error);
            throw error;
        }
    }

    private async requestFounderApproval(post: PendingPost): Promise<void> {
        try {
            const approvalMessage = this.formatApprovalRequest(post);
            
            // Store the pending post
            this.pendingPosts.set(post.id, post);

            // Set expiration timer
            setTimeout(() => this.handlePostExpiration(post.id), 24 * 60 * 60 * 1000);

        } catch (error) {
            Logger.error('Error requesting post approval:', error);
            throw error;
        }
    }

    private formatApprovalRequest(post: PendingPost): string {
        return `🔔 *New Reddit Post Request*\n\n` +
               `*Subreddit:* r/${post.subreddit}\n` +
               `*Title:* ${post.title}\n\n` +
               `*Content:*\n${post.content}\n\n` +
               `*Type:* ${post.type}\n` +
               `*ID:* \`${post.id}\`\n\n` +
               `Please approve, reject, or edit this post.`;
    }

    async handleFounderResponse(
        action: 'approve' | 'reject' | 'edit',
        postId: string,
        editedContent?: RedditPost
    ): Promise<void> {
        const post = this.pendingPosts.get(postId);
        if (!post) return;

        try {
            switch (action) {
                case 'approve':
                    await this.publishPost(post);
                    break;
                
                case 'reject':
                    await this.handleRejectedPost(post);
                    break;
                
                case 'edit':
                    if (editedContent) {
                        const updatedPost = { ...post, ...editedContent };
                        await this.requestFounderApproval(updatedPost);
                    }
                    break;
            }

            this.pendingPosts.delete(postId);

        } catch (error) {
            Logger.error('Error handling founder response:', error);
            throw error;
        }
    }

    private async publishPost(post: PendingPost): Promise<void> {
        try {
            const subreddit = await this.client.getSubreddit(post.subreddit);
            
            let submission;
            if (post.type === 'text') {
                submission = await subreddit.submitSelfpost({
                    title: post.title,
                    text: post.content
                });
            } else {
                submission = await subreddit.submitLink({
                    title: post.title,
                    url: post.content
                });
            }

            if (post.flair) {
                await submission.selectFlair({ text: post.flair });
            }

            // await this.telegramAdapter.sendFounderMessage(
            //     `✅ Reddit post published successfully!\n` +
            //     `https://reddit.com${submission.permalink}`
            // );

            Logger.info('Reddit post published:', submission.id);

        } catch (error) {
            Logger.error('Error publishing Reddit post:', error);
            throw error;
        }
    }

    private async handleRejectedPost(post: PendingPost): Promise<void> {
            // await this.telegramAdapter.sendFounderMessage(
            //     `❌ Reddit post rejected:\n\n` +
            //     `Subreddit: r/${post.subreddit}\n` +
            //     `Title: ${post.title}`
            // );
        Logger.info('Reddit post rejected:', post.id);
    }

    private async handlePostExpiration(postId: string): Promise<void> {
        const post = this.pendingPosts.get(postId);
        if (post?.status === 'pending') {
            // await this.telegramAdapter.sendFounderMessage(
            //     `⚠️ Reddit post request expired:\n\n` +
            //     `Subreddit: r/${post.subreddit}\n` +
            //     `Title: ${post.title}`
            // );
            this.pendingPosts.delete(postId);
            Logger.info('Reddit post expired:', postId);
        }
    }

    async handleNewPost(post: Snoowrap.Submission): Promise<void> {
        // Implement monitoring logic for new posts in monitored subreddits
        // This could include:
        // - Keyword tracking
        // - Sentiment analysis
        // - Competitor monitoring
        // - Automated responses
    }
} 