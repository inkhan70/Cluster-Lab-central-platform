import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
const app = getApps()[0] ?? initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "cluster-lab-central-flatform.firebaseapp.com",
  projectId: "cluster-lab-central-flatform",
  storageBucket: "cluster-lab-central-flatform.firebasestorage.app",
  messagingSenderId: "2779950890",
  appId: "1:2779950890:web:0e13c288fd46a15c583853",
  measurementId: "G-KV6J5LST3M",
});
export const auth = () => getAuth(app);
