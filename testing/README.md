# DegenHive Testing Scripts

This folder contains testing scripts for various DegenHive functionalities.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the testing directory with your Reddit credentials:
```env
REDDIT_USER_AGENT=alphaSniffer/1.0 by degenhive
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password
```

## Reddit Testing Scripts

Test various Reddit functionalities using the following commands:

### Using npm scripts:
```bash
# Run all tests
npm run test:reddit

# Test specific functionalities
npm run test:reddit:posts     # Get posts from a subreddit
npm run test:reddit:search    # Search in a subreddit
npm run test:reddit:create    # Create a new post
npm run test:reddit:comments  # Get comments from a post
```

### Using direct node commands:
```bash
# Get posts from a subreddit
node test_reddit.js posts cryptocurrency

# Get comments from a specific post
node test_reddit.js comments abc123

# Create a new post
node test_reddit.js create degenhive "Test Title" "Test Content"

# Reply to a post
node test_reddit.js reply abc123 "This is a reply"

# Search in a subreddit
node test_reddit.js search cryptocurrency "bitcoin"
```

## Rate Limiting

The scripts use conservative rate limits to avoid Reddit's API restrictions:
- 2 second delay between requests
- 3 retry attempts for failed requests
- Automatic handling of rate limit errors

## Logging

All operations are logged using the @hiveai/utils Logger:
- Success/failure of operations
- Detailed error messages
- Response data in readable format 