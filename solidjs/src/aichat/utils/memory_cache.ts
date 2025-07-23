import { E } from "node_modules/@kobalte/core/dist/index-f6a05e1c";
import { Message } from "../models/models";
import { convertToChatMessages, HOST } from "./utils";
import { auth } from "@/lib/firebase";
import { Conversation } from "@/components/app-sidebar";
import componentsJson from "./components.json";
import Prism from "prismjs";

const components = componentsJson as any;

// Current database version - increment when schema changes
const CURRENT_DB_VERSION = "1.0.4";
const DB_VERSION_KEY = "indexeddb_version";

//static class to access the message cache
// Export the DB class
export class DB {
  static db: IDBDatabase;
  static inited = false;

  static async init() {
    console.log("DB.init called, inited:", DB.inited);
    if (DB.inited) return;

    const user = auth.currentUser;
    if (!user) {
      console.error("DB.init: No authenticated user");
      return;
    }

    const userID = user.uid;
    console.log("DB.init: Initializing for user", userID);

    // Check stored version against current version
    const storedVersion = localStorage.getItem(DB_VERSION_KEY);
    const shouldResetDatabase = storedVersion !== CURRENT_DB_VERSION;

    if (shouldResetDatabase && storedVersion) {
      console.log(
        `DB.init: Version changed from ${storedVersion} to ${CURRENT_DB_VERSION}, resetting database`,
        userID
      );
      await DB.deleteDatabase(userID);
    }

    // Store current version
    localStorage.setItem(DB_VERSION_KEY, CURRENT_DB_VERSION);

    const request = indexedDB.open(userID, 1);

    // Wrap in a Promise to await db setup
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        console.log("DB.init: Upgrade needed, creating stores");
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("messages")) {
          db.createObjectStore("messages", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("prism")) {
          db.createObjectStore("prism", { keyPath: "name" });
        }
        if (!db.objectStoreNames.contains("workflows")) {
          db.createObjectStore("workflows", { keyPath: "id" });
        }
      };

