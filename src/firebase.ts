import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot 
} from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD2VUHgwmFZYNLEfd3yM7DIU9TPQbTuenM",
  authDomain: "habit-heatmap-3266f.firebaseapp.com",
  projectId: "habit-heatmap-3266f",
  storageBucket: "habit-heatmap-3266f.firebasestorage.app",
  messagingSenderId: "295037542724",
  appId: "1:295037542724:web:0c44909255f7f64730b711"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// --- DATA STRUCTURE ---
// We will store everything in a single document for simplicity for a single user.
// Collection: "users" -> Document: "my_data"
// In a real multi-user app, "my_data" would be the User ID.

const USER_ID = "user_default"; 

// --- HELPER FUNCTIONS ---

// 1. Subscribe to Data (Real-time listener)
export const subscribeToData = (callback: (data: any) => void) => {
  const docRef = doc(db, "users", USER_ID);
  
  // Listen for changes
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      // If doc doesn't exist, create default structure
      const defaultData = {
        habits: [{ id: '1', name: 'Alcohol', weight: 3 }, { id: '2', name: 'Sugar', weight: 1 }],
        history: {},
        notes: {},
        settings: { startDate: new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA') }
      };
      setDoc(docRef, defaultData);
      callback(defaultData);
    }
  });
};

// 2. Save Entire State (Generic Update)
export const saveData = async (field: string, value: any) => {
  const docRef = doc(db, "users", USER_ID);
  await updateDoc(docRef, {
    [field]: value
  });
};

// 3. Clear All Data
export const clearData = async () => {
  const docRef = doc(db, "users", USER_ID);
  await setDoc(docRef, {
    habits: [],
    history: {},
    notes: {},
    settings: { startDate: new Date().toLocaleDateString('en-CA') }
  });
};