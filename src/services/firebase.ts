import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { PlantCall } from '../types';
import { PlantAnnouncement, PlantDirectMessage } from './plantSync';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Must use firestoreDatabaseId specified in firebase-applet-config.json
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection check as required by Firebase skill
export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Optional anonymous authentication for kiosk terminals (safe fallback if disabled in console)
export async function ensureAuth(): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch {
    // If anonymous auth is not enabled in Firebase Console, operations continue in workstation mode
    return null;
  }
}

// Connection test on app load
testConnection().catch(() => {});

/**
 * Real-time listener for plant calls across ALL computers/systems
 */
export function subscribeToRemoteCalls(
  onUpdate: (calls: PlantCall[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const callsPath = 'calls';
  return onSnapshot(
    collection(db, callsPath),
    (snapshot) => {
      const remoteCalls: PlantCall[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PlantCall;
        if (data && data.id && data.status) {
          remoteCalls.push(data);
        }
      });
      // Sort newest first
      remoteCalls.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      onUpdate(remoteCalls);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, callsPath);
      if (onError) onError(error);
    }
  );
}

/**
 * Publish a new call to Firestore (instant cross-system notification)
 */
export async function createRemoteCall(call: PlantCall): Promise<void> {
  const callPath = `calls/${call.id}`;
  try {
    await ensureAuth();
    await setDoc(doc(db, 'calls', call.id), call);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, callPath);
  }
}

/**
 * Update call status (Acknowledge / Resolve / Cancel)
 */
export async function updateRemoteCall(
  callId: string,
  updates: Partial<PlantCall>
): Promise<void> {
  const callPath = `calls/${callId}`;
  try {
    await ensureAuth();
    await updateDoc(doc(db, 'calls', callId), updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, callPath);
  }
}

/**
 * Delete a specific call document
 */
export async function deleteRemoteCall(callId: string): Promise<void> {
  const callPath = `calls/${callId}`;
  try {
    await ensureAuth();
    await deleteDoc(doc(db, 'calls', callId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, callPath);
  }
}

/**
 * Clear all calls or calls for a specific line
 */
export async function clearRemoteCalls(lineId?: string): Promise<void> {
  const callsPath = 'calls';
  try {
    await ensureAuth();
    const snap = await getDocs(collection(db, callsPath));
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      const data = d.data() as PlantCall;
      if (!lineId || data.lineId === lineId) {
        batch.delete(d.ref);
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, callsPath);
  }
}

/**
 * Real-time listener for Admin broadcast announcement
 */
export function subscribeToRemoteAnnouncement(
  onUpdate: (announcement: PlantAnnouncement | null) => void
): () => void {
  const announcementDocPath = 'announcements/active';
  return onSnapshot(
    doc(db, 'announcements', 'active'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.active && data.message) {
          onUpdate({
            id: data.id || 'active',
            message: data.message,
            timestamp: data.timestamp,
            formattedTime: data.formattedTime,
          });
          return;
        }
      }
      onUpdate(null);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, announcementDocPath);
    }
  );
}

/**
 * Publish broadcast announcement to all systems
 */
export async function publishRemoteAnnouncement(announcement: PlantAnnouncement): Promise<void> {
  const announcementDocPath = 'announcements/active';
  try {
    await ensureAuth();
    await setDoc(doc(db, 'announcements', 'active'), {
      ...announcement,
      active: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, announcementDocPath);
  }
}

/**
 * Dismiss broadcast announcement across all systems
 */
export async function dismissRemoteAnnouncement(): Promise<void> {
  const announcementDocPath = 'announcements/active';
  try {
    await ensureAuth();
    await setDoc(doc(db, 'announcements', 'active'), {
      id: 'dismissed',
      message: '',
      timestamp: new Date().toISOString(),
      active: false,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, announcementDocPath);
  }
}

/**
 * Real-time listener for direct messages sent to specific lines
 */
export function subscribeToRemoteDirectMessages(
  onUpdate: (messages: Record<string, PlantDirectMessage>) => void
): () => void {
  const dmPath = 'directMessages';
  return onSnapshot(
    collection(db, dmPath),
    (snap) => {
      const messages: Record<string, PlantDirectMessage> = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.active && data.lineId) {
          messages[data.lineId] = {
            id: data.id || d.id,
            lineId: data.lineId,
            lineName: data.lineName,
            message: data.message,
            timestamp: data.timestamp,
            formattedTime: data.formattedTime,
          };
        }
      });
      onUpdate(messages);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, dmPath);
    }
  );
}

/**
 * Send direct note to a specific line
 */
export async function sendRemoteDirectMessage(msg: PlantDirectMessage): Promise<void> {
  const dmPath = `directMessages/${msg.lineId}`;
  try {
    await ensureAuth();
    await setDoc(doc(db, 'directMessages', msg.lineId), {
      ...msg,
      active: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, dmPath);
  }
}

/**
 * Dismiss direct note for a specific line
 */
export async function dismissRemoteDirectMessage(lineId: string): Promise<void> {
  const dmPath = `directMessages/${lineId}`;
  try {
    await ensureAuth();
    await setDoc(doc(db, 'directMessages', lineId), {
      id: 'dismissed',
      lineId,
      lineName: '',
      message: '',
      timestamp: new Date().toISOString(),
      active: false,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, dmPath);
  }
}