      request.onerror = () => {
        console.error("DB.init: Error opening database:", request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log("DB.init: Database opened successfully");
        resolve(request.result);
      };
    });

    DB.db = db;
    DB.inited = true;
    console.log("DB.init: Initialization complete");
  }

  private static async deleteDatabase(userID: string): Promise<void> {
    // Clear session storage for good measure
    sessionStorage.clear();

    // First close our own connection to the database if it exists
    if (DB.inited && DB.db) {
      try {
        DB.db.close();
        console.log("Closed existing database connection");
      } catch (err) {
        console.error("Error closing database connection:", err);
      }
      DB.inited = false;
      DB.db = undefined as unknown as IDBDatabase;
    }

    return new Promise<void>((resolve, reject) => {
      // Create a timeout to prevent indefinite hanging
      const timeout = setTimeout(() => {
        console.warn("Database deletion timed out after 5 seconds");
        resolve(); // Resolve anyway to prevent hanging
      }, 5000);

      try {
        const request = indexedDB.deleteDatabase(userID);

        request.onsuccess = () => {
          clearTimeout(timeout);
          console.log("Database successfully deleted");
          resolve();
        };

        request.onerror = () => {
          clearTimeout(timeout);
          console.error("Error deleting database:", request.error);
          // Still resolve to prevent hanging
          resolve();
        };

        // Critical: Handle blocked events
        request.onblocked = () => {
          console.warn("Database deletion blocked - connections still open");
          // We'll continue waiting for the timeout
        };
      } catch (err) {
        clearTimeout(timeout);
        console.error("Exception during database deletion:", err);
        resolve(); // Resolve anyway to prevent hanging
      }
    });
  }

  public static getStoreRead(
    name: "conversations" | "messages" | "prism" | "workflows",
    mode: IDBTransactionMode = "readonly"
  ) {
    if (!DB.inited) throw new Error("DB not initialized");
    if (!DB.db) throw new Error("DB not initialized");
    return DB.db.transaction(name, mode).objectStore(name);
  }

  public static getStoreWrite(
    name: "conversations" | "messages" | "prism" | "workflows",
    mode: IDBTransactionMode = "readwrite"
  ) {
    if (!DB.inited) throw new Error("DB not initialized");
    if (!DB.db) throw new Error("DB not initialized");
    return DB.db.transaction(name, mode).objectStore(name);
  }

  public static async getMessageHistory(id: string): Promise<Message[]> {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreRead("messages");
    const request = store.get(id);

    const messages = await new Promise<Message[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.messages as Message[]);
        } else {
          resolve(request.result);
        }
      };
    });

    return messages;
  }

  public static async setMessageHistory(id: string, messages: Message[]) {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreWrite("messages");
    store.put({ id, messages });
  }

  public static async getPrism(name: string): Promise<string> {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreRead("prism");
    const request = store.get(name);

    const prism = await new Promise<string>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.prism as string);
        } else {
          resolve(request.result);
        }
      };
    });

    return prism;
  }

  public static async setPrism(name: string, prism: string) {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreWrite("prism");
    store.put({ name, prism });
  }

  public static async getConversations(): Promise<Conversation[]> {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreRead("conversations");
    const request = store.get("conversations");

    const conversations = await new Promise<Conversation[]>(
      (resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.conversations as Conversation[]);
          } else {
            resolve([]);
          }
        };
      }
    );

    return conversations;
  }

  public static async setConversations(conversations: Conversation[]) {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreWrite("conversations");
    store.put({ id: "conversations", conversations });
  }

  // Method to delete a specific conversation entry from IndexedDB
  public static async deleteConversationEntry(id: string): Promise<void> {
    if (!DB.inited) await DB.init();

    try {
      // 1. Get the current list
      const currentConversations = await DB.getConversations();

      // 2. Filter out the conversation to delete
      const updatedConversations = currentConversations.filter(conv => conv.id !== id);

      // 3. Write the updated list back
      if (currentConversations.length !== updatedConversations.length) {
        await DB.setConversations(updatedConversations);
        console.log(`Removed conversation ${id} from IndexedDB conversations list.`);
      } else {
        console.log(`Conversation ${id} not found in IndexedDB conversations list.`);
      }
    } catch (error) {
      console.error(`Error removing conversation ${id} from IndexedDB:`, error);
      throw error; // Re-throw the error to be caught by the caller
    }
  }

  // Method to delete specific message history from IndexedDB
  public static async deleteMessageHistory(id: string): Promise<void> {
    if (!DB.inited) await DB.init();

    return new Promise((resolve, reject) => {
      try {
        const store = DB.getStoreWrite("messages");
        const request = store.delete(id);

        request.onsuccess = () => {
          console.log(`Deleted message history for conversation ${id} from IndexedDB`);
          resolve();
        };
        request.onerror = () => {
          console.error(`Error deleting message history for conversation ${id}:`, request.error);
          reject(request.error); // Reject on error
        };
      } catch (err) {
        console.error("Exception during message history deletion:", err);
        reject(err); // Reject on exception
      }
    });
  }

  public static async getWorkflows(): Promise<any[]> {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreRead("workflows");
    const request = store.get("workflows");

    const workflows = await new Promise<any[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.workflows);
        } else {
          resolve([]);
        }
      };
    });

    return workflows;
  }

  public static async setWorkflows(workflows: any[]) {
    if (!DB.inited) await DB.init();

    const store = DB.getStoreWrite("workflows");
    store.put({ id: "workflows", workflows });
  }

  public static async deleteWorkflow(id: string): Promise<void> {
    if (!DB.inited) await DB.init();

    try {
      // Get current workflows
      const currentWorkflows = await DB.getWorkflows();
      
      // Filter out the workflow to delete
      const updatedWorkflows = currentWorkflows.filter(wf => wf.id !== id);
      
      // Update the store
      await DB.setWorkflows(updatedWorkflows);
      
      console.log(`Deleted workflow ${id} from IndexedDB`);
    } catch (error) {
      console.error(`Error deleting workflow ${id} from IndexedDB:`, error);
      throw error;
    }
  }
}

