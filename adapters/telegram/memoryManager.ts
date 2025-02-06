/**
 * MemoryManager: Maintains a memory/context cache per user chat.
 *
 * Supports retrieval-augmented generation by storing recent messages and context.
 */
import { Logger } from "./utils/logger";

export interface IMemoryManager {
  updateMemory(userId: string, message: string): Promise<void>;
  getMemory(userId: string): Promise<string[]>;
}

export class MemoryManager implements IMemoryManager {
  // In production, this might be backed by a fast cache or a NoSQL store.
  private memoryStore: Map<string, string[]> = new Map();

  public async updateMemory(userId: string, message: string): Promise<void> {
    const currentMemory = this.memoryStore.get(userId) || [];
    // Keep only a fixed number of recent messages (for example, last 20)
    if (currentMemory.length >= 20) {
      currentMemory.shift(); // remove the oldest message
    }
    currentMemory.push(message);
    this.memoryStore.set(userId, currentMemory);
    Logger.info(`Updated memory for user ${userId}`);
  }

  public async getMemory(userId: string): Promise<string[]> {
    return this.memoryStore.get(userId) || [];
  }
}