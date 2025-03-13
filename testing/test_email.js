import Snoowrap from 'snoowrap';
import dotenv from 'dotenv';
import { Logger } from '@hiveai/utils';
import Imap from 'node-imap';
import { v4 as uuid } from 'uuid';
// Load environment variables
dotenv.config();

// After successful SendGrid send, save to IMAP outbox
const imap = new Imap({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    user: 'capitaldesk@degenhive.ai',
    password: 'kztl burb dsvl gucd',
    tls: true,
});
 


function createEmailContent(msg) {
    try {
            // Create a plain text version by stripping HTML
            const plainText = msg.text.replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        // Generate a unique boundary
        const boundary = `----=_Part_${Math.random().toString(36).substr(2)}`;

        // Create email content with proper CRLF line endings
        const emailContent = [
            `From: ${msg.from.name} <${msg.from.email}>`,
            `To: ${msg.to.join(', ')}`,
            msg.cc ? `Cc: ${msg.cc.join(', ')}` : '',
            `Subject: ${msg.subject}`,
            `Date: ${new Date().toUTCString()}`,
            `Message-ID: <${uuid()}@degenhive.ai>`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            'This is a multi-part message in MIME format.',
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(plainText).toString('base64'),
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(msg.html).toString('base64'),
            '',
            `--${boundary}--`,
            '' // Final newline
        ].filter(Boolean).join('\r\n');

        // Convert to Buffer with proper line endings
        return Buffer.from(emailContent, 'utf-8');
    } catch (error) {
        Logger.error('Error creating email content:', error);
        return null;
    }
}

function appendToSentMail(emailContent) {
    return new Promise((resolve, reject) => {
        // First, open the Sent Mail box
        imap.openBox('[Gmail]/Sent Mail', false, (boxErr) => {
            if (boxErr) {
                Logger.error('Error opening Sent Mail box:', boxErr);
                return reject(boxErr);
            }

            // Then append the email with properly formatted options
            const options = {
                mailbox: '[Gmail]/Sent Mail',
                flags: ['\\Seen']
                // Removed the date option as it's causing issues
            };

            imap.append(emailContent, options, (appendErr) => {
                if (appendErr) {
                    Logger.error('Error appending to Sent Mail:', appendErr);
                    reject(appendErr);
                } else {
                    Logger.info('Email saved to Sent Mail folder');
                    resolve();
                }
            });
        });
    });
}