export class MessageCache {
  // Cache invalidation listeners
  private static invalidationListeners = new Set<(conversationId: string) => void>();

  // Method to add a listener for cache invalidation events
  public static addInvalidationListener(callback: (conversationId: string) => void) {
    MessageCache.invalidationListeners.add(callback);
    return () => MessageCache.invalidationListeners.delete(callback); // Return cleanup function
  }

  // Method to notify listeners when a conversation's cache is invalidated
  private static notifyInvalidation(conversationId: string) {
    MessageCache.invalidationListeners.forEach(callback => {
      try {
        callback(conversationId);
      } catch (error) {
        console.error('Error in cache invalidation listener:', error);
      }
    });
  }

  // Method to manually invalidate a conversation's cache (called from sync logic)
  public static invalidate(conversationId: string) {
    // Remove from sessionStorage
    sessionStorage.removeItem(`messages-${conversationId}`);
    
    // Remove from IndexedDB
    DB.deleteMessageHistory(conversationId).catch(error => {
      console.error(`Error deleting message history for ${conversationId}:`, error);
    });
    
    // Notify listeners
    MessageCache.notifyInvalidation(conversationId);
    
    console.log(`Invalidated cached messages for conversation ${conversationId}`);
  }

  //fetches message history and returns it also sets cache
  private static async fetchMessageHistoryNoCache(
    id: string
  ): Promise<Message[]> {
    const url = new URL(`${HOST}/api/v1/chats/conversations/${id}/messages`);
    try {
      const { authFetch } = await import("@/lib/utils");

      const response = await authFetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const chatMessages = convertToChatMessages(data.messages);

      // Store in cache
      if (response.status === 200) {
        MessageCache.set(id, chatMessages);
      }
      return chatMessages;
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
      return [];
    }
  }

  public static async prefetchMessageHistory(id: string) {
    if (MessageCache.has(id)) return;
    if (DB.inited) {
      const messages = await DB.getMessageHistory(id);
      if (messages) {
        MessageCache.set(id, messages);
        return;
      }
    }
    const messages = await MessageCache.fetchMessageHistoryNoCache(id);
    await MessageCache.set(id, messages);
  }

  public static has(id: string): boolean {
    //checks local storage
    const messages = sessionStorage.getItem(`messages-${id}`);
    if (messages) {
      return true;
    }
    return false;
  }

  public static async get(id: string): Promise<Message[]> {
    const messages = sessionStorage.getItem(`messages-${id}`);
    if (messages) {
      MessageCache.set(id, JSON.parse(messages));
      return JSON.parse(messages);
    }
    const dbMessages = await DB.getMessageHistory(id);
    if (dbMessages) {
      MessageCache.set(id, dbMessages);
      return dbMessages;
    }
    return await MessageCache.fetchMessageHistoryNoCache(id);
  }

  public static async set(id: string, messages: Message[]) {
    //if empty array, don't set cache
    if (messages.length === 0) {
      return;
    }
    
    //we want to set indexed db after we set on cache
    try {
      sessionStorage.setItem(`messages-${id}`, JSON.stringify(messages));
    } catch (error) {
      // If we hit quota limits, clear all sessionStorage and try again
      console.warn("Storage error encountered, clearing sessionStorage:", error);
      sessionStorage.clear();
      
      // Try one more time after clearing
      try {
        sessionStorage.setItem(`messages-${id}`, JSON.stringify(messages));
      } catch (secondError) {
        console.error("Still failed to store in sessionStorage after clearing:", secondError);
      }
    }

    // Also store in IndexedDB for persistence
    try {
      await DB.setMessageHistory(id, messages);
    } catch (error) {
      console.error("Failed to store messages in IndexedDB:", error);
    }
  }
}

