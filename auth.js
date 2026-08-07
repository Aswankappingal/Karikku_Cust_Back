const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access Denied: No Token Provided' });
  }

  try {
    // First try to verify as Firebase ID token
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        ...decodedToken,
        customDocId: decodedToken.uid // Map to expected field
      };
      return next();
    } catch (firebaseError) {
      console.log('Not a Firebase ID token, trying custom JWT...');
    }

    // If not Firebase token, try custom JWT
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', {
      algorithms: ['HS256']
    });
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error('Token Verification Error:', err);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token Expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid Token' });
    }
    
    res.status(500).json({ message: 'Authentication Failed' });
  }
};
// Improved helper function to detect Firebase ID tokens
const isFirebaseToken = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) return false;
    
    // Firebase ID tokens have specific characteristics:
    // 1. Issued by Firebase (iss starts with https://securetoken.google.com/)
    // 2. Has 'aud' claim with your Firebase project ID
    // 3. Uses RS256 algorithm
    // 4. Has Firebase-specific claims like 'auth_time', 'firebase'
    
    const payload = decoded.payload;
    const header = decoded.header;
    
    // Check for Firebase-specific issuer
    const isFirebaseIssuer = payload.iss && payload.iss.startsWith('https://securetoken.google.com/');
    
    // Check algorithm
    const isRS256 = header.alg === 'RS256';
    
    // Check for Firebase-specific claims
    const hasFirebaseClaims = payload.auth_time !== undefined || payload.firebase !== undefined;
    
    return isFirebaseIssuer && isRS256 && hasFirebaseClaims;
  } catch (err) {
    return false; // If decode fails, assume it's not a Firebase token
  }
};

module.exports = authenticateToken;