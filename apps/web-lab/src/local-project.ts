import type { PortableEdituberDocumentV1 } from "@edituber/contracts";
import type { ImportedCharacter } from "./character-package";
import { validatePortableDocument } from "./portable";

const DATABASE_NAME = "edituber-web-lab";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "projects";
const CHARACTER_STORE = "characters";
const CURRENT_PROJECT_KEY = "current";

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE))
        database.createObjectStore(PROJECT_STORE);
      if (!database.objectStoreNames.contains(CHARACTER_STORE))
        database.createObjectStore(CHARACTER_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
    request.onblocked = () => reject(new Error("El almacenamiento local está bloqueado"));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("La operación de guardado fue cancelada"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Falló la operación de almacenamiento"));
  });

export const loadLocalProject = async (): Promise<PortableEdituberDocumentV1 | null> => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(PROJECT_STORE).get(CURRENT_PROJECT_KEY);
    const value = await new Promise<PortableEdituberDocumentV1 | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as PortableEdituberDocumentV1 | undefined);
      request.onerror = () => reject(request.error ?? new Error("No se pudo leer el proyecto"));
    });
    await done;
    return value ? validatePortableDocument(value) : null;
  } finally {
    database.close();
  }
};

export const saveLocalProject = async (document: PortableEdituberDocumentV1): Promise<void> => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(PROJECT_STORE).put(document, CURRENT_PROJECT_KEY);
    await done;
  } finally {
    database.close();
  }
};

export const commitLocalProjectUpdate = async (
  document: PortableEdituberDocumentV1,
  apply: () => void,
  persist: (document: PortableEdituberDocumentV1) => Promise<void> = saveLocalProject,
): Promise<void> => {
  await persist(document);
  apply();
};

export const loadLocalCharacters = async (): Promise<ImportedCharacter[]> => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CHARACTER_STORE, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(CHARACTER_STORE).getAll();
    const value = await new Promise<ImportedCharacter[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ImportedCharacter[]);
      request.onerror = () =>
        reject(request.error ?? new Error("No se pudieron leer los personajes"));
    });
    await done;
    return value.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  } finally {
    database.close();
  }
};

export const saveLocalCharacter = async (character: ImportedCharacter): Promise<void> => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CHARACTER_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(CHARACTER_STORE).put(character, character.id);
    await done;
  } finally {
    database.close();
  }
};

export const deleteLocalCharacter = async (characterId: string): Promise<void> => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CHARACTER_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(CHARACTER_STORE).delete(characterId);
    await done;
  } finally {
    database.close();
  }
};
