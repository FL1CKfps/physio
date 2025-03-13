import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Initialize Firebase Admin first, before anything else
let firebaseInitialized = false;

try {
  console.log('Starting Firebase initialization...');
  
  // Log environment variables status
  console.log('Environment variables check:', {
    projectId: !!process.env.FIREBASE_PROJECT_ID,
    privateKeyExists: !!process.env.FIREBASE_PRIVATE_KEY,
    clientEmailExists: !!process.env.FIREBASE_CLIENT_EMAIL
  });

  // Use hardcoded service account for testing
  const serviceAccount = {
    type: 'service_account',
    project_id: 'assistant-df14d',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC81u+kQcTXMBSu\nxu609NpoQEzUT49+y8dXolDfYWDLwdSUtNwDTfB/lxsqMT9+PfMI81ZeC9qzEPRU\nffNzDzyxvBYk90ZWOTJQpu+ZnL7mIYTgO4V5F4GnxGSX2RIr8W/dfzDoaT5wj9HF\nY9AleCDBntGaxMJlh+XQEGKeBhdOK6fNf2gNbaxaCcPUyQb/y1drVyT4mgaTuzAU\nnnEftjtyCsXlCC9DjhrOe47RILjgYkEWpJx8bqbaYUBVW1Nga2cu6bLxUyebOvMKB\nDwOilDP65TQBLsEwDLtQ1xZZota/+t2xdASVOH7J5cIp/G/Z+M2pE33yroqEjHC/\nwRrJXex/AgMBAAECggEAByIJSEeRs10mEtoBz0UGcPSo0kY1EeGJpJZFfsKTYO7v\n5DQWsWtCv9cJ2CSnFNIrOXXTl9bTynrD9+MQDJMRRFdp8LiEaCJd86zylPdWQKQY\nfE3TQ1kvdRJWiGPTK2TByHiS9Nxw1tif4FheVuP8PMQOf82Z2DLza9IKn5R0UegE\noHgLYzSayEQXEnyrMerNWeZ6PeiXGhxnFGY+1ZX+66SE8HoCFgvuUWJCYhjhFQAM\nA79D97L+zkHoUDAIOJXtSXW65CM+2Fd03Uug+cGovPmKtnhGDsIBFsYqYfMqh0UZ\ncijiLKZLGrEy+MPysdQWAvxaCx1JeK8OvwuhDNKHsQKBgQDY5EL+lWe0PvlLDFan\niyD4o0PYUygXklTXi7TAuX0Q4nzeCU8qrLvlsLkibh3Su6O8s5w7UTEXwAkikYkS\nnoHmUeufarHUY3Z7rDJVHnPRLzARU7B2Vy3B09mRQLCxB+TXiFxZunXJ2NbVaet5J\nvvsSDBAO8i9Ic+5jN3fTojGYsQKBgQDe48n/9hXK7Wulwob8K4AzleLIppmXcfcA\nZTFx0HK+r09hxqAnAoPTOTyJO0wZQ14U2N44Bln1OHs3bWkZOxJOlF44YiavEF4x\n96f75EKGcY0WTcpujonHl2Jd7MXmyjh5K/1F+WE7GQtDPAbijEBmPPTZavqR2fXb\nrSqAp+okLwKBgQCU5G5RUsN0a1679GZwcgRaa8ohcUSumdgAeHnHbA69Tp4l1wIv\n65C5543QYwO6LPIEktCHr/8hrMUYpAwTa3LLSWxtI8LnJQz5kxPPq6HRfubiXY0Z\nziUPRi4rE4f2alxhLzRJD3EKUWiECqEawy6cfwdvGzb2aA+YsPVjpY6ioQKBgCso\njGqlqd6bTmbQXfbiLXbPpRQZPlBW3u8SqRpStIU7yPEz1rr2/7Oct54S/088/jCn\nNZA/mpejEijPZLRf/dF9ZSkhyD/JuZOPUtWxgzgpMJqLAZGaxA8DvyZUvJVNvtWn\nsOklurAIz2d7bhHb+nRRhU+8KTyoqbSZuUskOHA9AoGBAMMV0tFJYkYntWShAlKs\nYEV073QTnjpSDqxVe8KRWteIxqXu8b0ZCExF0q8OJVWY6aEon78UNflqWa/dfc5j\nzsfEVKhPLOiIBPUxUWMyg+nduAVRGR5LaU2q8CkjjIzpKvg6ppNcMpsYYNtqncB8\n5s9GvQX6UXmHqPDrdy80e8+9\n-----END PRIVATE KEY-----',
    client_email: 'firebase-adminsdk-aa2fx@assistant-df14d.iam.gserviceaccount.com',
  };

  // Log private key format for debugging (first and last few characters)
  console.log('Using hardcoded service account for testing');

  // Check if Firebase is already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    // Test the connection
    await admin.app().firestore().collection('test').doc('test').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Firebase Admin initialized successfully');
    firebaseInitialized = true;
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
  console.error('Error stack:', error.stack);
  
  // More detailed error logging
  if (error.message.includes('private key')) {
    console.error('Private key validation failed. Please check the format.');
  }
  
  firebaseInitialized = false;
}

const app = express();
app.use(cors());
app.use(express.json());

// Add Firebase check middleware
const checkFirebase = (req, res, next) => {
  if (!firebaseInitialized || !admin.apps.length) {
    console.error('Firebase check failed:', {
      firebaseInitialized,
      appsLength: admin.apps.length
    });
    return res.status(503).json({
      error: 'Firebase services are temporarily unavailable',
      details: 'Server configuration issue - please try again later'
    });
  }
  next();
};

// Initialize Google OAuth client
const client = new OAuth2Client([
  process.env.GOOGLE_CLIENT_ID, 
  process.env.ANDROID_CLIENT_ID,
  process.env.WEB_CLIENT_ID
]);

// Add more detailed logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  if (req.body) console.log('Request Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Initialize OAuth client
const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: 'https://physio-j6ja.onrender.com/auth/google/callback'
});

// Initialize OAuth flow
app.get('/auth/google/init', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent screen
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    // Add state parameter for security
    state: Math.random().toString(36).substring(7)
  });
  
  console.log('Generated Auth URL:', authUrl); // Debug log
  res.json({ authUrl });
});

// Handle OAuth callback - add Firebase check middleware
app.get('/auth/google/callback', checkFirebase, async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const userInfo = await oauth2Client.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });

    // Create or get Firebase user
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(userInfo.data.email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await admin.auth().createUser({
          email: userInfo.data.email,
          displayName: userInfo.data.name,
          photoURL: userInfo.data.picture,
          emailVerified: true
        });
      } else {
        throw error;
      }
    }

    // Create custom token
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    // Redirect back to app with token
    res.redirect(`physioquantum://auth/callback?token=${customToken}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('physioquantum://auth/callback?error=Authentication failed');
  }
});

// Health check with Firebase status
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    firebase: {
      initialized: firebaseInitialized,
      appsLength: admin.apps.length
    }
  });
});

// Add a test endpoint
app.get('/api/test', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`Test endpoint hit at ${timestamp}`);
  console.log('Headers:', req.headers);
  
  res.json({ 
    message: 'Server is working properly!',
    timestamp,
    environment: process.env.NODE_ENV || 'development'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Firebase status:', {
    initialized: firebaseInitialized,
    appsLength: admin.apps.length
  });
}); 
