import { E } from "node_modules/@kobalte/core/dist/index-f6a05e1c";
import { Message } from "../models/models";
import { convertToChatMessages, HOST } from "./utils";
import { auth } from "@/lib/firebase";
import { Conversation } from "@/components/app-sidebar";
import componentsJson from "./components.json";
import Prism from "prismjs";

const components = componentsJson as any;

// Current database version - increment when schema changes
const CURRENT_DB_VERSION = "1.0.0";
const DB_VERSION_KEY = "indexeddb_version";

//static class to access the message cache
class DB {
  static db: IDBDatabase;
  static inited = false;

  static async init() {
    if (DB.inited) return;

    const user = auth.currentUser;
    if (!user) return;

    const userID = user.uid;

    // Check stored version against current version
    const storedVersion = localStorage.getItem(DB_VERSION_KEY);
    const shouldResetDatabase = storedVersion !== CURRENT_DB_VERSION;

    if (shouldResetDatabase && storedVersion) {
      console.log(
        `DB version changed from ${storedVersion} to ${CURRENT_DB_VERSION}, resetting database`,
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
      };

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result);
      };
    });

    DB.db = db;
    DB.inited = true;

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
    name: "conversations" | "messages" | "prism",
    mode: IDBTransactionMode = "readonly"
  ) {
    if (!DB.inited) throw new Error("DB not initialized");
    if (!DB.db) throw new Error("DB not initialized");
    return DB.db.transaction(name, mode).objectStore(name);
  }

  public static getStoreWrite(
    name: "conversations" | "messages" | "prism",
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
            console.log("conversations", request.result);
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
}

export class MessageCache {
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
    const conversations = sessionStorage.getItem(`conversations`);
    if (conversations) {
      ConversationCache.set(JSON.parse(conversations));
      return JSON.parse(conversations);
    }
    const dbConversations = await DB.getConversations();
    if (dbConversations) {
      ConversationCache.set(dbConversations);
      return dbConversations;
    }
    return await ConversationCache.fetchConversationsNoCache();
  }

  public static set(conversations: Conversation[]) {
    //if empty array, don't set cache
    if (conversations.length === 0) {
      return;
    }
    
    try {
      sessionStorage.setItem(`conversations`, JSON.stringify(conversations));
    } catch (error) {
      // If we hit quota limits, clear all sessionStorage and try again
      console.warn("Storage error encountered, clearing sessionStorage:", error);
      sessionStorage.clear();
      
      // Try one more time after clearing
      try {
        sessionStorage.setItem(`conversations`, JSON.stringify(conversations));
      } catch (secondError) {
        console.error("Still failed to store in sessionStorage after clearing:", secondError);
      }
    }
    
    DB.setConversations(conversations);
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
    if (PrismaCache.loadedLanguages[language]) {
      console.log(`Language "${language}" already loaded`);
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
        console.log(`Loading language "${language}"`);
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