export class ConversationCache {
  public static async fetchConversationsNoCache(): Promise<Conversation[]> {
    try {
      // Import here to avoid circular dependency
      const { authFetch } = await import("@/lib/utils");
      const { auth } = await import("@/lib/firebase");

      // Get current user UID
      const user = auth.currentUser;
      if (!user) {
        console.error("User not authenticated");
        return [];
      }

      // Get cached conversations for comparison
      const cachedConversations = await DB.getConversations();
      const cachedConversationsMap = new Map(
        cachedConversations.map(conv => [conv.id, conv])
      );

      const response = await authFetch(
        `${HOST}/api/v1/chats/users/${user.uid}/conversations`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.status === "success" && Array.isArray(data.conversations)) {
        const sortedConversations = data.conversations
          .map((conv: Conversation) => ({
            id: conv.id.toString(),
            title: conv.title,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
          }))
          .sort(
            (a: { created_at: string }, b: { created_at: string }) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );

        // Compare timestamps and invalidate cached messages for updated conversations
        const conversationsToInvalidate: string[] = [];
        
        for (const serverConv of sortedConversations) {
          const cachedConv = cachedConversationsMap.get(serverConv.id);
          if (cachedConv) {
            const serverTimestamp = new Date(serverConv.updated_at).getTime();
            const cachedTimestamp = new Date(cachedConv.updated_at).getTime();
            
            if (serverTimestamp > cachedTimestamp) {
              conversationsToInvalidate.push(serverConv.id);
              console.log(`Conversation ${serverConv.id} needs sync - server: ${serverConv.updated_at}, cached: ${cachedConv.updated_at}`);
            }
          }
        }

        // Invalidate cached messages for conversations that have been updated
        if (conversationsToInvalidate.length > 0) {
          console.log(`Invalidating cached messages for ${conversationsToInvalidate.length} conversations`);
          
          for (const conversationId of conversationsToInvalidate) {
            MessageCache.invalidate(conversationId);
          }
        }

        // Update the state with fresh data
        if (response.status === 200) {
          ConversationCache.set(sortedConversations);
        }
        return sortedConversations;
      }
      return [];
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      return [];
    }
  }

  public static has(): boolean {
    const conversations = sessionStorage.getItem(`conversations`);
    if (conversations) {
      return true;
    }
    return false;
  }

  public static async get(): Promise<Conversation[]> {
    try {
      const { auth } = await import("@/lib/firebase");
      const user = auth.currentUser;
      if (!user) {
        console.error("User not authenticated");
        return [];
      }

      console.log("Checking session storage for conversations");
      const conversations = sessionStorage.getItem(`conversations`);
      if (conversations) {
        console.log("Found conversations in session storage");
        ConversationCache.set(JSON.parse(conversations));
        return JSON.parse(conversations);
      }

      console.log("Checking IndexedDB for conversations");
      const dbConversations = await DB.getConversations();
      if (dbConversations) {
        console.log("Found conversations in IndexedDB");
        ConversationCache.set(dbConversations);
        return dbConversations;
      }

      console.log("No cached conversations found, fetching from server");
      return await ConversationCache.fetchConversationsNoCache();
    } catch (error) {
      console.error("Error in ConversationCache.get:", error);
      return [];
    }
  }

  public static set(conversations: Conversation[]) {
    if (!conversations) return;

    // Update session storage
    const data = JSON.stringify(conversations);
    sessionStorage.setItem("conversations", data);
    sessionStorage.setItem("conversations_timestamp", Date.now().toString());

    // Update IndexedDB
    DB.setConversations(conversations);
  }
  
