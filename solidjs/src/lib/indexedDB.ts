// IndexedDB utilities for message storage
import { Message } from "../aichat/models/models";

class IndexedDBStorage {
  private dbName: string = 'messageStore';
  private dbVersion: number = 1;
  private storeName: string = 'messages';
  private db: IDBDatabase | null = null;

  // Open the database connection
  public async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error opening IndexedDB:', event);
        reject('Error opening database');
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store for messages, using conversationId as the key path
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'conversationId' });
          // Create an index for faster lookups
          store.createIndex('conversationId', 'conversationId', { unique: true });
        }
      };
    });
  }

  // Store messages for a conversation
  public async setMessages(conversationId: string, messages: Message[]): Promise<void> {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // We store all messages for a conversation in a single object
      const request = store.put({ conversationId, messages });
      
      request.onerror = (event) => {
        console.error('Error storing messages in IndexedDB:', event);
        reject('Error storing messages');
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  // Get messages for a conversation
  public async getMessages(conversationId: string): Promise<Message[]> {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(conversationId);
      
      request.onerror = (event) => {
        console.error('Error getting messages from IndexedDB:', event);
        reject('Error retrieving messages');
      };
      
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        if (result) {
          resolve(result.messages);
        } else {
          // No messages found for this conversation
          resolve([]);
        }
      };
    });
  }

  // Check if messages exist for a conversation
  public async hasMessages(conversationId: string): Promise<boolean> {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(conversationId);
      
      request.onerror = (event) => {
        console.error('Error checking messages in IndexedDB:', event);
        reject('Error checking messages');
      };
      
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        resolve(!!result);
      };
    });
  }

  // Delete messages for a conversation
  public async deleteMessages(conversationId: string): Promise<void> {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(conversationId);
      
      request.onerror = (event) => {
        console.error('Error deleting messages from IndexedDB:', event);
        reject('Error deleting messages');
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  // Close the database connection
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Create a singleton instance
const indexedDBStorage = new IndexedDBStorage();

export default indexedDBStorage; 