// Test functions
async function testSendEmail() {
    try {
        let msg = {"type": "email", "to": ["pretentiouspunjabiguy@gmail.com"], "subject": "DegenHive Pre-Seed: Cross-Chain DeFi x AI + Sui AMM", "content": "\n<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <style>\n        body {\n            font-family: Arial, sans-serif;\n            line-height: 1.6;\n            color: #333333;\n            max-width: 600px;\n            margin: 0 auto;\n            padding: 20px;\n        }\n        p {\n            margin-bottom: 16px;\n            white-space: pre-wrap;\n        }\n        .highlight {\n            background-color: #FFEB3B;\n            padding: 2px 4px;\n        }\n        .signature {\n            margin-top: 30px;\n            padding-top: 20px;\n            border-top: 1px solid #eee;\n            color: #666666;\n        }\n        .signature-content {\n            display: flex;\n            align-items: flex-start;\n            justify-content: space-between;\n        }\n        .signature-text {\n            flex: 1;\n        }\n        .signature-name {\n            font-weight: bold;\n            color: #333333;\n            margin-bottom: 4px;\n            display: flex;\n            align-items: center;\n            gap: 10px;\n        }\n        .signature-title {\n            color: #666666;\n            margin-bottom: 4px;\n        }\n        .signature-company {\n            color: #666666;\n            margin-bottom: 8px;\n        }\n        .social-icons {\n            display: inline-flex;\n            gap: 8px;\n            align-items: center;\n        }\n        .social-icons a {\n            display: inline-block;\n            text-decoration: none;\n        }\n        .social-icons img {\n            width: 16px;\n            height: 16px;\n            vertical-align: middle;\n        }\n        .calendar-link {\n            display: inline-block;\n            margin-top: 8px;\n            padding: 6px 12px;\n            background-color: #0077B5;\n            color: white;\n            text-decoration: none;\n            border-radius: 4px;\n            font-size: 14px;\n        }\n        .calendar-link:hover {\n            background-color: #005885;\n        }\n    </style>\n</head>\n<body>\n    <div class=\"content\">\n        <p>Hello Abby,</p>\n        <p>I'm Rahul (ex-Delphi Digital where i built contracts which managed $1.5B+ in TVL) and am currently building <strong>DegenHive</strong> \u2014 a cross-chain DeFi+AI project with:</p>\n        <p><strong>- Cross-Chain Telegram trading bot:</strong> Trade on Sui, Solana, Monad, Hyperliquid, guided by \"dragonbee\" NFTs that serve as digital trading companions.</p>\n        <p><strong>- Dragonbee NFTs:</strong> CryptoKitties-inspired, with on-chain breeding/evolution, which <u>distribute share of protocol revenue back among users</u> and will be used in future P2E game.</p>\n        <p><strong>- AMM + Liquid Staking on Sui:</strong> Completed dev; fees flow into HIVE/HONEY buybacks.</p>\n        <p><strong>- Revenue Streams:</strong> Earnings from Telegram trading fees, NFT sales, and royalties feed into game development and help build a sustainable business model.</p>\n        <p>We're raising <span class=\"highlight\">$500k at a $10M valuation with a de-risking model</span>: <strong>25% of revenue returned quarterly until the $500k is repaid</strong> \u2014 limiting your downside to effectively zero. Proceeds fund audits (unlocking Sui incentives), NFT artwork, and bot development to drive dragonbee sales (targeting ~$7M total).</p>\n        <p>Learn more and interact with our protocol at https://degenhive.ai. If you're interested in investing or helping bootstrap TVL, <strong>please schedule a call</strong> via the link below.</p>\n    </div>\n    <div class=\"signature\">\n        <div class=\"signature-content\">\n            <div class=\"signature-text\">\n                Best regards,<br>\n                <div class=\"signature-name\">\n                    Rahul Mittal\n                    <div class=\"social-icons\">\n                        <a href=\"https://www.linkedin.com/in/rahul-mittal4233/\" target=\"_blank\">\n                            <img src=\"https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png\" alt=\"LinkedIn\">\n                        </a>\n                        <a href=\"https://twitter.com/100xHunterBtc\" target=\"_blank\">\n                            <img src=\"https://upload.wikimedia.org/wikipedia/commons/6/6f/Logo_of_Twitter.svg\" alt=\"Twitter\">\n                        </a>\n                    </div>\n                </div>\n                <div class=\"signature-title\">Founder & CEO</div>\n                <div class=\"signature-company\">DegenHive</div>\n                <a href=\"https://calendly.com/rahul-degenhive/30min\" target=\"_blank\" class=\"calendar-link\">\ud83d\udcc5 Schedule a Call</a>\n            </div>\n        </div>\n    </div>\n</body>\n</html>\n", "content_type": "text/html", "options": {"campaign_id": "campaign_20250311160909", "investor_id": 4, "format": "html", "track_opens": true, "track_clicks": true, "images_enabled": true}};
        
        Logger.info('Creating email message...');
        let email_msg = {
            to: msg.to,
            subject: msg.subject,
            html: msg.content,
            text: msg.content,
            from: {
                name: "Rahul Mittal",
                email: "capitaldesk@degenhive.ai"
            }
        };

        Logger.info('Connecting to IMAP...');
        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });
        
        Logger.info('Creating email content...');
        const emailContent = createEmailContent(email_msg);
        if (!emailContent) {
            throw new Error('Failed to create email content');
        }

        Logger.info('Appending to Sent Mail...');
        await appendToSentMail(emailContent);

        Logger.info('Closing IMAP connection...');
        imap.end();
        Logger.info(`Email saved to Sent Mail folder for ${msg.to.join(', ')}`);
    } catch (error) {
        Logger.error('Error sending email:', error);
        if (imap && imap.state !== 'disconnected') {
            imap.end();
        }
    }
}
 
  
 
testSendEmail();
 
 