  // Method to delete a specific conversation from the cache
  public static async delete(id: string): Promise<void> {
    // 1. Update SessionStorage
    try {
      const storedData = sessionStorage.getItem("conversations");
      if (storedData) {
        const currentConvos = JSON.parse(storedData) as Conversation[];
        const updatedConvos = currentConvos.filter(conv => conv.id !== id);
        if (currentConvos.length !== updatedConvos.length) {
           sessionStorage.setItem("conversations", JSON.stringify(updatedConvos));
           sessionStorage.setItem("conversations_timestamp", Date.now().toString()); // Update timestamp
           console.log(`Removed conversation ${id} from SessionStorage conversation list.`);
        } else {
           console.log(`Conversation ${id} not found in SessionStorage conversation list.`);
        }
      }
    } catch (error) {
      console.error(`Error removing conversation ${id} from SessionStorage:`, error);
      // Decide if we should re-throw or just log
      // throw error; // Optional: re-throw if critical
    }

    // 2. Update IndexedDB via DB class
    await DB.deleteConversationEntry(id); // This already handles its own errors/logging
  }
}

export class PrismaCache {
  static loadedLanguages: { [key: string]: boolean } = {
    markup: true, // HTML, XML, SVG, MathML...
    HTML: true,
    XML: true,
    SVG: true,
    MathML: true,
    SSML: true,
    Atom: true,
    RSS: true,
    css: true,
    "c-like": true,
    javascript: true, // IMPORTANT: Use 'javascript' not 'js'
  };

  static defaultLanguages: string[] = [
    "markup",
    "html",
    "xml",
    "SVG",
    "MathML",
    "SSML",
    "Atom",
    "RSS",
    "css",
    "c-like",
    "javascript",
  ];

  private static async fetchPrismNoCache(language: string): Promise<string> {
    const { authFetch } = await import("@/lib/utils");
    const response = await authFetch(
      `${HOST}/api/prism-language?name=${language}`
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch language "${language}": ${response.status}`
      );
    }
    const scriptText = await response.text();
    if (response.status === 200) {
      PrismaCache.set(language, scriptText);
    }
    return scriptText;
  }

  public static async get(language: string): Promise<string> {
    await DB.init();
    const dbPrism = await DB.getPrism(language);
    if (dbPrism) {
      return dbPrism;
    }
    return await PrismaCache.fetchPrismNoCache(language);
  }

  public static async set(language: string, prism: string) {
    await DB.init();
    DB.setPrism(language, prism);
  }

  public static async has(language: string): Promise<boolean> {
    await DB.init();
    try {
      const prism = await DB.getPrism(language);
      return !!prism;
    } catch (error) {
      return false;
    }
  }

  public static async loadLanguage(language: string) {
    if (PrismaCache.defaultLanguages.includes(language)) {
      return;
    }

    if (PrismaCache.loadedLanguages[language]) {
      // console.log(`Language "${language}" already loaded`);
      return; // Already loaded
    }
    try {
      
      const languageData = components.languages[language];
      if (!languageData) {
        console.warn(`Language "${language}" not found in components.json.`);
        return;
      }
      // Load required languages recursively Before loading the target language
      if (languageData.require) {
        const requirements = Array.isArray(languageData.require)
          ? languageData.require
          : [languageData.require];

        await requirements.forEach(async (requirement: string) => {
          await PrismaCache.loadLanguage(requirement);
        });
        
      }

      const script = await PrismaCache.get(language);
      if (script) {
        // console.log(`Loading language "${language}"`);
        eval(script);
        PrismaCache.loadedLanguages[language] = true;
        Prism.highlightAll();
      }
    } catch (error) {
      console.error(`Error loading language "${language}":`, error);
      // Consider a fallback (e.g., plain text highlighting)
    }
  }
}

// Function to prefetch message history
export async function prefetchMessageHistory(id: string) {
  if (MessageCache.has(id)) return MessageCache.get(id);
  MessageCache.prefetchMessageHistory(id);
}
