import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fetch from 'node-fetch';

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

// Initialize OAuth client with Firebase Auth Handler as redirect URI
const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

// Initialize OAuth flow
app.get('/auth/google/init', (req, res) => {
  // Get the redirect URI from the request
  const redirectUri = req.query.redirect_uri || 'https://assistant-df14d.firebaseapp.com/__/auth/handler';
  console.log('Using redirect URI:', redirectUri);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent screen
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    // Add state parameter for security
    state: Math.random().toString(36).substring(7),
    // Use the redirect URI from the request
    redirect_uri: redirectUri
  });
  
  console.log('Generated Auth URL:', authUrl);
  res.json({ authUrl });
});

// Handle OAuth callback with Firebase custom token
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      console.error('No authorization code received from Google');
      return res.redirect('physioquantum://auth/callback?error=No authorization code received');
    }
    
    console.log('Exchanging authorization code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    console.log('Fetching user info from Google...');
    const userInfoResponse = await oauth2Client.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });
    const userInfo = userInfoResponse.data;

    console.log('User authenticated:', {
      email: userInfo.email,
      name: userInfo.name
    });

    // Check if Firebase is initialized before proceeding
    if (!firebaseInitialized) {
      console.error('Firebase is not initialized');
      return res.redirect('physioquantum://auth/callback?error=Firebase services unavailable');
    }

    try {
      // Create or get Firebase user
      console.log('Creating or getting Firebase user...');
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(userInfo.email);
        console.log('Existing user found:', userRecord.uid);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          userRecord = await admin.auth().createUser({
            email: userInfo.email,
            displayName: userInfo.name,
            photoURL: userInfo.picture,
            emailVerified: true
          });
          console.log('New user created:', userRecord.uid);
        } else {
          throw error;
        }
      }

      // Create custom token
      console.log('Creating Firebase custom token...');
      const customToken = await admin.auth().createCustomToken(userRecord.uid);
      console.log('Custom token created successfully');

      // Redirect back to app with token
      console.log('Redirecting to app with custom token...');
      res.redirect(`physioquantum://auth/callback?token=${customToken}&email=${encodeURIComponent(userInfo.email)}&name=${encodeURIComponent(userInfo.name)}`);
    } catch (firebaseError) {
      console.error('Firebase operation failed:', firebaseError);
      
      // Fall back to Google ID token if Firebase fails
      console.log('Falling back to Google ID token...');
      res.redirect(`physioquantum://auth/callback?token=${tokens.id_token}&email=${encodeURIComponent(userInfo.email)}&name=${encodeURIComponent(userInfo.name)}&provider=google`);
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // More detailed error logging
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    
    res.redirect(`physioquantum://auth/callback?error=${encodeURIComponent(error.message || 'Authentication failed')}`);
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

// Add a proxy endpoint for Firebase auth
app.all('/__/auth/*', async (req, res) => {
  const targetUrl = `https://assistant-df14d.firebaseapp.com/__/auth/${req.params[0]}`;
  console.log(`Proxying request to: ${targetUrl}`);
  
  // Forward the request to Firebase
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
    });
    
    // Forward the response back to the client
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    const body = await response.text();
    res.send(body);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Firebase status:', {
    initialized: firebaseInitialized,
    appsLength: admin.apps.length
  });
}); 
