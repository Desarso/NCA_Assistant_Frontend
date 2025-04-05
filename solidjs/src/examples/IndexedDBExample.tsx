import { Component, createSignal, onMount } from "solid-js";

const IndexedDBExample: Component = () => {
  const [status, setStatus] = createSignal("Initializing...");
  const [data, setData] = createSignal<string[]>([]);
  const [newItem, setNewItem] = createSignal("");
  const DB_NAME = "exampleDB";
  const STORE_NAME = "items";
  const DB_VERSION = 1;
  
  // Initialize the database
  const initDB = async (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        setStatus("Error opening database");
        reject("Error opening database");
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        setStatus("Database opened successfully");
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create an object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // The keyPath option can be used for a field that has unique values
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
          
          // Create an index for looking up items by name
          store.createIndex("name", "name", { unique: false });
          
          setStatus("Database setup complete");
        }
      };
    });
  };
  
  // Add an item to the database
  const addItem = async () => {
    if (!newItem()) return;
    
    try {
      const db = await initDB();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      // Create an item object
      const item = {
        name: newItem(),
        timestamp: new Date().getTime()
      };
      
      // Add the item to the store
      const request = store.add(item);
      
      request.onsuccess = () => {
        setStatus(`Item "${newItem()}" added successfully`);
        setNewItem("");
        loadAllItems();
      };
      
      request.onerror = () => {
        setStatus(`Error adding item "${newItem()}"`);
      };
      
      // Close the database when the transaction is complete
      transaction.oncomplete = () => {
        db.close();
      };
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };
  
  // Load all items from the database
  const loadAllItems = async () => {
    try {
      const db = await initDB();
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result;
        setData(items.map(item => item.name));
        setStatus(`Loaded ${items.length} items`);
      };
      
      request.onerror = () => {
        setStatus("Error loading items");
      };
      
      // Close the database when the transaction is complete
      transaction.oncomplete = () => {
        db.close();
      };
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };
  
  // Clear all items from the database
  const clearItems = async () => {
    try {
      const db = await initDB();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.clear();
      
      request.onsuccess = () => {
        setStatus("All items cleared");
        setData([]);
      };
      
      request.onerror = () => {
        setStatus("Error clearing items");
      };
      
      // Close the database when the transaction is complete
      transaction.oncomplete = () => {
        db.close();
      };
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };
  
  onMount(async () => {
    try {
      await initDB();
      await loadAllItems();
    } catch (error) {
      setStatus(`Error initializing database: ${error}`);
    }
  });
  
  return (
    <div class="p-4 max-w-md mx-auto bg-white rounded shadow">
      <h1 class="text-2xl font-bold mb-4">IndexedDB Example</h1>
      
      <div class="mb-4 p-2 bg-gray-100 rounded">
        <strong>Status:</strong> {status()}
      </div>
      
      <div class="mb-4">
        <div class="flex">
          <input
            type="text"
            value={newItem()}
            onInput={(e) => setNewItem(e.target.value)}
            class="flex-1 border p-2 rounded-l"
            placeholder="Enter item name"
          />
          <button
            onClick={addItem}
            class="bg-blue-500 text-white px-4 py-2 rounded-r"
          >
            Add Item
          </button>
        </div>
      </div>
      
      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-2">Items:</h2>
        {data().length === 0 ? (
          <p class="italic text-gray-500">No items</p>
        ) : (
          <ul class="border rounded divide-y">
            {data().map((item) => (
              <li class="p-2">{item}</li>
            ))}
          </ul>
        )}
      </div>
      
      <div class="mt-4">
        <button
          onClick={loadAllItems}
          class="bg-green-500 text-white px-4 py-2 rounded mr-2"
        >
          Refresh
        </button>
        <button
          onClick={clearItems}
          class="bg-red-500 text-white px-4 py-2 rounded"
        >
          Clear All
        </button>
      </div>
    </div>
  );
};

export default IndexedDBExample; 