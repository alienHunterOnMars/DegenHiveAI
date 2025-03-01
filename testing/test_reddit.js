import Snoowrap from 'snoowrap';
import dotenv from 'dotenv';
import { Logger } from '@hiveai/utils';

// Load environment variables
dotenv.config();

// Reddit client configuration
const redditClient = new Snoowrap({
    userAgent: "alphaSniffer/1.0 by degenhive",
    clientId: "1OCauTuhUoM1gPQ3kg_BzA",
    clientSecret: "3i38nmUHRbbKp-LWk0DJqbeJFbQZew",
    username: "degenhive",
    password: "$Reddit@423368"
});

// Configure client with conservative rate limits
redditClient.config({
    requestDelay: 2000,
    maxRetryAttempts: 3,
    continueAfterRatelimitError: true,
    retryErrorCodes: [502, 503, 504, 522]
});

// Test functions
async function testGetSubredditPosts(subredditName) {
    try {
        Logger.info(`Fetching posts from r/${subredditName}...`);
        const subreddit = redditClient.getSubreddit(subredditName);
        
        // Get new posts
        Logger.info('Fetching new posts...');
        const newPosts = await subreddit.getNew({ limit: 5 });
        console.log(newPosts);
        Logger.info('New posts:', newPosts.map(post => ({
            title: post.title,
            author: post.author.name,
            created: new Date(post.created_utc * 1000).toISOString(),
            url: post.url
        })));

        // Get hot posts
        Logger.info('Fetching hot posts...');
        const hotPosts = await subreddit.getHot({ limit: 5 });
        Logger.info('Hot posts:', hotPosts.map(post => ({
            title: post.title,
            author: post.author.name,
            score: post.score,
            url: post.url
        })));

    } catch (error) {
        Logger.error('Error fetching subreddit posts:', error);
    }
}

async function testGetPostComments(postId) {
    try {
        Logger.info(`Fetching comments for post ${postId}...`);
        const submission = redditClient.getSubmission(postId);
        const comments = await submission.comments.fetchAll();
        
        Logger.info('Comments:', comments.map(comment => ({
            author: comment.author.name,
            body: comment.body,
            score: comment.score,
            created: new Date(comment.created_utc * 1000).toISOString()
        })));

    } catch (error) {
        Logger.error('Error fetching post comments:', error);
    }
}

async function testCreatePost(subredditName, title, text) {
    try {
        Logger.info(`Creating post in r/${subredditName}...`);
        const subreddit = redditClient.getSubreddit(subredditName);
        
        const post = await subreddit.submitSelfpost({
            title: "testing 123",
            text: "testing 123"
        });

        Logger.info('Post created:', {
            id: post.id,
            url: post.url,
            title: post.title
        });

        return post.id;

    } catch (error) {
        Logger.error('Error creating post:', error);
    }
}

async function testReplyToPost(postId, replyText) {
    try {
        Logger.info(`Replying to post ${postId}...`);
        const submission = redditClient.getSubmission(postId);
        
        const reply = await submission.reply(replyText);
        Logger.info('Reply created:', {
            id: reply.id,
            body: reply.body
        });

    } catch (error) {
        Logger.error('Error replying to post:', error);
    }
}

async function testSearchSubreddit(subredditName, query) {
    try {
        Logger.info(`Searching r/${subredditName} for "${query}"...`);
        const subreddit = redditClient.getSubreddit(subredditName);
        
        const searchResults = await subreddit.search({
            query,
            limit: 10,
            sort: 'new'
        });

        Logger.info('Search results:', searchResults.map(post => ({
            title: post.title,
            author: post.author.name,
            score: post.score,
            url: post.url
        })));

    } catch (error) {
        Logger.error('Error searching subreddit:', error);
    }
}

// Command line interface
const command = process.argv[2];
const param1 = process.argv[3];
const param2 = process.argv[4];
const param3 = process.argv[5];

switch (command) {
    case 'posts':
        testGetSubredditPosts(param1 || 'cryptocurrency');
        break;
    case 'comments':
        if (!param1) {
            Logger.error('Please provide a post ID');
            break;
        }
        testGetPostComments(param1);
        break;
    case 'create':
        testCreatePost(
            param1 || 'degenhive',
            param2 || 'Test Post',
            param3 || 'This is a test post.'
        );
        break;
    case 'reply':
        if (!param1) {
            Logger.error('Please provide a post ID');
            break;
        }
        testReplyToPost(param1, param2 || 'This is a test reply.');
        break;
    case 'search':
        testSearchSubreddit(
            param1 || 'cryptocurrency',
            param2 || 'bitcoin'
        );
        break;
    default:
        Logger.info(`
Available test commands:
- node test_reddit.js posts <subreddit>           : Get posts from a subreddit
- node test_reddit.js comments <postId>           : Get comments from a post
- node test_reddit.js create <sub> <title> <text> : Create a new post
- node test_reddit.js reply <postId> <text>       : Reply to a post
- node test_reddit.js search <sub> <query>        : Search in a subreddit
        `);
} 