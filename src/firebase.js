require('dotenv').config();
const admin = require('firebase-admin');

let initialized = false;
let bucket = null;

function initIfPossible() {
  if (initialized) return;

  let serviceAccount;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    }
  } catch (err) {
    // invalid JSON or require error; leave uninitialized
    serviceAccount = null;
  }

  if (!serviceAccount) {
    initialized = false;
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'policy-file'
  });

  bucket = admin.storage().bucket();
  initialized = true;
}

function getBucket() {
  initIfPossible();
  if (!bucket) throw new Error('Firebase Storage not initialized. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.');
  return bucket;
}

module.exports = { getBucket, initialized: () => initialized };
