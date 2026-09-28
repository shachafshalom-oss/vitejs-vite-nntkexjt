// מודולי Firebase מדומים שאינם Firestore — מספיק כדי שהאפליקציה תעלה ותתחבר למשתמש מדומה.
const user = { email: 'shachafshalom@gmail.com', uid: 'u_test' };
module.exports = {
  // firebase/app
  initializeApp: () => ({ __app: true }),
  // firebase/auth
  getAuth: () => ({ currentUser: user }),
  onAuthStateChanged: (_auth, cb) => { Promise.resolve().then(() => cb(user)); return () => {}; },
  signInWithEmailAndPassword: async () => ({ user }),
  signOut: async () => {},
  // firebase/messaging
  getMessaging: () => ({}),
  getToken: async () => '',
  onMessage: () => () => {},
  isSupported: async () => false,
  // firebase/storage
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytesResumable: () => ({ on: () => {} }),
  getDownloadURL: async () => '',
  deleteObject: async () => {},
};
