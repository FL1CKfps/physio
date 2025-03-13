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
  
  // Log server time for debugging
  console.log('Server time:', new Date().toISOString());
  
  // Import service account file directly
  const serviceAccountPath = new URL('./service-account-key.json', import.meta.url);
  
  console.log('Loading service account from:', serviceAccountPath.pathname);
  
  // Check if Firebase is already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath.pathname)
    });
    
    console.log('Firebase Admin initialized successfully');
    firebaseInitialized = true;
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
  console.error('Error stack:', error.stack);
  
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

// Handle OAuth callback without Firebase custom token
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const userInfo = await oauth2Client.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });

    console.log('User authenticated:', {
      email: userInfo.data.email,
      name: userInfo.data.name
    });

    // Instead of Firebase custom token, pass the Google ID token directly
    // The client can use this to sign in with Firebase's signInWithCredential
    res.redirect(`physioquantum://auth/callback?token=${tokens.id_token}&email=${encodeURIComponent(userInfo.data.email)}&name=${encodeURIComponent(userInfo.data.name)}`);
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
