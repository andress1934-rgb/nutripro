/* Firebase initialization and sync logic - SDK loaded via CDN in HTML */

const firebaseConfig = {
  apiKey: "AIzaSyBnUDO8I6RjQTONJE01DOw6vWA_JrNmOK0",
  authDomain: "nutripro-4759a.firebaseapp.com",
  projectId: "nutripro-4759a",
  storageBucket: "nutripro-4759a.firebasestorage.app",
  messagingSenderId: "474800837737",
  appId: "1:474800837737:web:f3778dda269389f5fd3ef8"
};

let fbAuth = null, fbDb = null, fbCurrentUser = null;

function fbInit() {
  if (fbAuth) return;
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
  /* Persistencia offline: lo registrado sin señal sobrevive al cierre de la app
     y se sube solo al volver la conexión (antes esas comidas se perdían). */
  try { fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch(_) {}
  /* El listener onAuthStateChanged autoritativo vive en app.js (DOMContentLoaded).
     Tener uno aquí provocaba doble fbAutoSync() y carrera sobre S/S.diary. */
}

async function fbSignUp(email, password) {
  try {
    const res = await fbAuth.createUserWithEmailAndPassword(email, password);
    fbCurrentUser = res.user;
    return res.user;
  } catch(e) {
    throw e.message;
  }
}

async function fbSignIn(email, password) {
  try {
    const res = await fbAuth.signInWithEmailAndPassword(email, password);
    fbCurrentUser = res.user;
    return res.user;
  } catch(e) {
    throw e.message;
  }
}

async function fbResetPass(email) {
  await fbAuth.sendPasswordResetEmail(email);
}

async function fbSignOut() {
  await fbAuth.signOut();
  fbCurrentUser = null;
  /* Reinicia TODO el estado (plan, macros, nombre, métricas, agua) para que
     no se filtre al siguiente usuario en un dispositivo compartido. */
  if (typeof resetSessionState === 'function') {
    resetSessionState();
  } else {
    S.onboarded = false;
    S.diary = {};
    S.plan = null;
  }
  localStorage.removeItem('nutripro-state');
  _currentScreenId = 's-welcome';
}

async function fbSaveUserProfile() {
  if (!fbCurrentUser) return;
  const uid = fbCurrentUser.uid;
  const snap = {
    email: (fbCurrentUser && fbCurrentUser.email) || null,
    miEntreno: S.miEntreno || null,
    nombre: S.nombre, peso: S.peso, talla: S.talla, edad: S.edad, sexo: S.sexo,
    act: S.act, obj: S.obj, objLabel: S.objLabel, dietType: S.dietType,
    pesoObj: S.pesoObj, tdee: S.tdee, prot: S.prot, cho: S.cho, fat: S.fat,
    agua: S.agua, waterMeta: S.waterMeta, waterCount: S.waterCount,
    waterDate: S.waterDate || null, pesoLog: S.pesoLog || [],
    remMeals: !!S.remMeals, remWater: !!S.remWater,
    trainDone: S.trainDone || {},
    onboarded: true, ts: firebase.firestore.FieldValue.serverTimestamp()
  };
  await fbDb.collection('users').doc(uid).set(snap, { merge: true });
  /* trainDone se REEMPLAZA completo: merge:true nunca borra claves anidadas,
     así que desmarcar un ejercicio "resucitaba" al reabrir la app. */
  await fbDb.collection('users').doc(uid).update({ trainDone: S.trainDone || {} }).catch(() => {});
}

async function fbLoadUserProfile() {
  if (!fbCurrentUser) return null;
  const doc = await fbDb.collection('users').doc(fbCurrentUser.uid).get();
  return doc.exists ? doc.data() : null;
}

async function fbSaveDiary() {
  if (!fbCurrentUser || !S.diary) return;
  await fbDb.collection('users').doc(fbCurrentUser.uid).collection('diary').doc('entries').set(S.diary, { merge: true });
}

async function fbLoadDiary() {
  if (!fbCurrentUser) return {};
  const doc = await fbDb.collection('users').doc(fbCurrentUser.uid).collection('diary').doc('entries').get();
  return doc.exists ? doc.data() : {};
}

async function fbAutoSync() {
  try {
    const data = await fbLoadUserProfile();
    if (data) {
      Object.assign(S, data);
      /* waterCount ya ES el nº de vasos (no litros): sin ×4.
         Usar data.waterCount (Firestore) no S.waterCount (que tiene default 0 del objeto JS).
         Respetar 0 real (cliente nuevo); si el campo no existe en Firestore → 0. */
      waterFilled = (data.waterCount != null) ? +data.waterCount : 0;
      S.waterCount = waterFilled;
      const diary = await fbLoadDiary();
      /* No reemplazar el diario local con uno vacío de la nube */
      if (diary && Object.keys(diary).length) S.diary = { ...(S.diary || {}), ...diary };
    }
  } catch(e) {
    console.error('fbAutoSync error:', e);
    /* Re-lanzar: app.js cae al respaldo localStorage (sin esto, abrir la PWA
       sin internet mostraba el onboarding como si la cuenta estuviera vacía). */
    throw e;
  }
}
