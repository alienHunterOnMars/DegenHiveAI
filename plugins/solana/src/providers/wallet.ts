import {
    type Memory,
    type State,
} from "@hiveai/utils";
import { Logger } from "@hiveai/utils";
import { Connection, PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import NodeCache from "node-cache";
import { getWalletKey } from "../keypairUtils";

// Provider configuration
const PROVIDER_CONFIG = {
    BIRDEYE_API: "https://public-api.birdeye.so",
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    DEFAULT_RPC: "https://api.mainnet-beta.solana.com",
    GRAPHQL_ENDPOINT: "https://graph.codex.io/graphql",
    TOKEN_ADDRESSES: {
        SOL: "So11111111111111111111111111111111111111112",
        BTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
        ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    },
};

export interface Item {
    name: string;
    address: string;
    symbol: string;
    decimals: number;
    balance: string;
    uiAmount: string;
    priceUsd: string;
    valueUsd: string;
    valueSol?: string;
}

interface WalletPortfolio {
    totalUsd: string;
    totalSol?: string;
    items: Array<Item>;
}

interface _BirdEyePriceData {
    data: {
        [key: string]: {
            price: number;
            priceChange24h: number;
        };
    };
}

interface Prices {
    solana: { usd: string };
    bitcoin: { usd: string };
    ethereum: { usd: string };
}

export class WalletProvider {
    private cache: NodeCache;

    constructor(
        private connection: Connection,
        private walletPublicKey: PublicKey
    ) {
        this.cache = new NodeCache({ stdTTL: 300 }); // Cache TTL set to 5 minutes
    }

    private async fetchWithRetry(
        config: any,
        url: string,
        options: RequestInit = {}
    ): Promise<any> {
        let lastError: Error | null = null;

        for (let i = 0; i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        Accept: "application/json",
                        "x-chain": "solana",
                        "X-API-KEY":
                            config.BIRDEYE_API_KEY || "",
                        ...options.headers,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `HTTP error! status: ${response.status}, message: ${errorText}`
                    );
                }

                const data = await response.json();
                return data;
            } catch (error) {
                Logger.error(`Attempt ${i + 1} failed:`, error);
                lastError = error as Error;
                if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
                    const delay = PROVIDER_CONFIG.RETRY_DELAY * Math.pow(2, i);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
            }
        }

        Logger.error(
            "All attempts failed. Throwing the last error:",
            lastError
        );
        throw lastError;
    }

    async fetchPortfolioValue(config: any): Promise<WalletPortfolio> {
        try {
            const cacheKey = `portfolio-${this.walletPublicKey.toBase58()}`;
            const cachedValue = this.cache.get<WalletPortfolio>(cacheKey);

            if (cachedValue) {
                Logger.log("Cache hit for fetchPortfolioValue");
                return cachedValue;
            }
            Logger.log("Cache miss for fetchPortfolioValue");

            // Check if Birdeye API key is available
            const birdeyeApiKey = config.BIRDEYE_API_KEY;

            if (birdeyeApiKey) {
                // Existing Birdeye API logic
                const walletData = await this.fetchWithRetry(
                    config,
                    `${PROVIDER_CONFIG.BIRDEYE_API}/v1/wallet/token_list?wallet=${this.walletPublicKey.toBase58()}`
                );

                if (walletData?.success && walletData?.data) {
                    const data = walletData.data;
                    const totalUsd = new BigNumber(data.totalUsd.toString());
                    const prices = await this.fetchPrices(config);
                    const solPriceInUSD = new BigNumber(
                        prices.solana.usd.toString()
                    );

                    const items = data.items.map((item: any) => ({
                        ...item,
                        valueSol: new BigNumber(item.valueUsd || 0)
                            .div(solPriceInUSD)
                            .toFixed(6),
                        name: item.name || "Unknown",
                        symbol: item.symbol || "Unknown",
                        priceUsd: item.priceUsd || "0",
                        valueUsd: item.valueUsd || "0",
                    }));

                    const portfolio = {
                        totalUsd: totalUsd.toString(),
                        totalSol: totalUsd.div(solPriceInUSD).toFixed(6),
                        items: items.sort((a: any, b: any) =>
                            new BigNumber(b.valueUsd)
                                .minus(new BigNumber(a.valueUsd))
                                .toNumber()
                        ),
                    };

                    this.cache.set(cacheKey, portfolio);
                    return portfolio;
                }
            }

            // Fallback to basic token account info if no Birdeye API key or API call fails
            const accounts = await this.getTokenAccounts(
                this.walletPublicKey.toBase58()
            );

            const items = accounts.map((acc) => ({
                name: "Unknown",
                address: acc.account.data.parsed.info.mint,
                symbol: "Unknown",
                decimals: acc.account.data.parsed.info.tokenAmount.decimals,
                balance: acc.account.data.parsed.info.tokenAmount.amount,
                uiAmount:
                    acc.account.data.parsed.info.tokenAmount.uiAmount.toString(),
                priceUsd: "0",
                valueUsd: "0",
                valueSol: "0",
            }));

            const portfolio = {
                totalUsd: "0",
                totalSol: "0",
                items,
            };

            this.cache.set(cacheKey, portfolio);
            return portfolio;
        } catch (error) {
            Logger.error("Error fetching portfolio:", error);
            throw error;
        }
    }

    async fetchPortfolioValueCodex(config: any): Promise<WalletPortfolio> {
        try {
            const cacheKey = `portfolio-${this.walletPublicKey.toBase58()}`;
            const cachedValue = await this.cache.get<WalletPortfolio>(cacheKey);

            if (cachedValue) {
                Logger.log("Cache hit for fetchPortfolioValue");
                return cachedValue;
            }
            Logger.log("Cache miss for fetchPortfolioValue");

            const query = `
              query Balances($walletId: String!, $cursor: String) {
                balances(input: { walletId: $walletId, cursor: $cursor }) {
                  cursor
                  items {
                    walletId
                    tokenId
                    balance
                    shiftedBalance
                  }
                }
              }
            `;

            const variables = {
                walletId: `${this.walletPublicKey.toBase58()}:${1399811149}`,
                cursor: null,
            };

            const response = await fetch(PROVIDER_CONFIG.GRAPHQL_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization:
                        config.CODEX_API_KEY || "",
                },
                body: JSON.stringify({
                    query,
                    variables,
                }),
            }).then((res) => res.json());

            const data = response.data?.data?.balances?.items;

            if (!data || data.length === 0) {
                Logger.error("No portfolio data available", data);
                throw new Error("No portfolio data available");
            }

            // Fetch token prices
            const prices = await this.fetchPrices(config);
            const solPriceInUSD = new BigNumber(prices.solana.usd.toString());

            // Reformat items
            const items: Item[] = data.map((item: any) => {
                return {
                    name: "Unknown",
                    address: item.tokenId.split(":")[0],
                    symbol: item.tokenId.split(":")[0],
                    decimals: 6,
                    balance: item.balance,
                    uiAmount: item.shiftedBalance.toString(),
                    priceUsd: "",
                    valueUsd: "",
                    valueSol: "",
                };
            });

            // Calculate total portfolio value
            const totalUsd = items.reduce(
                (sum, item) => sum.plus(new BigNumber(item.valueUsd)),
                new BigNumber(0)
            );

            const totalSol = totalUsd.div(solPriceInUSD);

            const portfolio: WalletPortfolio = {
                totalUsd: totalUsd.toFixed(6),
                totalSol: totalSol.toFixed(6),
                items: items.sort((a, b) =>
                    new BigNumber(b.valueUsd)
                        .minus(new BigNumber(a.valueUsd))
                        .toNumber()
                ),
            };

            // Cache the portfolio for future requests
            await this.cache.set(cacheKey, portfolio, 60 * 1000); // Cache for 1 minute

            return portfolio;
        } catch (error) {
            Logger.error("Error fetching portfolio:", error);
            throw error;
        }
    }

    async fetchPrices(config: any): Promise<Prices> {
        try {
            const cacheKey = "prices";
            const cachedValue = this.cache.get<Prices>(cacheKey);

            if (cachedValue) {
                Logger.log("Cache hit for fetchPrices");
                return cachedValue;
            }
            Logger.log("Cache miss for fetchPrices");

            const { SOL, BTC, ETH } = PROVIDER_CONFIG.TOKEN_ADDRESSES;
            const tokens = [SOL, BTC, ETH];
            const prices: Prices = {
                solana: { usd: "0" },
                bitcoin: { usd: "0" },
                ethereum: { usd: "0" },
            };

            for (const token of tokens) {
                const response = await this.fetchWithRetry(
                    config,
                    `${PROVIDER_CONFIG.BIRDEYE_API}/defi/price?address=${token}`,
                    {
                        headers: {
                            "x-chain": "solana",
                        },
                    }
                );

                if (response?.data?.value) {
                    const price = response.data.value.toString();
                    prices[
                        token === SOL
                            ? "solana"
                            : token === BTC
                              ? "bitcoin"
                              : "ethereum"
                    ].usd = price;
                } else {
                    Logger.warn(
                        `No price data available for token: ${token}`
                    );
                }
            }

            this.cache.set(cacheKey, prices);
            return prices;
        } catch (error) {
            Logger.error("Error fetching prices:", error);
            throw error;
        }
    }

    formatPortfolio(
        config: any,
        portfolio: WalletPortfolio,
        prices: Prices
    ): string {
        let output = `${config.character.description}\n`;
        output += `Wallet Address: ${this.walletPublicKey.toBase58()}\n\n`;

        const totalUsdFormatted = new BigNumber(portfolio.totalUsd).toFixed(2);
        const totalSolFormatted = portfolio.totalSol;

        output += `Total Value: $${totalUsdFormatted} (${totalSolFormatted} SOL)\n\n`;
        output += "Token Balances:\n";

        const nonZeroItems = portfolio.items.filter((item) =>
            new BigNumber(item.uiAmount).isGreaterThan(0)
        );

        if (nonZeroItems.length === 0) {
            output += "No tokens found with non-zero balance\n";
        } else {
            for (const item of nonZeroItems) {
                const valueUsd = new BigNumber(item.valueUsd).toFixed(2);
                output += `${item.name} (${item.symbol}): ${new BigNumber(
                    item.uiAmount
                ).toFixed(6)} ($${valueUsd} | ${item.valueSol} SOL)\n`;
            }
        }

        output += "\nMarket Prices:\n";
        output += `SOL: $${new BigNumber(prices.solana.usd).toFixed(2)}\n`;
        output += `BTC: $${new BigNumber(prices.bitcoin.usd).toFixed(2)}\n`;
        output += `ETH: $${new BigNumber(prices.ethereum.usd).toFixed(2)}\n`;

        return output;
    }

    async getFormattedPortfolio(config: any): Promise<string> {
        try {
            const [portfolio, prices] = await Promise.all([
                this.fetchPortfolioValue(config),
                this.fetchPrices(config),
            ]);

            return this.formatPortfolio(config, portfolio, prices);
        } catch (error) {
            Logger.error("Error generating portfolio report:", error);
            return "Unable to fetch wallet information. Please try again later.";
        }
    }

    private async getTokenAccounts(walletAddress: string) {
        try {
            const accounts =
                await this.connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    {
                        programId: new PublicKey(
                            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                        ),
                    }
                );
            return accounts.value;
        } catch (error) {
            Logger.error("Error fetching token accounts:", error);
            return [];
        }
    }
}

const walletProvider = {
    get: async (
        privateKey: string,
        config: any,
        _message: Memory,
        _state?: State
    ): Promise<string | null> => {
        try {
            const { publicKey } = await getWalletKey(privateKey);

            const connection = new Connection(
                PROVIDER_CONFIG.DEFAULT_RPC
            );

            if (!publicKey) throw new Error("No wallet public key found");
            const provider = new WalletProvider(connection, publicKey);

            return await provider.getFormattedPortfolio(config);
        } catch (error) {
            Logger.error("Error in wallet provider:", error);
            return null;
        }
    },
};

// Module exports
export { walletProvider };
