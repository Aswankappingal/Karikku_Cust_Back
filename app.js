const express = require('express');
const app = express();
const cors = require('cors');
const firebaseAdmin = require('firebase-admin');
const multer = require('multer');
const authenticateToken = require('./auth');
const jwt = require('jsonwebtoken');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();
const { calculateCartTotals } = require('./utils/pricing');
const { sendOrderConfirmationEmail, sendOrderInTransitEmail } = require('./utils/emailService');



const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client('702774186213-vbl6f0obdqb5ep8a4b03mmqvi5g8bncg.apps.googleusercontent.com');




const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://karikku.co',
    'https://www.karikku.co',
    'https://bck.karikku.co'
];

// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
// }));

// Ultra-simple CORS for development
// app.use(cors({
//     origin: '*',
//     credentials: false,
    
// }));

// // Enable preflight for all routes
// app.options(/.*/, cors());

// FOR PRODUCTION

app.use(cors({
  origin: ['https://karikku.co','http://localhost:3005','http://localhost:3000','https://bck.karikku.co'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
}));

// optional (safe fallback)
app.options(/.*/, cors());


// const corsOptions = {
//     // origin: ['https://karikku-admin-frontend.web.app','http://localhost:3004'], // Specify your frontend origin
//     origin: '*', // Allow all origins (for development). Change this in production.
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'], // Add any custom headers if needed
//     credentials: true // Enable if frontend sends credentials (e.g., cookies)
// };
// // app.use(cors());
// app.use(cors(corsOptions));


// app.use(cors({
//     origin: '*', // Allow all origins for development, change in production
//     credentials:true, // Allow credentials
//      methods: ['GET', 'POST', 'PUT', 'DELETE']

// }));






// app.post('/contact-form', async (req, res) => {
//     try {
//         const { firstName, phone, email, message } = req.body;

//         // Validate required fields
//         if (!firstName || !phone || !email || !message) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'All fields are required'
//             });
//         }

//         // Email options - FIXED: Send FROM your business email, not customer email
//         const mailOptions = {
//             from: 'care@karikku.co', // Must be the authenticated email account
//             to: 'care@karikku.co', // Your business email
//             replyTo: email, // Customer's email goes here - replies will go to them
//             subject: `Karikku Website Form Submission. ${firstName}`,
//             html: `
//         <div style="font-family: Arial, sans-serif; padding: 20px;">
//           <h2 style="color: #333;">Karikku Website Form Submission.</h2>

//           <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
//             <p><strong>Name:</strong> ${firstName}</p>
//             <p><strong>Phone:</strong> ${phone}</p>
//             <p><strong>Email:</strong> ${email}</p>
//           </div>

//           <div style="background: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
//             <h3 style="color: #555;">Message:</h3>
//             <p style="line-height: 1.6; color: #333;">${message}</p>
//           </div>

//           <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">

//           <p style="color: #888; font-size: 12px;">
//             This email was sent from your website contact form on ${new Date().toLocaleString()}
//           </p>
//         </div>
//       `,
//             text: `
//         New Contact Form Message

//         Name: ${firstName}
//         Phone: ${phone}
//         Email: ${email}

//         Message:
//         ${message}

//         ---
//         Sent on: ${new Date().toLocaleString()}
//       `
//         };

//         // Send email
//         const info = await transporter.sendMail(mailOptions);

//         console.log('✅ Email sent successfully:', info.messageId);
//         console.log('From:', 'care@karikku.co');
//         console.log('Customer Email:', email);

//         // Send success response to frontend
//         res.status(200).json({
//             success: true,
//             message: 'Email sent successfully',
//             messageId: info.messageId,
//             timestamp: new Date().toISOString()
//         });

//     } catch (error) {
//         console.error('❌ Error sending email:', error);
//         console.error('Error details:', {
//             message: error.message,
//             code: error.code,
//             command: error.command
//         });

//         res.status(500).json({
//             success: false,
//             message: 'Failed to send email. Please try again later.',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// });

// Health check endpoint
// app.get('/health', (req, res) => {
//     res.status(200).json({ status: 'OK', message: 'Server is running' });
// });


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//                  //////////////////////////////////////////RAZORPAY////////////////////////////////////////////////////////////////////
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Your existing APIs (these look correct)
app.post("/create-order", async (req, res) => {
    const { amount } = req.body;
    const options = {
        amount: amount * 100, // Convert to paisa
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1,
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json({ orderId: order.id, amount: order.amount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/verify-payment", (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const generated_signature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (generated_signature === razorpay_signature) {
            res.json({ status: "success" });
        } else {
            res.status(400).json({ status: "failure", message: "Signature verification failed" });
        }
    } catch (error) {
        console.error("Error verifying payment:", error);
        res.status(500).json({ status: "error", message: "Internal server error" });
    }
});



// Firebase Admin Initialization
var serviceAccount = require("./firebase.json");
const { log } = require('console');

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount),
    projectId: 'karikku-b0ec4',
    storageBucket: 'gs://karikku-b0ec4.firebasestorage.app'
});

const db = firebaseAdmin.firestore();
const bucket = firebaseAdmin.storage().bucket();

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
    },
    fileFilter: (req, file, cb) => {
        // Check if file is an image
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Helper function to upload image to Firebase Storage
const uploadImageToStorage = async (file, folder = 'images') => {
    try {
        const fileName = `${folder}/${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`;
        const fileUpload = bucket.file(fileName);

        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype,
            },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error('Upload error:', error);
                reject(error);
            });

            stream.on('finish', async () => {
                try {
                    // Make the file publicly accessible
                    await fileUpload.makePublic();

                    // Get the public URL
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

                    resolve({
                        fileName: fileName,
                        publicUrl: publicUrl,
                        originalName: file.originalname
                    });
                } catch (error) {
                    reject(error);
                }
            });

            stream.end(file.buffer);
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
};

// Helper function to delete image from Firebase Storage
const deleteImageFromStorage = async (fileName) => {
    try {
        const file = bucket.file(fileName);
        await file.delete();
        console.log(`✅ Image ${fileName} deleted from storage`);
        return true;
    } catch (error) {
        console.error(`❌ Error deleting image ${fileName}:`, error);
        return false;
    }
};


app.get('/', (req, res) => {
    res.send('Hello from Express!');
});

// User Signup Endpoint - FIXED
// app.post('/signup-with-email', async (req, res) => {
//     try {
//         const { name, email, password, agreeToTerms, subscribeToEmails } = req.body;

//         // Validate input data
//         const validationErrors = [];

//         if (!name || name.trim().length < 2) {
//             validationErrors.push('Name must be at least 2 characters long');
//         }

//         if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
//             validationErrors.push('Please provide a valid email address');
//         }

//         if (!password || password.length < 6) {
//             validationErrors.push('Password must be at least 6 characters long');
//         }

//         if (validationErrors.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Validation failed',
//                 errors: validationErrors
//             });
//         }

//         // Check if terms and conditions are agreed to
//         if (!agreeToTerms) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'You must agree to the Terms and Conditions to create an account'
//             });
//         }

//         // Check if user already exists
//         const existingUserQuery = await db.collection('users')
//             .where('email', '==', email.toLowerCase().trim())
//             .get();

//         if (!existingUserQuery.empty) {
//             return res.status(409).json({
//                 success: false,
//                 message: 'An account with this email already exists'
//             });
//         }

//         // Prepare user data - FIXED: Changed isActive to active
//         const userData = {
//             userId: uuidv4(),
//             name: name.trim(),
//             email: email.toLowerCase().trim(),
//             password: password, // Store password as plain string
//             agreeToTerms: agreeToTerms === true || agreeToTerms === 'true',
//             subscribeToEmails: subscribeToEmails === true || subscribeToEmails === 'true',
//             createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
//             active: true, // FIXED: This was the issue
//             delete: false,
//             cart: [],
//             wishlist: [],
//             emailVerified: false,
//             profile: {
//                 firstName: name.trim().split(' ')[0] || '',
//                 lastName: name.trim().split(' ').slice(1).join(' ') || '',
//                 profilePicture: null,
//                 bio: null,
//                 location: null,
//                 phone: null
//             },
//             preferences: {
//                 notifications: {
//                     email: subscribeToEmails === true || subscribeToEmails === 'true',
//                     push: false,
//                     sms: false
//                 },
//                 privacy: {
//                     profileVisible: true,
//                     emailVisible: false
//                 }
//             },
//             metadata: {
//                 signupSource: 'web',
//                 ipAddress: req.ip || req.connection.remoteAddress,
//                 userAgent: req.get('User-Agent') || 'Unknown'
//             }
//         };

//         // Add user to Firestore
//         const docRef = await db.collection('users').add(userData);

//         console.log(`✅ New user created with ID: ${docRef.id}, Email: ${email}`);

//         // Send response (don't include password in response)
//         const responseData = { ...userData };
//         delete responseData.password;

//         res.status(201).json({
//             success: true,
//             message: 'User account created successfully',
//             userId: userData.userId,
//             documentId: docRef.id,
//             user: {
//                 userId: userData.userId,
//                 name: userData.name,
//                 email: userData.email,
//                 agreeToTerms: userData.agreeToTerms,
//                 subscribeToEmails: userData.subscribeToEmails,
//                 createdAt: new Date().toISOString(),
//                 active: userData.active, // FIXED: Changed from isActive to active
//                 emailVerified: userData.emailVerified
//             }
//         });

//     } catch (error) {
//         console.error('❌ Error creating user account:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to create user account. Please try again.',
//             error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//         });
//     }
// });

// app.post('/signup-with-email', async (req, res) => {
//     try {
//         const { name, email, password, agreeToTerms, subscribeToEmails } = req.body;

//         // Validation
//         const validationErrors = [];
//         if (!name || name.trim().length < 2) validationErrors.push('Name must be at least 2 characters');
//         if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validationErrors.push('Invalid email');
//         if (!password || password.length < 6) validationErrors.push('Password must be at least 6 characters');

//         if (validationErrors.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Validation failed',
//                 errors: validationErrors
//             });
//         }

//         if (!agreeToTerms) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'You must agree to the Terms and Conditions'
//             });
//         }

//         // Check if user exists
//         const existingUserQuery = await db.collection('users')
//             .where('email', '==', email.toLowerCase().trim())
//             .get();

//         if (!existingUserQuery.empty) {
//             return res.status(409).json({
//                 success: false,
//                 message: 'Email already exists'
//             });
//         }

//         // Create user
//         const userData = {
//             userId: uuidv4(),
//             name: name.trim(),
//             email: email.toLowerCase().trim(),
//             password: password,
//             agreeToTerms: agreeToTerms === true || agreeToTerms === 'true',
//             subscribeToEmails: subscribeToEmails === true || subscribeToEmails === 'true',
//             createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
//             active: true,
//             delete: false,
//             cart: [],
//             wishlist: [],
//             emailVerified: false,
//             profile: {
//                 firstName: name.trim().split(' ')[0] || '',
//                 lastName: name.trim().split(' ').slice(1).join(' ') || '',
//                 profilePicture: null
//             }
//         };

//         const docRef = await db.collection('users').add(userData);

//         // Generate token
//         const token = jwt.sign(
//             {
//                 userId: userData.userId,
//                 email: userData.email,
//                 customDocId: docRef.id
//             },
//             process.env.JWT_SECRET || 'your-secret-key',
//             { algorithm: 'HS256', expiresIn: '24h' }
//         );

//         const responseData = { ...userData };
//         delete responseData.password;

//         res.status(201).json({
//             success: true,
//             message: 'User created successfully',
//             token: token,
//             user: responseData
//         });

//     } catch (error) {
//         console.error('❌ Signup error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to create user',
//             error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//         });
//     }
// });

app.post('/signup-with-email', async (req, res) => {
    try {
        const { name, email, password, agreeToTerms, subscribeToEmails } = req.body;

        // Fetch settings document to get next user ID
        const settingsRef = db.collection('settings').doc('global');
        const settingsDoc = await settingsRef.get();

        if (!settingsDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Settings document not found'
            });
        }

        const settings = settingsDoc.data();

        // Check if user object exists in settings, if not initialize it
        const nextUserId = settings.user?.userId || 1;
        const userId = `U${nextUserId}`;

        // Validation
        const validationErrors = [];
        if (!name || name.trim().length < 2) validationErrors.push('Name must be at least 2 characters');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validationErrors.push('Invalid email');
        if (!password || password.length < 6) validationErrors.push('Password must be at least 6 characters');

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        if (!agreeToTerms) {
            return res.status(400).json({
                success: false,
                message: 'You must agree to the Terms and Conditions'
            });
        }

        // Check if user exists
        const existingUserQuery = await db.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .get();

        if (!existingUserQuery.empty) {
            return res.status(409).json({
                success: false,
                message: 'Email already exists'
            });
        }

        // Create user data
        const userData = {
            userId: userId,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: password,
            addresses: [],
            agreeToTerms: agreeToTerms === true || agreeToTerms === 'true',
            subscribeToEmails: subscribeToEmails === true || subscribeToEmails === 'true',
            createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            active: true,
            delete: false,
            cart: [],
            wishlist: [],
            emailVerified: false,
            profile: {
                firstName: name.trim().split(' ')[0] || '',
                lastName: name.trim().split(' ').slice(1).join(' ') || '',
                profilePicture: null
            }
        };

        // Start a batch operation to ensure data consistency
        const batch = db.batch();

        // Add user to Firestore with custom document ID
        const userRef = db.collection('users').doc(userId);
        batch.set(userRef, userData);

        // Update settings with incremented userId for next user
        batch.update(settingsRef, {
            'user.userId': firebaseAdmin.firestore.FieldValue.increment(1)
        });

        // Commit the batch
        await batch.commit();

        // Generate token
        const token = jwt.sign(
            {
                userId: userData.userId,
                email: userData.email,
                customDocId: userId
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { algorithm: 'HS256', expiresIn: '24h' }
        );

        const responseData = { ...userData };
        delete responseData.password;

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            token: token,
            user: responseData,
            documentId: userRef.id
        });

    } catch (error) {
        console.error('❌ Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// sign-up-with-google



app.post('/sign-up-with-google', async (req, res) => {
    const { token } = req.body;

    try {
        // Verify the Google token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: [
                '702774186213-vbl6f0obdqb5ep8a4b03mmqvi5g8bncg.apps.googleusercontent.com'
            ],
        });

        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        // Check if user already exists
        const usersQuery = await db.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .where('delete', '==', false)
            .get();

        let userData;

        if (!usersQuery.empty) {
            // User exists - login
            const existingUserDoc = usersQuery.docs[0];
            userData = existingUserDoc.data();

            // Update last login timestamp
            await existingUserDoc.ref.update({
                lastLoginAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
            });

            // Generate JWT token
            const authToken = jwt.sign(
                {
                    userId: userData.userId,
                    email: userData.email,
                    customDocId: existingUserDoc.id
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { algorithm: 'HS256', expiresIn: '24h' }
            );

            // Remove password from response
            const responseData = { ...userData };
            delete responseData.password;

            return res.status(200).json({
                success: true,
                message: 'User login successful',
                user: responseData,
                token: authToken
            });
        }

        // User doesn't exist - create new user
        // Get settings document to get next user ID
        const settingsRef = db.collection('settings').doc('global');
        const settingsDoc = await settingsRef.get();

        if (!settingsDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Settings document not found'
            });
        }

        const settings = settingsDoc.data();
        const nextUserId = settings.user?.userId || 1;
        const userId = `U${nextUserId}`;

        // Generate search array for name
        const generateSearchArray = (name) => {
            const searchArray = [];
            for (let i = 0; i < name.length; i++) {
                for (let j = i; j < name.length; j++) {
                    searchArray.push(name.slice(i, j + 1).toUpperCase());
                }
            }
            return searchArray;
        };

        const searchArray = generateSearchArray(name);

        // Create new user data
        const newUserData = {
            userId: userId,
            name: name || '',
            email: email.toLowerCase().trim(),
            password: null, // No password for Google auth users
            addresses: [],
            agreeToTerms: true, // Assumed true for Google sign-up
            subscribeToEmails: false, // Default false, can be updated later
            createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            lastLoginAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            active: true,
            delete: false,
            cart: [],
            wishlist: [],
            emailVerified: true, // Google emails are considered verified
            authProvider: 'google', // Track auth provider
            googleId: payload.sub, // Store Google ID
            profile: {
                firstName: name ? name.split(' ')[0] : '',
                lastName: name ? name.split(' ').slice(1).join(' ') : '',
                profilePicture: picture || null
            },
            search: searchArray
        };

        // Start a batch operation for data consistency
        const batch = db.batch();

        // Add user to Firestore
        const userRef = db.collection('users').doc(userId);
        batch.set(userRef, newUserData);

        // Update settings with incremented userId
        batch.update(settingsRef, {
            'user.userId': firebaseAdmin.firestore.FieldValue.increment(1)
        });

        // Commit the batch
        await batch.commit();

        // Generate JWT token
        const authToken = jwt.sign(
            {
                userId: newUserData.userId,
                email: newUserData.email,
                customDocId: userId
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { algorithm: 'HS256', expiresIn: '24h' }
        );

        // Remove password from response
        const responseData = { ...newUserData };
        delete responseData.password;

        res.status(201).json({
            success: true,
            message: 'User signed up successfully with Google',
            user: responseData,
            token: authToken
        });

    }
    catch (error) {
        console.error('Error verifying Google token:', error);

        // More specific error messages
        if (error.message?.includes('Token used too early')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid token timing. Please try again.'
            });
        }

        if (error.message?.includes('Invalid token')) {
            return res.status(400).json({
                success: false,
                error: 'Token verification failed. Please try again.'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to sign up with Google. Please try again.'
        });
    }
});





////end


// login-user Endpoint - FIXED
// app.post('/login-user', async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // Validate input data
//         const validationErrors = [];

//         if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
//             validationErrors.push('Please provide a valid email address');
//         }

//         if (!password || password.trim().length === 0) {
//             validationErrors.push('Password is required');
//         }

//         if (validationErrors.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Validation failed',
//                 errors: validationErrors
//             });
//         }

//         // Find user by email
//         const userQuery = await db.collection('users')
//             .where('email', '==', email.toLowerCase().trim())
//             .where('delete', '==', false) // ADDED: Check that user is not deleted
//             .get();

//         if (userQuery.empty) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'Invalid email or password'
//             });
//         }

//         const userDoc = userQuery.docs[0];
//         const userData = userDoc.data();

//         // FIXED: Check if user account is active (changed from isActive to active)
//         if (!userData.active) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'Your account has been deactivated. Please contact support.'
//             });
//         }

//         // Verify password (plain text comparison since no bcrypt used)
//         if (userData.password !== password) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'Invalid email or password'
//             });
//         }

//         // Update last login timestamp
//         await userDoc.ref.update({
//             lastLoginAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         });

//         // Create custom token for Firebase Auth
//         const customToken = await firebaseAdmin.auth().createCustomToken(userData.userId, {
//             email: userData.email,
//             name: userData.name,
//             emailVerified: userData.emailVerified
//         });

//         console.log(`✅ User logged in successfully: ${email}`);

//         // Send response (don't include password)
//         res.status(200).json({
//             success: true,
//             message: 'Login successful',
//             token: customToken,
//             user: {
//                 userId: userData.userId,
//                 name: userData.name,
//                 email: userData.email,
//                 active: userData.active, // FIXED: Changed from isActive to active
//                 emailVerified: userData.emailVerified,
//                 profile: userData.profile,
//                 preferences: userData.preferences,
//                 createdAt: userData.createdAt,
//                 lastLoginAt: new Date().toISOString()
//             }
//         });

//     } catch (error) {
//         console.error('❌ Error during user login:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Login failed. Please try again.',
//             error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//         });
//     }
// });

app.post('/login-user', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        const validationErrors = [];
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validationErrors.push('Invalid email');
        if (!password || password.trim().length === 0) validationErrors.push('Password is required');

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Find user
        const userQuery = await db.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .where('delete', '==', false)
            .get();

        if (userQuery.empty) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();

        if (!userData.active) {
            return res.status(401).json({
                success: false,
                message: 'Account deactivated'
            });
        }

        if (userData.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Update last login
        await userDoc.ref.update({
            lastLoginAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        // Generate token
        const token = jwt.sign(
            {
                userId: userData.userId,
                email: userData.email,
                customDocId: userDoc.id
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { algorithm: 'HS256', expiresIn: '24h' }
        );

        const responseData = { ...userData };
        delete responseData.password;

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: token,
            user: responseData
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

///login-with-mobiile-num

// Updated API credentials
const https = require('https'); // ADD THIS IMPORT AT THE TOP

const AUTH_KEY = '473869AY0w26u457Y6911d33dP1'; // Replace with your MSG91 Auth Key
const TEMPLATE_ID = '69170f3acd366e4a7e662fc8'; // Replace with your MSG91 Template ID
const OTP_EXPIRY = '5'; // OTP expiry in minutes
const OTP_LENGTH = '4'; // Set OTP length to 4 digits

// Helper function for mobile number validation
function validateMobileNumber(mobileNumber) {
    const mobileRegex = /^[6-9]\d{9}$/;
    return mobileRegex.test(mobileNumber);
}

// Helper function to send OTP via MSG91
function sendOTPViaMSG91(mobileNumber, templateId, authKey, otpExpiry, otpLength) {
    return new Promise((resolve, reject) => {

        const fullMobile = "91" + mobileNumber;

        const options = {
            method: 'POST',
            hostname: 'control.msg91.com',
            port: 443,
            path: `/api/v5/otp?otp_expiry=${otpExpiry}&template_id=${templateId}&mobile=${fullMobile}&otp_length=${otpLength}`,
            headers: {
                'authkey': authKey,
                'content-type': 'application/json'
            }
        };

        const req = https.request(options, function (res) {
            const chunks = [];

            res.on('data', function (chunk) {
                chunks.push(chunk);
            });

            res.on('end', function () {
                const body = Buffer.concat(chunks);
                console.log('📥 MSG91 Send OTP Response:', body.toString());

                try {
                    const response = JSON.parse(body.toString());

                    if (res.statusCode === 200 && response.type === 'success') {
                        resolve(response);
                    } else {
                        reject(new Error(response.message || 'Failed to send OTP'));
                    }
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    reject(new Error('Invalid response from MSG91: ' + body.toString()));
                }
            });
        });

        req.on('error', function (error) {
            console.error('Request error:', error);
            reject(error);
        });

        req.write(JSON.stringify({}));
        req.end();
    });
}

// Helper function to verify OTP via MSG91
function verifyOTPViaMSG91(mobileNumber, otp, authKey) {
    return new Promise((resolve, reject) => {

        fullMobile = "91" + mobileNumber;

        const options = {
            method: 'GET',
            hostname: 'control.msg91.com',
            port: 443,
            path: `/api/v5/otp/verify?otp=${otp}&mobile=${fullMobile}`,
            headers: {
                'authkey': authKey
            }
        };

        const req = https.request(options, function (res) {
            const chunks = [];

            res.on('data', function (chunk) {
                chunks.push(chunk);
            });

            res.on('end', function () {
                const body = Buffer.concat(chunks);
                console.log('📥 MSG91 Verify OTP Response:', body.toString());

                try {
                    const response = JSON.parse(body.toString());

                    if (res.statusCode === 200 && response.type === 'success') {
                        resolve(response);
                    } else {
                        reject(new Error(response.message || 'OTP verification failed'));
                    }
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    reject(new Error('Invalid response from MSG91: ' + body.toString()));
                }
            });
        });

        req.on('error', function (error) {
            console.error('Request error:', error);
            reject(error);
        });

        req.end();
    });
}

// ====================================
// ROUTE 1: Check Mobile & Send OTP
// ====================================
app.post("/check-mobile-send-otp", async (req, res) => {
    try {
        const { mobileNumber } = req.body;

        console.log('📱 Received mobile number:', mobileNumber);

        // Validate input
        if (!mobileNumber) {
            return res.status(400).json({
                success: false,
                message: 'Mobile number is required'
            });
        }

        // Validate mobile number format
        if (!validateMobileNumber(mobileNumber)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid mobile number format. Please enter a valid 10-digit mobile number'
            });
        }

        // Check if user exists in Firebase
        const userQuery = await db.collection('users')
            .where('mobileNumber', '==', mobileNumber)
            .where('active', '==', true)
            .where('delete', '==', false)
            .get();

        let userExists = !userQuery.empty;

        // Send OTP using MSG91 API with 4 digit length
        console.log('📤 Sending 4-digit OTP to:', mobileNumber);

        const otpResponse = await sendOTPViaMSG91(
            mobileNumber,
            TEMPLATE_ID,
            AUTH_KEY,
            OTP_EXPIRY,
            OTP_LENGTH
        );

        console.log('✅ OTP sent successfully:', otpResponse);

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            otpSession: otpResponse.request_id || null,
            mobileNumber: mobileNumber,
            userExists: userExists,
            isNewUser: !userExists
        });

    } catch (error) {
        console.error('❌ Check mobile and send OTP error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to send OTP. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ====================================
// ROUTE 2: Verify OTP
// ====================================
app.post("/verify-otp", async (req, res) => {
    try {
        const { otp, mobileNumber } = req.body;

        console.log('🔍 Received OTP verification request:', { otp, mobileNumber });

        // Input validation
        if (!otp || !mobileNumber) {
            return res.status(400).json({
                success: false,
                message: 'OTP and mobile number are required'
            });
        }

        // Validate 4-digit OTP
        if (!/^\d{4}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP format. Please enter 4 digits.'
            });
        }

        // Verify OTP with MSG91 API
        console.log('🌐 Calling MSG91 OTP verification API');

        const verifyResponse = await verifyOTPViaMSG91(
            mobileNumber,
            otp,
            AUTH_KEY
        );

        console.log('✅ OTP verified successfully');

        try {
            // Check if user exists in database - search by phone
            console.log('🔍 Checking if user exists for mobile:', mobileNumber);
            const userQuery = await db.collection('users')
                .where('phone', '==', mobileNumber)
                .get();

            console.log('📊 User query result - Empty:', userQuery.empty, 'Size:', userQuery.size);

            if (!userQuery.empty) {
                // --- Existing user: Login
                console.log('👤 Existing user found, logging in...');
                const userDoc = userQuery.docs[0];
                const userData = userDoc.data();

                const payload = {
                    userId: userData.userId,
                    customDocId: userDoc.id,
                    name: userData.name || userData.fullName || 'User',
                    mobileNumber: userData.phone,
                    phone: userData.phone,
                    email: userData.email || null
                };

                const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

                return res.status(200).json({
                    success: true,
                    message: 'Login successful',
                    token,
                    user: {
                        userId: userData.userId,
                        id: userDoc.id,
                        name: userData.name || userData.fullName,
                        mobileNumber: userData.phone,
                        phone: userData.phone,
                        email: userData.email || null,
                        fullName: userData.fullName || userData.name
                    },
                    isNewUser: false
                });

            } else {
                // --- New user: Create user document
                console.log('🆕 New user detected, creating user...');

                const { v4: uuidv4 } = require('uuid');
                const userId = uuidv4();
                const defaultName = `User${Math.floor(1000 + Math.random() * 9000)}`;

                const newUser = {
                    userId: userId,
                    name: defaultName,
                    phone: mobileNumber,
                    mobileNumber: mobileNumber,
                    fullName: defaultName,
                    email: null,
                    password: null,
                    agreeToTerms: true,
                    subscribeToEmails: false,
                    createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
                    active: true,
                    addresses: [],
                    delete: false,
                    cart: [],
                    wishlist: [],
                    emailVerified: false,
                    phoneVerified: true,
                    profile: {
                        firstName: defaultName,
                        lastName: '',
                        profilePicture: null
                    },
                    isDefault: false,
                    country: "India",
                    city: "",
                    addressType: "",
                    addressLine1: "",
                    addressLine2: "",
                    zipCode: ""
                };

                console.log('📝 Creating new user with data');

                const userRef = await db.collection('users').add(newUser);
                console.log(`✅ New user created with ID: ${userRef.id}`);

                const payload = {
                    userId: userId,
                    customDocId: userRef.id,
                    name: newUser.name,
                    mobileNumber: newUser.phone,
                    phone: newUser.phone,
                    email: null
                };

                const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

                return res.status(200).json({
                    success: true,
                    message: 'User created and logged in successfully',
                    token,
                    user: {
                        userId: userId,
                        id: userRef.id,
                        name: newUser.name,
                        mobileNumber: newUser.phone,
                        phone: newUser.phone,
                        email: null,
                        fullName: newUser.fullName
                    },
                    isNewUser: true
                });
            }

        } catch (dbError) {
            console.error('❌ Database operation error:', dbError);
            return res.status(500).json({
                success: false,
                message: 'Database error occurred during user management',
                error: process.env.NODE_ENV === 'development' ? dbError.message : 'Database error'
            });
        }

    } catch (error) {
        console.error('❌ OTP verification error:', error);
        console.error('Error stack:', error.stack);

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify OTP. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ====================================
// ROUTE 2: Verify OTP
// ====================================



// const verifyFirebaseCustomToken = async (req, res, next) => {
//     try {
//         const authHeader = req.headers.authorization;

//         if (!authHeader || !authHeader.startsWith('Bearer ')) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'No valid authorization token provided'
//             });
//         }

//         const idToken = authHeader.split('Bearer ')[1];

//         // Use Firebase Admin SDK to verify the ID token (not custom token)
//         const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

//         req.user = {
//             uid: decodedToken.uid,
//             email: decodedToken.email,
//             name: decodedToken.name,
//             emailVerified: decodedToken.email_verified || false,
//             customClaims: decodedToken,
//             // Add the customDocId that your add-to-cart route expects
//             customDocId: decodedToken.uid // or however you determine the document ID
//         };

//         next();
//     } catch (error) {
//         console.error('❌ Firebase token verification error:', error);

//         // Handle specific Firebase Auth errors
//         if (error.code === 'auth/id-token-expired') {
//             return res.status(401).json({
//                 success: false,
//                 message: 'Token expired'
//             });
//         }

//         if (error.code === 'auth/id-token-revoked') {
//             return res.status(401).json({
//                 success: false,
//                 message: 'Token revoked'
//             });
//         }

//         if (error.code === 'auth/invalid-id-token') {
//             return res.status(401).json({
//                 success: false,
//                 message: 'Invalid token format'
//             });
//         }

//         return res.status(401).json({
//             success: false,
//             message: 'Invalid or expired token'
//         });
//     }
// };


// // Example protected route
// app.get('/protected', verifyFirebaseToken, (req, res) => {
//     res.json({
//         success: true,
//         message: 'Access granted to protected route',
//         user: req.user
//     });
// });

// // Additional endpoint to get user profile
// app.get('/user/profile', verifyFirebaseToken, async (req, res) => {
//     try {
//         const userId = req.user.uid;

//         const userQuery = await db.collection('users')
//             .where('userId', '==', userId)
//             .where('delete', '==', false)
//             .get();

//         if (userQuery.empty) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'User not found'
//             });
//         }

//         const userData = userQuery.docs[0].data();

//         // Remove sensitive data
//         delete userData.password;

//         res.json({
//             success: true,
//             user: userData
//         });

//     } catch (error) {
//         console.error('❌ Error fetching user profile:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch user profile'
//         });
//     }
// });

// GET ALL PRODUCTS

const processProductImages = async (images) => {
    if (!images || images.length === 0) return [];

    try {
        const processedImages = await Promise.all(
            images.map(async (img, index) => {
                try {
                    // Handle different image object structures
                    let imageUrl = '';

                    if (img.publicUrl) {
                        imageUrl = img.publicUrl;
                    } else if (img.url) {
                        imageUrl = img.url;
                    } else if (img.downloadURL) {
                        imageUrl = img.downloadURL;
                    } else if (img.fileName) {
                        // Generate signed URL for private storage
                        try {
                            const bucket = admin.storage().bucket();
                            const file = bucket.file(`products/${img.fileName}`);

                            const [signedUrl] = await file.getSignedUrl({
                                action: 'read',
                                expires: Date.now() + 60 * 60 * 1000, // 1 hour
                            });

                            imageUrl = signedUrl;
                        } catch (signedUrlError) {
                            console.error(`Error generating signed URL for ${img.fileName}:`, signedUrlError);
                            imageUrl = null;
                        }
                    }

                    return {
                        id: index,
                        url: imageUrl,
                        publicUrl: imageUrl,
                        signedUrl: imageUrl,
                        fileName: img.fileName || `image_${index}`,
                        originalName: img.originalName || img.fileName || `image_${index}`,
                        isValid: Boolean(imageUrl)
                    };
                } catch (error) {
                    console.error(`Error processing image ${index}:`, error);
                    return {
                        id: index,
                        url: null,
                        publicUrl: null,
                        signedUrl: null,
                        fileName: img.fileName || `image_${index}`,
                        originalName: img.originalName || img.fileName || `image_${index}`,
                        isValid: false,
                        error: 'Failed to process image'
                    };
                }
            })
        );

        // Filter out invalid images
        return processedImages.filter(img => img.isValid);
    } catch (error) {
        console.error('Error processing images:', error);
        return images; // Return original images if processing fails
    }
};
// OG
// app.get('/getAllProducts', async (req, res) => {
//     try {
//         const snapshot = await db.collection('products')
//             .where('active', '==', true)
//             .where('delete', '==', false)
//             .orderBy('createdAt', 'desc')
//             .get();

//         if (snapshot.empty) {
//             return res.status(200).json({
//                 success: true,
//                 products: [],
//                 total: 0,
//                 message: 'No products found'
//             });
//         }

//         const products = await Promise.all(
//             snapshot.docs.map(async (doc) => {
//                 const data = doc.data();

//                 // Process images with improved error handling
//                 let processedImages = [];
//                 let primaryImageUrl = '';

//                 if (data.images && Array.isArray(data.images) && data.images.length > 0) {
//                     processedImages = await processProductImages(data.images);

//                     // Set primary image
//                     if (processedImages.length > 0) {
//                         primaryImageUrl = processedImages[0].url || processedImages[0].publicUrl || '';
//                     }
//                 } else if (data.primaryImage) {
//                     // Use existing primary image if no images array
//                     primaryImageUrl = data.primaryImage;
//                     processedImages = [{
//                         id: 0,
//                         url: data.primaryImage,
//                         publicUrl: data.primaryImage,
//                         signedUrl: data.primaryImage,
//                         fileName: 'primary_image',
//                         originalName: 'primary_image',
//                         isValid: true
//                     }];
//                 }

//                 // Calculate availability status
//                 const quantity = data.quantity || data.stock || 0;
//                 let availability = 'In stock';
//                 if (quantity === 0) {
//                     availability = 'Out of stock';
//                 } else if (quantity < 5) {
//                     availability = 'Low stock';
//                 }

//                 return {
//                     id: doc.id,
//                     productId: doc.id,
//                     name: data.name || 'Unknown Product',
//                     description: data.description || '',
//                     features: data.features || '',
//                     price: data.price || 0,
//                     quantity: quantity,
//                     stock: data.stock || quantity,
//                     categoryName: data.categoryName || 'Uncategorized',
//                     categoryId: data.categoryId || '',
//                     offerPercentage: data.offerPercentage || 0,
//                     shelfLife: data.shelfLife || '',
//                     certification: data.certification || '',
//                     storageInstruction: data.storageInstruction || '',
//                     mrp: data.mrp || null,
//                     sellingPrice: data.sellingPrice || data.price || 0,
//                     sku: data.sku || '',
//                     barcode: data.barcode || '',
//                     weight: data.weight || '',
//                     variants: data.variants || [],
//                     dietType: data.dietType || 'Veg',
//                     ingredients: data.ingredients || '',
//                     nutritionFacts: data.nutritionFacts || '',
//                     // Image data
//                     primaryImage: primaryImageUrl,
//                     imageUrl: primaryImageUrl, // For frontend compatibility
//                     images: processedImages,
//                     imageCount: processedImages.length,
//                     // Status
//                     active: data.active !== undefined ? data.active : true,
//                     availability: availability,
//                     // Timestamps
//                     createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
//                     updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
//                 };
//             })
//         );

//         res.status(200).json({
//             success: true,
//             products: products,
//             total: products.length,
//             timestamp: new Date().toISOString()
//         });
//     } catch (error) {
//         console.error('Error getting products:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to get products',
//             error: error.message,
//             timestamp: new Date().toISOString()
//         });
//     }
// });

app.get('/getAllProducts', async (req, res) => {
    try {
        const snapshot = await db.collection('products')
            .where('active', '==', true)
            .where('delete', '==', false)
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({
                success: true,
                products: [],
                total: 0,
                message: 'No products found'
            });
        }

        const products = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const data = doc.data();

                // Process main product images
                let processedImages = [];
                let primaryImageUrl = '';

                if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                    processedImages = data.images.map((img, index) => ({
                        id: index,
                        url: img.url || img.publicUrl || img,
                        publicUrl: img.publicUrl || img.url || img,
                        signedUrl: img.url || img.publicUrl || img,
                        fileName: img.fileName || `image_${index}`,
                        originalName: img.originalName || img.fileName || `image_${index}`,
                        isValid: true
                    }));

                    primaryImageUrl = processedImages[0].url;
                } else if (data.primaryImage) {
                    primaryImageUrl = data.primaryImage;
                    processedImages = [{
                        id: 0,
                        url: data.primaryImage,
                        publicUrl: data.primaryImage,
                        signedUrl: data.primaryImage,
                        fileName: 'primary_image',
                        originalName: 'primary_image',
                        isValid: true
                    }];
                }

                // Process variant combinations with their images
                let processedVariantCombinations = [];
                if (data.hasVariants && data.variantCombinations && Array.isArray(data.variantCombinations)) {
                    processedVariantCombinations = data.variantCombinations.map((combo, index) => {
                        // Process variant-specific images
                        let variantImages = [];
                        if (combo.images && Array.isArray(combo.images) && combo.images.length > 0) {
                            variantImages = combo.images.map((img, imgIndex) => ({
                                id: imgIndex,
                                url: img.url || img.publicUrl || img,
                                publicUrl: img.publicUrl || img.url || img,
                                fileName: img.fileName || `variant_image_${imgIndex}`,
                                originalName: img.originalName || img.fileName || `variant_image_${imgIndex}`
                            }));
                        }

                        // Calculate availability for this variant
                        const variantQuantity = combo.quantity || 0;
                        let variantAvailability = 'In stock';
                        if (variantQuantity === 0) {
                            variantAvailability = 'Out of stock';
                        } else if (variantQuantity < 5) {
                            variantAvailability = 'Low stock';
                        }

                        return {
                            ...combo,
                            variantId: combo.variantId || `${doc.id}_V${(index + 1).toString().padStart(2, '0')}`,
                            price: combo.price || 0,
                            quantity: variantQuantity,
                            sku: combo.sku || `${data.sku || doc.id}-V${index + 1}`,
                            images: variantImages,
                            primaryImage: combo.primaryImage || (variantImages.length > 0 ? variantImages[0].url : primaryImageUrl),
                            imageCount: variantImages.length,
                            availability: variantAvailability,
                            active: combo.active !== undefined ? combo.active : true
                        };
                    });
                }

                // Calculate overall availability
                let quantity = 0;
                let availability = 'In stock';

                if (data.hasVariants && processedVariantCombinations.length > 0) {
                    // For products with variants, sum up all variant quantities
                    quantity = processedVariantCombinations.reduce((sum, combo) => sum + (combo.quantity || 0), 0);

                    if (quantity === 0) {
                        availability = 'Out of stock';
                    } else if (quantity < 5) {
                        availability = 'Low stock';
                    }
                } else {
                    // For products without variants
                    quantity = data.quantity || data.stock || 0;
                    if (quantity === 0) {
                        availability = 'Out of stock';
                    } else if (quantity < 5) {
                        availability = 'Low stock';
                    }
                }

                return {
                    id: doc.id,
                    productId: data.productId || doc.id,
                    customId: data.customId || data.productId || doc.id,
                    name: data.name || 'Unknown Product',
                    description: data.description || '',
                    features: data.features || '',

                    // Variant handling
                    hasVariants: data.hasVariants || false,
                    variants: data.variants || [],
                    variantCombinations: processedVariantCombinations,

                    // Pricing (for non-variant products or base price)
                    price: data.price || 0,
                    mrp: data.mrp || null,
                    sellingPrice: data.sellingPrice || data.price || 0,
                    offerPercentage: data.offerPercentage || 0,
                    taxPercentage: data.taxPercentage || data.gst || 0,
                    gst: data.gst || data.taxPercentage || 0,

                    // Inventory
                    quantity: quantity,
                    stock: data.stock || quantity,
                    sku: data.sku || doc.id,
                    barcode: data.barcode || '',

                    // Category
                    categoryName: data.categoryName || 'Uncategorized',
                    categoryId: data.categoryId || '',

                    // Product details
                    shelfLife: data.shelfLife || '',
                    certification: data.certification || '',
                    storageInstruction: data.storageInstruction || '',
                    weight: data.weight || '',
                    fssai: data.fssai || '',
                    dietType: data.dietType || 'Veg',
                    ingredients: data.ingredients || '',
                    nutritionFacts: data.nutritionFacts || '',

                    // SEO fields
                    pageTitle: data.pageTitle || data.name || '',
                    metaDescription: data.metaDescription || data.description || '',
                    url: data.url || '',
                    videoLink: data.videoLink || '',

                    // Images
                    primaryImage: primaryImageUrl || data.variantCombinations?.[0]?.primaryImage || primaryImageUrl,
                    imageUrl: primaryImageUrl, // For frontend compatibility
                    images: processedImages,
                    imageCount: processedImages.length,

                    // Status
                    active: data.active !== undefined ? data.active : true,
                    availability: availability,
                    exclusive: data.exclusive || false,
                    merchandise: data.merchandise || false,

                    // Metadata
                    addedBy: data.addedBy || '',
                    addedByEmail: data.addedByEmail || '',

                    // Timestamps
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
                };
            })
        );

        res.status(200).json({
            success: true,
            products: products,
            total: products.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get products',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get single product with improved error handling
app.get('/getProduct/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        const doc = await db.collection('products').doc(productId).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const data = doc.data();

        // Check if product is active and not deleted
        if (!data.active || data.delete) {
            return res.status(404).json({
                success: false,
                message: 'Product not available'
            });
        }

        // Process images
        let processedImages = [];
        let primaryImageUrl = '';

        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
            processedImages = await processProductImages(data.images);
            if (processedImages.length > 0) {
                primaryImageUrl = processedImages[0].url || processedImages[0].publicUrl || '';
            }
        } else if (data.primaryImage) {
            primaryImageUrl = data.primaryImage;
            processedImages = [{
                id: 0,
                url: data.primaryImage,
                publicUrl: data.primaryImage,
                signedUrl: data.primaryImage,
                fileName: 'primary_image',
                originalName: 'primary_image',
                isValid: true
            }];
        }

        const quantity = data.quantity || data.stock || 0;
        let availability = 'In stock';
        if (quantity === 0) {
            availability = 'Out of stock';
        } else if (quantity < 5) {
            availability = 'Low stock';
        }

        const product = {
            id: doc.id,
            productId: doc.id,
            name: data.name || 'Unknown Product',
            description: data.description || '',
            features: data.features || '',
            price: data.price || 0,
            quantity: quantity,
            stock: data.stock || quantity,
            categoryName: data.categoryName || 'Uncategorized',
            categoryId: data.categoryId || '',
            offerPercentage: data.offerPercentage || 0,
            taxPercentage: data.taxPercentage || data.gst || 0,
            gst: data.gst || data.taxPercentage || 0,
            shelfLife: data.shelfLife || '',
            certification: data.certification || '',
            storageInstruction: data.storageInstruction || '',
            mrp: data.mrp || null,
            sellingPrice: data.sellingPrice || data.price || 0,
            sku: data.sku || '',
            barcode: data.barcode || '',
            weight: data.weight || '',
            variants: data.variants || [],
            dietType: data.dietType || 'Veg',
            ingredients: data.ingredients || '',
            nutritionFacts: data.nutritionFacts || '',
            primaryImage: primaryImageUrl,
            imageUrl: primaryImageUrl,
            images: processedImages,
            imageCount: processedImages.length,
            active: data.active !== undefined ? data.active : true,
            availability: availability,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };

        res.status(200).json({
            success: true,
            product: product
        });
    } catch (error) {
        console.error('Error getting product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get product',
            error: error.message
        });
    }
});

// Get Category
// app.get('/get-categories', async (req, res) => {
//     try {
//         const { page = 1, limit = 10, search = '', parentCategory = null } = req.query;

//         // Option 1: Simple query without orderBy to avoid index requirements
//         let query = db.collection('categories')
//             .where('active', '==', true)
//             .where('delete', '==', false);

//         // Add parent category filter if provided
//         if (parentCategory) {
//             query = query.where('parentCategory', '==', parentCategory);
//         }

//         const snapshot = await query.get();

//         let categories = snapshot.docs.map(doc => {
//             const data = doc.data();
//             return {
//                 id: doc.id,
//                 ...data,
//                 // Convert Firestore timestamps to ISO strings for frontend
//                 createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
//                 updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
//             };
//         });

//         // Sort by creation date in JavaScript (since we can't use orderBy with multiple where clauses without index)
//         categories.sort((a, b) => {
//             const dateA = new Date(a.createdAt || 0);
//             const dateB = new Date(b.createdAt || 0);
//             return dateB - dateA; // Descending order (newest first)
//         });

//         // Apply search filter if provided
//         if (search) {
//             const searchTerm = search.toLowerCase();
//             categories = categories.filter(category =>
//                 category.name.toLowerCase().includes(searchTerm) ||
//                 category.hsnCode.toLowerCase().includes(searchTerm)
//             );
//         }

//         // Apply pagination
//         const startIndex = (parseInt(page) - 1) * parseInt(limit);
//         const endIndex = startIndex + parseInt(limit);
//         const paginatedCategories = categories.slice(startIndex, endIndex);

//         res.status(200).json({
//             success: true,
//             categories: paginatedCategories,
//             pagination: {
//                 currentPage: parseInt(page),
//                 totalPages: Math.ceil(categories.length / parseInt(limit)),
//                 totalItems: categories.length,
//                 itemsPerPage: parseInt(limit)
//             }
//         });
//     } catch (error) {
//         console.error('Error getting categories:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to get categories',
//             error: error.message
//         });
//     }
// });

// GET endpoint for home banners
app.get('/home-banners', async (req, res) => {
    try {
        // Get all documents from the homeBanners collection where isDeleted is false and isActive is true
        const bannersSnapshot = await db.collection('homeBanners')
            .where('active', '==', true)
            .where('delete', '==', false)
            .orderBy('displayOrder', 'asc')
            .get();

        if (bannersSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'No active home banners found'
            });
        }

        // Prepare the response data
        const banners = [];
        bannersSnapshot.forEach(doc => {
            const bannerData = doc.data();
            banners.push({
                id: doc.id,
                ...bannerData,
                // Convert Firestore Timestamp to ISO string if needed
                createdAt: bannerData.createdAt?.toDate().toISOString(),
                updatedAt: bannerData.updatedAt?.toDate().toISOString()
            });
        });

        // // Sort banners if they have an 'order' field (optional)
        // if (banners[0].order !== undefined) {
        //     banners.sort((a, b) => a.order - b.order);
        // }

        res.status(200).json({
            success: true,
            count: banners.length,
            banners: banners
        });

    } catch (error) {
        console.error('❌ Error fetching home banners:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch home banners',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});
// GET FAQs by Category ID  
app.get('/faqs/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;

        if (!categoryId) {
            return res.status(400).json({
                success: false,
                message: 'Category ID is required'
            });
        }

        // Verify category exists
        const categoryDoc = await db.collection('faqCategories').doc(categoryId).get();
        if (!categoryDoc.exists || categoryDoc.data().delete === true) {
            return res.status(404).json({
                success: false,
                message: 'FAQ category not found'
            });
        }

        // Fetch all FAQs for this category (no extra filters in Firestore)
        const faqsSnapshot = await db.collection('faqs')
            .where('categoryId', '==', categoryId)
            .get();

        if (faqsSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'No FAQs found for this category'
            });
        }

        // Filter in memory (avoids Firestore composite index)
        const faqs = faqsSnapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate().toISOString(),
                    updatedAt: data.updatedAt?.toDate().toISOString()
                };
            })
            .filter(faq => faq.delete === false && faq.active === true)
            .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        res.status(200).json({
            success: true,
            category: {
                id: categoryDoc.id,
                ...categoryDoc.data()
            },
            totalFAQs: faqs.length,
            faqs
        });

    } catch (error) {
        console.error('❌ Error fetching FAQs by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch FAQs',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});
// GET all FAQ categories with their corresponding FAQs
app.get('/faq-categories-with-faqs', async (req, res) => {
    try {
        // ⿡ Get all active & non-deleted categories
        const categoriesSnapshot = await db.collection('faqCategories').get();

        const categories = categoriesSnapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            .filter(cat => cat.delete === false && cat.active === true)
            .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        if (categories.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No FAQ categories found'
            });
        }

        // ⿢ Get ALL FAQs at once (avoiding multiple Firestore queries)
        const faqsSnapshot = await db.collection('faqs').get();

        const faqs = faqsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate().toISOString(),
            updatedAt: doc.data().updatedAt?.toDate().toISOString()
        }));

        // ⿣ Attach FAQs to their categories
        const categoriesWithFaqs = categories.map(category => ({
            ...category,
            faqs: faqs
                .filter(faq =>
                    faq.categoryId === category.id &&
                    faq.delete === false &&
                    faq.active === true
                )
                .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
        }));

        res.status(200).json({
            success: true,
            totalCategories: categories.length,
            data: categoriesWithFaqs
        });

    } catch (error) {
        console.error('❌ Error fetching FAQ categories with FAQs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch FAQ categories with FAQs',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});
// get Category
app.get('/get-categories', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', parentCategory = null } = req.query;

        // Base query for categories
        let query = db.collection('categories')
            .where('active', '==', true)
            .where('delete', '==', false);

        // Add parent category filter if provided
        if (parentCategory) {
            query = query.where('parentCategory', '==', parentCategory);
        }

        const snapshot = await query.get();

        // Fetch all categories first
        let categories = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
                subcategories: [] // Initialize subcategories array
            };
        });

        // Fetch subcategories for each category
        for (let category of categories) {
            const subSnapshot = await db.collection('categories')
                .where('active', '==', true)
                .where('delete', '==', false)
                .where('parentCategory', '==', category.id)
                .get();

            category.subcategories = subSnapshot.docs.map(doc => {
                const subData = doc.data();
                return {
                    id: doc.id,
                    ...subData,
                    createdAt: subData.createdAt?.toDate?.()?.toISOString() || null,
                    updatedAt: subData.updatedAt?.toDate?.()?.toISOString() || null
                };
            });
        }

        // Sort by creation date (newest first)
        categories.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA; // Descending order
        });

        // Apply search filter if provided
        if (search) {
            const searchTerm = search.toLowerCase();
            categories = categories.filter(category => {
                // Check if category or any subcategory matches the search term
                const matchesCategory =
                    category.name.toLowerCase().includes(searchTerm) ||
                    category.hsnCode.toLowerCase().includes(searchTerm);
                const matchesSubcategory = category.subcategories.some(sub =>
                    sub.name.toLowerCase().includes(searchTerm) ||
                    sub.hsnCode.toLowerCase().includes(searchTerm)
                );
                return matchesCategory || matchesSubcategory;
            });
        }

        // Apply pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedCategories = categories.slice(startIndex, endIndex);

        res.status(200).json({
            success: true,
            categories: paginatedCategories,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(categories.length / parseInt(limit)),
                totalItems: categories.length,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get categories',
            error: error.message
        });
    }
});
// Fetch Users
app.get('/get-users', async (req, res) => {
    try {
        const usersQuery = await db.collection('users')
            .where('active', '==', true)
            .where('delete', '==', false)
            .get();

        if (usersQuery.empty) {
            return res.status(200).json({
                success: true,
                message: 'No active users found',
                count: 0,
                users: []
            });
        }

        const users = [];
        usersQuery.forEach(doc => {
            const userData = doc.data();

            // Limit fields for frontend
            users.push({
                userId: userData.userId,
                name: userData.name,
                profile: userData.profile || null, // e.g., profile picture
            });
        });

        res.status(200).json({
            success: true,
            message: `Found ${users.length} active users`,
            count: users.length,
            users
        });

    } catch (error) {
        console.error('❌ Error retrieving users for frontend:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve users. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// app.post('/add-to-cart', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const { productId, quantity } = req.body;

//         if (!productId || quantity === undefined) {
//             return res.status(400).json({
//                 error: 'Product ID and quantity are required'
//             });
//         }

//         if (typeof quantity !== 'number' || quantity <= 0) {
//             return res.status(400).json({
//                 error: 'Quantity must be a positive number'
//             });
//         }

//         const userRef = db.collection('users').doc(user.customDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 error: 'User not found'
//             });
//         }

//         const userData = userDoc.data();
//         const cart = userData.cart || [];

//         // Check if product exists
//         const productDoc = await db.collection('products').doc(productId).get();
//         if (!productDoc.exists) {
//             return res.status(404).json({
//                 error: 'Product not found'
//             });
//         }

//         // Update cart
//         const existingIndex = cart.findIndex(item => item.productId === productId);

//         if (existingIndex >= 0) {
//             cart[existingIndex].quantity += quantity;
//         } else {
//             cart.push({
//                 productId,
//                 quantity,
//                 addedAt: new Date().toISOString()
//             });
//         }

//         await userRef.update({
//             cart,
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         });

//         res.status(200).json({
//             success: true,
//             message: 'Product added to cart',
//             cart: cart
//         });

//     } catch (error) {
//         console.error('❌ Add to cart error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to add to cart'
//         });
//     }
// });

// 

// main
// app.post('/add-to-cart', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const { productId, quantity } = req.body;

//         if (!productId || quantity === undefined) {
//             return res.status(400).json({
//                 error: 'Product ID and quantity are required'
//             });
//         }

//         if (typeof quantity !== 'number' || quantity <= 0) {
//             return res.status(400).json({
//                 error: 'Quantity must be a positive number'
//             });
//         }

//         const userRef = db.collection('users').doc(user.customDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 error: 'User not found'
//             });
//         }

//         const userData = userDoc.data();
//         const cart = userData.cart || [];
//         const wishlist = userData.wishlist || [];

//         // Check if product exists
//         const productDoc = await db.collection('products').doc(productId).get();
//         if (!productDoc.exists) {
//             return res.status(404).json({
//                 error: 'Product not found'
//             });
//         }

//         // Update cart
//         const existingIndex = cart.findIndex(item => item.productId === productId);

//         if (existingIndex >= 0) {
//             cart[existingIndex].quantity += quantity;
//         } else {
//             cart.push({
//                 productId,
//                 quantity,
//                 addedAt: new Date().toISOString()
//             });
//         }

//         // Remove product from wishlist if it exists
//         const wishlistIndex = wishlist.findIndex(item => item.productId === productId);
//         let updatedWishlist = wishlist;

//         if (wishlistIndex >= 0) {
//             updatedWishlist = wishlist.filter(item => item.productId !== productId);
//         }

//         // Update both cart and wishlist
//         await userRef.update({
//             cart,
//             wishlist: updatedWishlist,
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         });

//         res.status(200).json({
//             success: true,
//             message: 'Product added to cart',
//             cart: cart,
//             ...(wishlistIndex >= 0 && { removedFromWishlist: true })
//         });

//     } catch (error) {
//         console.error('❌ Add to cart error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to add to cart'
//         });
//     }
// });

// OG

// app.post('/add-to-cart', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const { productId, quantity, variants } = req.body;

//         if (!productId || quantity === undefined) {
//             return res.status(400).json({
//                 error: 'Product ID and quantity are required'
//             });
//         }

//         if (typeof quantity !== 'number' || quantity <= 0) {
//             return res.status(400).json({
//                 error: 'Quantity must be a positive number'
//             });
//         }

//         // Validate variants if provided
//         if (variants && typeof variants !== 'object') {
//             return res.status(400).json({
//                 error: 'Variants must be an object'
//             });
//         }

//         const userRef = db.collection('users').doc(user.customDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 error: 'User not found'
//             });
//         }

//         const userData = userDoc.data();
//         const cart = userData.cart || [];
//         const wishlist = userData.wishlist || [];

//         // Check if product exists
//         const productDoc = await db.collection('products').doc(productId).get();
//         if (!productDoc.exists) {
//             return res.status(404).json({
//                 error: 'Product not found'
//             });
//         }

//         const productData = productDoc.data();

//         // Validate variants against product's available variants
//         if (variants && productData.availableVariants) {
//             for (const [variantType, variantValue] of Object.entries(variants)) {
//                 if (productData.availableVariants[variantType] &&
//                     !productData.availableVariants[variantType].includes(variantValue)) {
//                     return res.status(400).json({
//                         error: `Invalid ${variantType}: ${variantValue}. Available options: ${productData.availableVariants[variantType].join(', ')}`
//                     });
//                 }
//             }
//         }

//         // Create a unique identifier for cart items including variants
//         const createCartItemKey = (productId, variants) => {
//             if (!variants) return productId;
//             const variantString = Object.entries(variants)
//                 .sort(([a], [b]) => a.localeCompare(b)) // Sort for consistency
//                 .map(([key, value]) => `${key}:${value}`)
//                 .join('|');
//             return `${productId}|${variantString}`;
//         };

//         const cartItemKey = createCartItemKey(productId, variants);

//         // Update cart - check for existing item with same product and variants
//         const existingIndex = cart.findIndex(item => {
//             const itemKey = createCartItemKey(item.productId, item.variants);
//             return itemKey === cartItemKey;
//         });

//         if (existingIndex >= 0) {
//             cart[existingIndex].quantity += quantity;
//             cart[existingIndex].updatedAt = new Date().toISOString();
//         } else {
//             const newCartItem = {
//                 productId,
//                 quantity,
//                 addedAt: new Date().toISOString(),
//                 updatedAt: new Date().toISOString()
//             };

//             // Add variants if provided
//             if (variants && Object.keys(variants).length > 0) {
//                 newCartItem.variants = variants;
//             }

//             cart.push(newCartItem);
//         }

//         // Remove product from wishlist if it exists (considering variants)
//         const wishlistIndex = wishlist.findIndex(item => {
//             const itemKey = createCartItemKey(item.productId, item.variants);
//             return itemKey === cartItemKey;
//         });

//         let updatedWishlist = wishlist;
//         if (wishlistIndex >= 0) {
//             updatedWishlist = wishlist.filter((item, index) => index !== wishlistIndex);
//         }

//         // Update both cart and wishlist
//         await userRef.update({
//             cart,
//             wishlist: updatedWishlist,
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         });

//         // Prepare response
//         const responseData = {
//             success: true,
//             message: 'Product added to cart',
//             cart: cart
//         };

//         if (wishlistIndex >= 0) {
//             responseData.removedFromWishlist = true;
//         }

//         if (variants) {
//             responseData.addedVariants = variants;
//         }

//         res.status(200).json(responseData);

//     } catch (error) {
//         console.error('❌ Add to cart error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to add to cart'
//         });
//     }
// });

// app.post('/add-to-cart', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const { productId, quantity, variantCombination } = req.body;

//         if (!productId || quantity === undefined) {
//             return res.status(400).json({
//                 error: 'Product ID and quantity are required'
//             });
//         }

//         if (typeof quantity !== 'number' || quantity <= 0) {
//             return res.status(400).json({
//                 error: 'Quantity must be a positive number'
//             });
//         }

//         const userRef = db.collection('users').doc(user.customDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 error: 'User not found'
//             });
//         }

//         const userData = userDoc.data();
//         const cart = userData.cart || [];
//         const wishlist = userData.wishlist || [];

//         // Check if product exists
//         const productDoc = await db.collection('products').doc(productId).get();
//         if (!productDoc.exists) {
//             return res.status(404).json({
//                 error: 'Product not found'
//             });
//         }

//         const productData = productDoc.data();

//         // Validate variant combination if provided
//         if (variantCombination && productData.hasVariants) {
//             const validVariant = productData.variantCombinations?.find(
//                 combo => combo.variantId === variantCombination.variantId
//             );

//             if (!validVariant) {
//                 return res.status(400).json({
//                     error: 'Invalid variant combination'
//                 });
//             }

//             // Check stock for the specific variant
//             if (validVariant.quantity < quantity) {
//                 return res.status(400).json({
//                     error: `Only ${validVariant.quantity} items available for this variant`
//                 });
//             }
//         } else if (!productData.hasVariants) {
//             // Check stock for non-variant products
//             const availableStock = productData.quantity || productData.stock || 0;
//             if (availableStock < quantity) {
//                 return res.status(400).json({
//                     error: `Only ${availableStock} items available`
//                 });
//             }
//         }

//         // Create a unique identifier for cart items
//         const createCartItemKey = (productId, variantCombination) => {
//             if (!variantCombination) return productId;
//             return `${productId}|${variantCombination.variantId}`;
//         };

//         const cartItemKey = createCartItemKey(productId, variantCombination);

//         // Update cart - check for existing item
//         const existingIndex = cart.findIndex(item => {
//             const itemKey = createCartItemKey(item.productId, item.variantCombination);
//             return itemKey === cartItemKey;
//         });

//         if (existingIndex >= 0) {
//             cart[existingIndex].quantity += quantity;
//             cart[existingIndex].updatedAt = new Date().toISOString();
//         } else {
//             const newCartItem = {
//                 productId,
//                 quantity,
//                 addedAt: new Date().toISOString(),
//                 updatedAt: new Date().toISOString()
//             };

//             // Add variant combination if provided
//             if (variantCombination) {
//                 newCartItem.variantCombination = {
//                     variantId: variantCombination.variantId,
//                     name: variantCombination.name,
//                     sku: variantCombination.sku,
//                     price: variantCombination.price,
//                     primaryImage: variantCombination.primaryImage,
//                     variants: variantCombination.variants // The actual variant selections
//                 };
//             }

//             cart.push(newCartItem);
//         }

//         // Remove from wishlist if exists
//         const wishlistIndex = wishlist.findIndex(item => {
//             const itemKey = createCartItemKey(item.productId, item.variantCombination);
//             return itemKey === cartItemKey;
//         });

//         let updatedWishlist = wishlist;
//         if (wishlistIndex >= 0) {
//             updatedWishlist = wishlist.filter((item, index) => index !== wishlistIndex);
//         }

//         // Update both cart and wishlist
//         await userRef.update({
//             cart,
//             wishlist: updatedWishlist,
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         });

//         // Prepare response
//         const responseData = {
//             success: true,
//             message: 'Product added to cart',
//             cart: cart
//         };

//         if (wishlistIndex >= 0) {
//             responseData.removedFromWishlist = true;
//         }

//         if (variantCombination) {
//             responseData.addedVariantCombination = variantCombination;
//         }

//         res.status(200).json(responseData);

//     } catch (error) {
//         console.error('❌ Add to cart error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to add to cart'
//         });
//     }
// });

// Optional: Add a companion API to get cart contents
// app.get('/get-cart-products', verifyFirebaseCustomToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const userDocId = user.customDocId;

//         const userRef = db.collection('users').doc(userDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 error: 'User not found',
//                 details: 'No user found with the provided ID'
//             });
//         }

//         const userData = userDoc.data();
//         const cart = userData.cart || [];

//         const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
//         const totalUniqueProducts = cart.length;

//         res.status(200).json({
//             cart,
//             summary: {
//                 totalItems,
//                 totalUniqueProducts
//             }
//         });

//     } catch (error) {
//         console.error('Error fetching cart:', error);
//         res.status(500).json({
//             error: 'Internal server error',
//             details: 'An unexpected error occurred while fetching the cart'
//         });
//     }
// });

// app.get('/get-cart', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const userRef = db.collection('users').doc(user.customDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 success: false,
//                 error: 'User not found'
//             });
//         }

//         const userData = userDoc.data();
//         const cart = userData.cart || [];

//         // Get product details for each item in cart
//         const cartWithProducts = await Promise.all(
//             cart.map(async (item) => {
//                 const productDoc = await db.collection('products').doc(item.productId).get();
//                 if (!productDoc.exists) return null;

//                 const productData = productDoc.data();
//                 return {
//                     ...item,
//                     productDetails: {
//                         name: productData.name,
//                         price: productData.price || productData.variantCombinations[0].price || 0,
//                         image: productData.primaryImage || productData.variantCombinations[0].primaryImage || '',
//                     }
//                 };
//             })
//         );

//         // Filter out null items (products that no longer exist)
//         const filteredCart = cartWithProducts.filter(item => item !== null);

//         res.status(200).json({
//             success: true,
//             cart: filteredCart
//         });

//     } catch (error) {
//         console.error('❌ Get cart error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to get cart'
//         });
//     }
// });

// Optional: Add API to remove items from cart




app.post('/add-to-cart', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { productId, quantity, variantCombination } = req.body;

        if (!productId || quantity === undefined) {
            return res.status(400).json({ error: 'Product ID and quantity are required' });
        }

        if (typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ error: 'Quantity must be a positive number' });
        }

        // Get user reference
        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        const cart = userData.cart || [];
        const wishlist = userData.wishlist || [];

        // Fetch product details
        const productDoc = await db.collection('products').doc(productId).get();
        if (!productDoc.exists) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const productData = productDoc.data();

        // Initialize stock and price
        let stockAvailable = 0;
        let itemPrice = productData.price;
        let itemSellingPrice = productData.sellingPrice || productData.price || 0;
        let itemImage = productData.primaryImage || productData.thumbnail || '';
        let variantToAdd = null;

        // Handle variant or non-variant
        if (productData.hasVariants) {
            // If product has variants, validate input
            if (!variantCombination || !variantCombination.variantId) {
                return res.status(400).json({
                    error: 'Variant combination is required for products with variants',
                });
            }

            const validVariant = productData.variantCombinations?.find(
                (combo) => combo.variantId === variantCombination.variantId
            );

            if (!validVariant) {
                return res.status(400).json({ error: 'Invalid variant combination' });
            }

            stockAvailable = validVariant.quantity || 0;
            itemPrice = validVariant.price || productData.price;
            itemSellingPrice = validVariant.sellingPrice || validVariant.price || productData.sellingPrice || productData.price || 0;
            itemImage = validVariant.primaryImage || productData.primaryImage || '';
            variantToAdd = validVariant;

            if (stockAvailable < quantity) {
                return res.status(400).json({
                    error: `Only ${stockAvailable} items available for this variant`,
                });
            }
        } else {
            // Non-variant products
            stockAvailable = productData.quantity || productData.stock || 0;
            if (stockAvailable < quantity) {
                return res.status(400).json({
                    error: `Only ${stockAvailable} items available`,
                });
            }
        }

        // Helper: unique key for identifying product+variant
        const createCartItemKey = (productId, variantCombination) => {
            return variantCombination && variantCombination.variantId
                ? `${productId}|${variantCombination.variantId}`
                : productId;
        };

        const cartItemKey = createCartItemKey(productId, variantCombination);

        // Check if already in cart
        const existingIndex = cart.findIndex((item) => {
            const itemKey = createCartItemKey(item.productId, item.variantCombination);
            return itemKey === cartItemKey;
        });

        if (existingIndex >= 0) {
            // Update existing cart item
            cart[existingIndex].quantity += quantity;
            cart[existingIndex].updatedAt = new Date().toISOString();
        } else {
            // Add new cart item
            const newCartItem = {
                productId,
                productName: productData.name,
                price: itemPrice,
                sellingPrice: itemSellingPrice,
                productImage: itemImage,
                quantity,
                hasVariants: productData.hasVariants || false,
                addedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Add variant combination if product has variants
            if (variantToAdd) {
                newCartItem.variantCombination = {
                    variantId: variantToAdd.variantId,
                    name: variantToAdd.name || '',
                    sku: variantToAdd.sku || '',
                    price: variantToAdd.price || 0,
                    primaryImage: variantToAdd.primaryImage || '',
                    variants: variantToAdd.variants || [], // The actual variant selections (e.g., [{name: "Color", value: "Red"}])
                    quantity: variantToAdd.quantity || 0
                };
            }

            cart.push(newCartItem);
        }

        // Remove from wishlist if exists (same product + variant combination)
        const wishlistIndex = wishlist.findIndex((item) => {
            const itemKey = createCartItemKey(item.productId, item.variantCombination);
            return itemKey === cartItemKey;
        });

        let updatedWishlist = wishlist;
        if (wishlistIndex >= 0) {
            updatedWishlist = wishlist.filter((item, index) => index !== wishlistIndex);
        }

        // Remove undefined values recursively
        const cleanObject = (obj) => {
            if (Array.isArray(obj)) return obj.map(cleanObject);
            if (obj && typeof obj === 'object') {
                const newObj = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (value !== undefined) newObj[key] = cleanObject(value);
                }
                return newObj;
            }
            return obj;
        };

        const safeCart = cleanObject(cart);
        const safeWishlist = cleanObject(updatedWishlist);

        // Update Firestore
        await userRef.update({
            cart: safeCart,
            wishlist: safeWishlist,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
        });

        // Fetch latest user document to avoid stale data in response
        const updatedUserDoc = await userRef.get();
        const updatedUserData = updatedUserDoc.data();

        const responseData = {
            success: true,
            message: 'Product added to cart successfully',
            cart: updatedUserData.cart || [],
            cartItemCount: updatedUserData.cart?.length || 0,
        };

        // Add additional info if removed from wishlist
        if (wishlistIndex >= 0) {
            responseData.removedFromWishlist = true;
        }

        // Add variant info if applicable
        if (variantToAdd) {
            responseData.addedVariantCombination = {
                variantId: variantToAdd.variantId,
                name: variantToAdd.name,
                variants: variantToAdd.variants
            };
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ Add to cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add product to cart',
        });
    }
});


app.get('/get-cart', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userData = userDoc.data();
        const cart = userData.cart || [];

        // Format each cart item
        const cartWithProducts = await Promise.all(
            cart.map(async (item) => {
                try {
                    const productDoc = await db.collection('products').doc(item.productId).get();

                    if (!productDoc.exists) {
                        return {
                            ...item,
                            available: false,
                            message: 'Product no longer available',
                        };
                    }

                    const productData = productDoc.data();

                    // Defaults
                    let currentPrice = productData.sellingPrice || productData.price || 0;
                    let currentStock = productData.quantity || productData.stock || 0;
                    let currentImage = productData.primaryImage || productData.thumbnail || '';
                    let variantInfo = null;

                    // Handle variant data
                    if (productData.hasVariants && item.variantCombination?.variantId) {
                        const matchedVariant = productData.variantCombinations?.find(
                            (v) => String(v.variantId) === String(item.variantCombination.variantId)
                        );

                        if (matchedVariant) {
                            currentPrice = matchedVariant.sellingPrice || matchedVariant.price || currentPrice;
                            currentStock = matchedVariant.quantity || currentStock;
                            currentImage = matchedVariant.primaryImage || currentImage;
                            variantInfo = matchedVariant;
                        }
                    }

                    // Build a clean response structure
                    return {
                        productId: item.productId,
                        quantity: item.quantity || 1,
                        addedAt: item.addedAt || new Date().toISOString(),
                        updatedAt: item.updatedAt || new Date().toISOString(),
                        hasVariants: !!productData.hasVariants,

                        // Unified product info object
                        productDetails: {
                            name: productData.name || '',
                            price: productData.price || 0,
                            sellingPrice: productData.sellingPrice || productData.price || 0,
                            originalPrice: productData.originalPrice || productData.price || 0,
                            gst: productData.gst || 0,
                            image: productData.primaryImage || productData.thumbnail || '',
                            stock: productData.stock || 0,
                            category: productData.category || '',
                        },

                        // Variant info (if applicable)
                        ...(variantInfo && {
                            variantCombination: {
                                variantId: variantInfo.variantId,
                                name: variantInfo.name || '',
                                price: variantInfo.price || currentPrice,
                                primaryImage: variantInfo.primaryImage || currentImage,
                                quantity: variantInfo.quantity || currentStock,
                                sku: variantInfo.sku || '',
                                gst: variantInfo.gst || productData.gst || 0,
                                variants: variantInfo.variants || {},
                            },
                        }),

                        // UI helpers
                        available: currentStock > 0,
                        productImage: currentImage,
                        productName: productData.name || '',
                        currentPrice,
                        currentStock,
                    };
                } catch (innerError) {
                    console.error('Error processing cart item:', innerError);
                    return {
                        ...item,
                        error: 'Failed to process this item',
                    };
                }
            })
        );

        return res.json({
            success: true,
            cart: cartWithProducts.filter(Boolean),
        });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cart',
            details: error.message,
        });
    }
});



app.post('/remove-from-cart', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const userDocId = user.customDocId;
        const { productId, quantity } = req.body;

        if (!productId) {
            return res.status(400).json({
                error: 'Product ID is required'
            });
        }

        const userRef = db.collection('users').doc(userDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        let cart = userData.cart || [];

        const existingProductIndex = cart.findIndex(item => item.productId === productId);

        if (existingProductIndex >= 0) {
            if (quantity && quantity < cart[existingProductIndex].quantity) {
                // Reduce quantity
                cart[existingProductIndex].quantity -= quantity;
                cart[existingProductIndex].updatedAt = new Date().toISOString();
            } else {
                // Remove item completely
                cart.splice(existingProductIndex, 1);
            }

            await userRef.update({
                cart,
                lastUpdated: new Date().toISOString()
            });

            res.status(200).json({
                message: 'Product removed from cart successfully',
                cart
            });
        } else {
            res.status(404).json({
                error: 'Product not found in cart'
            });
        }

    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: 'An unexpected error occurred while removing the product from the cart'
        });
    }
});

app.put('/update-cart-quantity', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { productId, newQuantity } = req.body;

        // Validate input
        if (!productId || newQuantity === undefined) {
            return res.status(400).json({
                error: 'Product ID and new quantity are required'
            });
        }

        if (typeof newQuantity !== 'number' || newQuantity <= 0) {
            return res.status(400).json({
                error: 'Quantity must be a positive number'
            });
        }

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        const cart = userData.cart || [];

        // Check if product exists in cart
        const existingIndex = cart.findIndex(item => item.productId === productId);

        if (existingIndex === -1) {
            return res.status(404).json({
                error: 'Product not found in cart'
            });
        }

        // Check if product exists in products collection
        const productDoc = await db.collection('products').doc(productId).get();
        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'Product not found in database'
            });
        }

        // Update the quantity
        cart[existingIndex].quantity = newQuantity;
        cart[existingIndex].updatedAt = new Date().toISOString();

        await userRef.update({
            cart,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Cart quantity updated successfully',
            cart: cart
        });

    } catch (error) {
        console.error('❌ Update cart quantity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update cart quantity'
        });
    }
});

// CLEAR CART
// Clear cart API endpoint - add this to your routes file
app.post('/clear-cart', authenticateToken, async (req, res) => {
    try {
        const user = req.user;

        if (!user || !user.customDocId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Clear the cart in database
        await userRef.update({
            cart: [],
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Cart cleared for user: ${user.customDocId}`);

        res.status(200).json({
            success: true,
            message: 'Cart cleared successfully',
            cart: []
        });

    } catch (error) {
        console.error('❌ Clear cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear cart'
        });
    }
});

// GET all active coupons

app.get('/coupons', async (req, res) => {
    try {
        const { productId, productType } = req.query;

        // Build query with where conditions
        let query = db.collection('coupons')
            .where('active', '==', true)
            .where('hidden', '==', false)
        // Filter by productType and exclude hidden coupons
        query = query.where('delete', '==', false)
                     .where('hidden', '==', false);

        if (productType && productType !== 'ALL') {
            query = query.where('productType', 'in', ['ALL', productType]);
        }

        const couponsSnapshot = await query.get();

        if (couponsSnapshot.empty) {
            return res.status(200).json({
                success: true,
                totalCoupons: 0,
                coupons: []
            });
        }

        const currentDate = new Date();

        // Filter remaining conditions in memory (complex conditions not supported in Firestore where)
        let coupons = couponsSnapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate().toISOString(),
                    updatedAt: data.updatedAt?.toDate().toISOString(),
                    validUntil: data.validUntil ? data.validUntil.toDate().toISOString() : null
                };
            })
            .filter(coupon => {
                // Check usage limit (only if usageType is not UNLIMITED)
                if (coupon.usageType !== 'UNLIMITED' && coupon.usageLimit) {
                    if (coupon.usageCount >= coupon.usageLimit) return false;
                }

                // Check expiration (if validUntil exists)
                if (coupon.validUntil) {
                    const expiryDate = new Date(coupon.validUntil);
                    if (expiryDate < currentDate) return false;
                }

                // Filter by specific productId if provided
                if (productId) {
                    // Check for both productIds array and singular fields (backward compatibility)
                    const allowedIds = coupon.productIds || (coupon.productId ? [coupon.productId] : []) || (coupon.productID ? [coupon.productID] : []);
                    
                    if (allowedIds.length > 0) {
                        if (!allowedIds.includes(productId)) return false;
                    }
                }

                return true;
            })
            .sort((a, b) => {
                // Sort by creation date (newest first)
                const dateA = new Date(a.createdAt);
                const dateB = new Date(b.createdAt);
                return dateB - dateA;
            });

        res.status(200).json({
            success: true,
            totalCoupons: coupons.length,
            coupons
        });

    } catch (error) {
        console.error('❌ Error fetching coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch coupons',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// GET single coupon by code
app.get('/coupons/verify/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { productId, productIds, productType } = req.query;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        // Query by code field with additional where conditions
        const couponsSnapshot = await db.collection('coupons')
            .where('code', '==', code.toUpperCase())
            .where('delete', '==', false)
            .limit(1)
            .get();

        if (couponsSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        const couponDoc = couponsSnapshot.docs[0];
        const data = couponDoc.data();
        const coupon = {
            id: couponDoc.id,
            ...data,
            createdAt: data.createdAt?.toDate().toISOString(),
            updatedAt: data.updatedAt?.toDate().toISOString(),
            validUntil: data.validUntil ? data.validUntil.toDate().toISOString() : null
        };

        // Validate coupon
        const currentDate = new Date();
        const validationErrors = [];

        if (!coupon.active) validationErrors.push('Coupon is not active');
        // REMOVED: if (coupon.hidden) validationErrors.push('Coupon is not available');
        // Hidden coupons are allowed for manual entry

        // Check usage limit based on usageType
        if (coupon.usageType !== 'UNLIMITED' && coupon.usageLimit) {
            if (coupon.usageCount >= coupon.usageLimit) {
                validationErrors.push('Coupon usage limit reached');
            }
        }

        if (coupon.validUntil) {
            const expiryDate = new Date(coupon.validUntil);
            if (expiryDate < currentDate) {
                validationErrors.push('Coupon has expired');
            }
        }

        // Validate product restrictions
        if (coupon.productType === 'SPECIFIC') {
            const allowedIds = coupon.productIds || (coupon.productId ? [coupon.productId] : []) || (coupon.productID ? [coupon.productID] : []);
            
            // Collect all product IDs to check (from productId or comma-separated productIds)
            let idsToCheck = [];
            if (productId) idsToCheck.push(productId);
            if (productIds) {
                idsToCheck = [...idsToCheck, ...productIds.split(',')];
            }
            
            // Remove duplicates and empty strings
            idsToCheck = [...new Set(idsToCheck.filter(id => id))];

            if (idsToCheck.length > 0) {
                const isAnyAllowed = idsToCheck.some(id => allowedIds.includes(id) || allowedIds.includes(String(id)));
                if (!isAnyAllowed) {
                    validationErrors.push('Coupon not valid for any product in your cart');
                }
            } else if (allowedIds.length > 0) {
                // No products provided but coupon is restricted
                validationErrors.push('This coupon is only valid for specific products');
            }
        }

        if (productType && coupon.productType !== 'ALL' && coupon.productType !== productType) {
            validationErrors.push('Coupon not valid for this product type');
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: validationErrors[0],
                errors: validationErrors,
                coupon
            });
        }

        res.status(200).json({
            success: true,
            message: 'Coupon is valid',
            coupon
        });

    } catch (error) {
        console.error('❌ Error verifying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify coupon',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});





// Wishlist API
// app.post('/add-to-wishlist', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const { productId } = req.body;

//         if (!productId) {
//             return res.status(400).json({
//                 error: 'Product ID is required'
//             });
//         }

//         const userRef = db.collection('users').doc(user.customDocId);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             return res.status(404).json({
//                 error: 'User not found'
//             });
//         }

//         const userData = userDoc.data();
//         const wishlist = userData.wishlist || [];

//         // Check if product exists
//         const productDoc = await db.collection('products').doc(productId).get();
//         if (!productDoc.exists) {
//             return res.status(404).json({
//                 error: 'Product not found'
//             });
//         }

//         // Check if product is already in wishlist
//         const existingIndex = wishlist.findIndex(item => item.productId === productId);

//         if (existingIndex >= 0) {
//             return res.status(409).json({
//                 success: false,
//                 error: 'Product already in wishlist'
//             });
//         }

//         // Add product to wishlist
//         wishlist.push({
//             productId,
//             addedAt: new Date().toISOString()
//         });

//         await userRef.update({
//             wishlist,
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         });

//         res.status(200).json({
//             success: true,
//             message: 'Product added to wishlist',
//             wishlist: wishlist
//         });

//     } catch (error) {
//         console.error('❌ Add to wishlist error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to add to wishlist'
//         });
//     }
// });

//  PLace order Add the authenticateToken middleware to the route
// app.post('/place-order', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const { items, deliveryAddress, paymentMethod } = req.body;

//         // Validate input
//         if (!items || !Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Items are required to place an order'
//             });
//         }

//         if (!deliveryAddress || typeof deliveryAddress !== 'object') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Delivery address is required'
//             });
//         }

//         if (!paymentMethod || typeof paymentMethod !== 'object') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Payment method is required'
//             });
//         }

//         // Create a new order document
//         const orderRef = db.collection('orders').doc();
//         const orderId = orderRef.id;

//         // Prepare order data
//         const orderData = {
//             orderId,
//             userId: user.userId,
//             items,
//             deliveryAddress,
//             paymentMethod,
//             status: 'Pending',
//             createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
//             updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
//         };

//         // Save the order to Firestore
//         await orderRef.set(orderData);

//         res.status(201).json({
//             success: true,
//             message: 'Order placed successfully',
//             orderId
//         });

//     } catch (error) {
//         console.error('❌ Place order error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to place order'
//         });
//     }
// });

// app.post('/place-order', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const userId = user.userId; // or user.id depending on your token structure
//         console.log(userId, 'user');

//         const {
//             // User Information


//             // Items in the order
//             items, // Array of {productId, quantity, price?, variant?}

//             // Delivery Address
//             deliveryAddress: {
//                 fullName,
//                 phone,
//                 email,
//                 addressLine1,
//                 addressLine2,
//                 city,
//                 state,
//                 pincode,
//                 landmark,
//                 addressType // 'Home', 'Office', 'Other'
//             },


//             // Payment Information
//             paymentMethod, // 'prepaid', 'cod', 'online'
//             paymentDetails, // For prepaid orders: {transactionId, paymentGateway, etc.}

//             // Order Details
//             deliveryCharge = 0,
//             discountAmount = 0,
//             couponCode,
//             specialInstructions,

//             // Delivery Preferences
//             preferredDeliveryDate,
//             preferredDeliveryTime // 'morning', 'afternoon', 'evening'

//         } = req.body;

//         // Input Validation
//         const validationErrors = [];

//         if (!userId) {
//             validationErrors.push('User ID is required');
//         }

//         if (!items || !Array.isArray(items) || items.length === 0) {
//             validationErrors.push('Order items are required');
//         }

//         if (!fullName || !phone || !addressLine1 || !city || !state || !pincode) {
//             validationErrors.push('Complete delivery address is required');
//         }

//         if (!paymentMethod || !['prepaid', 'cod', 'online'].includes(paymentMethod)) {
//             validationErrors.push('Valid payment method is required (prepaid, cod, or online)');
//         }

//         // Validate phone number (10 digits)
//         if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
//             validationErrors.push('Please provide a valid 10-digit phone number');
//         }

//         // Validate pincode (6 digits)
//         if (pincode && !/^\d{6}$/.test(pincode)) {
//             validationErrors.push('Please provide a valid 6-digit pincode');
//         }

//         if (validationErrors.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Validation failed',
//                 errors: validationErrors
//             });
//         }

//         // Verify user exists and is active
//         const userQuery = await db.collection('users')
//             .where('userId', '==', userId)
//             .where('active', '==', true)
//             .where('delete', '==', false)
//             .get();

//         if (userQuery.empty) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'User not found or inactive'
//             });
//         }

//         const userData = userQuery.docs[0].data();

//         // Fetch settings document to get next order ID
//         const settingsRef = db.collection('settings').doc('global');
//         const settingsDoc = await settingsRef.get();
//         const settings = settingsDoc.data();

//         // Generate unique order ID from settings
//         const nextOrderId = settings.orders.orderId || 1;
//         const orderId = `OD${nextOrderId}`;


//         // Validate and process order items
//         const validatedItems = await validateOrderItems(items);

//         // Calculate order totals
//         const orderTotals = calculateOrderTotals(validatedItems, deliveryCharge, discountAmount);

//         // Generate unique order ID

//         // Create timestamps
//         const serverTimestamp = firebaseAdmin.firestore.FieldValue.serverTimestamp();
//         const currentTimestamp = new Date(); // Use regular Date object for arrays

//         // Prepare order data
//         const orderData = {
//             // Order Identification
//             orderId: orderId,
//             orderNumber: orderId,

//             // User Information
//             userId: userId,
//             userDetails: {
//                 name: userData.name,
//                 email: userData.email,
//                 phone: userData.phone || phone
//             },

//             // Order Items
//             items: validatedItems,
//             itemCount: validatedItems.length,
//             totalQuantity: validatedItems.reduce((sum, item) => sum + item.quantity, 0),

//             // Pricing Information
//             pricing: {
//                 subtotal: orderTotals.subtotal,
//                 totalMRP: orderTotals.totalMRP,
//                 totalSavings: orderTotals.totalSavings,
//                 deliveryCharge: orderTotals.deliveryCharge,
//                 discountAmount: orderTotals.discountAmount,
//                 finalTotal: orderTotals.finalTotal
//             },

//             // Delivery Address
//             deliveryAddress: {
//                 fullName: fullName.trim(),
//                 phone: phone.replace(/\D/g, ''),
//                 email: email?.trim() || userData.email,
//                 addressLine1: addressLine1.trim(),
//                 addressLine2: addressLine2?.trim() || '',
//                 city: city.trim(),
//                 state: state.trim(),
//                 pincode: pincode.replace(/\D/g, ''),
//                 landmark: landmark?.trim() || '',
//                 addressType: addressType || 'Home',
//                 fullAddress: `${addressLine1.trim()}, ${addressLine2?.trim() || ''}, ${city.trim()}, ${state.trim()} - ${pincode}`.replace(', ,', ',')
//             },

//             // Payment Information
//             payment: {
//                 paymentMethod: paymentMethod,
//                 status: paymentMethod === 'cod' ? 'pending' : (paymentDetails?.transactionId ? 'completed' : 'pending'),
//                 amount: orderTotals.finalTotal,
//                 currency: 'INR',
//                 details: paymentDetails || {},
//                 transactionId: paymentDetails?.transactionId || null,
//                 paymentGateway: paymentDetails?.paymentGateway || null,
//                 paymentId: paymentDetails?.paymentId || null
//             },

//             // Order Status
//             status: 0
//             , // placed -> confirmed -> processing -> packed -> shipped -> delivered -> cancelled
//             orderStage: 'placed',
//             trackingStages: [
//                 {
//                     stage: 'placed',
//                     status: 'completed',
//                     timestamp: currentTimestamp, // Use regular Date object instead of serverTimestamp
//                     description: 'Order placed successfully'
//                 }
//             ],

//             // Delivery Information
//             delivery: {
//                 type: 'standard', // standard, express
//                 preferredDate: preferredDeliveryDate || null,
//                 preferredTime: preferredDeliveryTime || null,
//                 estimatedDate: null, // To be calculated based on pincode and product availability
//                 actualDate: null,
//                 trackingNumber: null,
//                 courierPartner: null
//             },

//             // Additional Information
//             couponCode: couponCode || null,
//             specialInstructions: specialInstructions?.trim() || '',

//             // Flags
//             active: true,
//             delete: false,
//             isPreorder: false,

//             isCancelledbyCustomer: false,
//             isReturnable: true,

//             // Timestamps
//             createdAt: serverTimestamp,
//             updatedAt: serverTimestamp,

//             // Metadata
//             metadata: {
//                 source: 'web',
//                 ipAddress: req.ip || req.connection.remoteAddress,
//                 userAgent: req.get('User-Agent') || 'Unknown',
//                 orderSource: 'website'
//             }
//         };

//         // Start a batch operation to ensure data consistency
//         const batch = db.batch();

//         // Add order to Firestore
//         const orderRef = db.collection('orders').doc(orderId);
//         batch.set(orderRef, orderData);

//         // Update product stock only if payment is successful or it's COD
//         if (paymentMethod === 'cod' || (paymentMethod !== 'cod' && paymentDetails?.transactionId)) {
//             // Update stock for each product
//             for (const item of validatedItems) {
//                 const productRef = db.collection('products').doc(item.productId);
//                 const productDoc = await productRef.get();

//                 if (productDoc.exists) {
//                     const productData = productDoc.data();
//                     const currentStock = productData.quantity || productData.stock || 0;
//                     const newStock = Math.max(0, currentStock - item.quantity);

//                     batch.update(productRef, {
//                         quantity: newStock,
//                         stock: newStock,
//                         updatedAt: serverTimestamp
//                     });
//                 }
//             }
//         }
//         // add orderId
//         batch.update(settingsRef, {
//             'orders.orderId': firebaseAdmin.firestore.FieldValue.increment(1)
//         });

//         // Commit the batch
//         await batch.commit();

//         console.log(`✅ Order placed successfully: ${orderId} for user: ${userId}`);

//         // Prepare response data (exclude sensitive information)
//         const responseData = {
//             orderId: orderId,
//             orderNumber: orderId,
//             status: 0,
//             totalAmount: orderTotals.finalTotal,
//             paymentMethod: paymentMethod,
//             paymentStatus: orderData.payment.status,
//             estimatedDelivery: '3-5 business days', // You can make this dynamic based on pincode
//             items: validatedItems,
//             pricing: orderTotals,
//             deliveryAddress: orderData.deliveryAddress
//         };

//         res.status(201).json({
//             success: true,
//             message: 'Order placed successfully',
//             order: responseData,
//             documentId: orderRef.id
//         });

//     } catch (error) {
//         console.error('❌ Error placing order:', error);

//         // Handle specific errors
//         let statusCode = 500;
//         let message = 'Failed to place order. Please try again.';

//         if (error.message.includes('not found') || error.message.includes('not available')) {
//             statusCode = 404;
//             message = error.message;
//         } else if (error.message.includes('Insufficient stock') || error.message.includes('Error validating')) {
//             statusCode = 400;
//             message = error.message;
//         }

//         res.status(statusCode).json({
//             success: false,
//             message: message,
//             error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//         });
//     }
// });



// ============================================
// /place-order ENDPOINT
// ============================================

// app.post('/place-order', authenticateToken, async (req, res) => {
//     try {
//         const user = req.user;
//         const userId = user.userId;
//         console.log(userId, 'user');

//         const {
//             items,
//             deliveryAddress: {
//                 fullName,
//                 phone,
//                 email,
//                 addressLine1,
//                 addressLine2,
//                 city,
//                 state,
//                 pincode,
//                 landmark,
//                 addressType
//             },
//             paymentMethod,
//             paymentDetails,
//             deliveryCharge = 0,
//             codCharge = 0,
//             discountAmount = 0,
//             couponCode,
//             specialInstructions,
//             preferredDeliveryDate,
//             preferredDeliveryTime
//         } = req.body;

//         // Input Validation
//         const validationErrors = [];

//         if (!userId) {
//             validationErrors.push('User ID is required');
//         }

//         if (!items || !Array.isArray(items) || items.length === 0) {
//             validationErrors.push('Order items are required');
//         }

//         if (!fullName || !phone || !addressLine1 || !city || !state || !pincode) {
//             validationErrors.push('Complete delivery address is required');
//         }

//         if (!paymentMethod || !['prepaid', 'cod', 'online'].includes(paymentMethod)) {
//             validationErrors.push('Valid payment method is required (prepaid, cod, or online)');
//         }

//         if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
//             validationErrors.push('Please provide a valid 10-digit phone number');
//         }

//         if (pincode && !/^\d{6}$/.test(pincode)) {
//             validationErrors.push('Please provide a valid 6-digit pincode');
//         }

//         if (validationErrors.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Validation failed',
//                 errors: validationErrors
//             });
//         }

//         // Verify user exists and is active
//         const userQuery = await db.collection('users')
//             .where('userId', '==', userId)
//             .where('active', '==', true)
//             .where('delete', '==', false)
//             .get();

//         if (userQuery.empty) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'User not found or inactive'
//             });
//         }

//         const userData = userQuery.docs[0].data();

//         // Fetch settings document to get next order ID
//         const settingsRef = db.collection('settings').doc('global');
//         const settingsDoc = await settingsRef.get();
//         const settings = settingsDoc.data();

//         // Generate unique order ID from settings
//         const nextOrderId = settings.orders.orderId || 1;
//         const orderId = `OD${nextOrderId}`;

//         // Validate and process order items
//         const validatedItems = await validateOrderItems(items);

//         // Calculate order totals dynamically using refactored method
//         const orderTotals = calculateOrderTotals(validatedItems, Number(deliveryCharge), discountAmount, Number(codCharge));

//         // Create timestamps
//         const serverTimestamp = firebaseAdmin.firestore.FieldValue.serverTimestamp();
//         const currentTimestamp = new Date();

//         // Prepare order data
//         const orderData = {
//             // Order Identification
//             orderId: orderId,
//             orderNumber: orderId,

//             // User Information
//             userId: userId,
//             userDetails: {
//                 name: userData.name,
//                 email: userData.email,
//                 phone: userData.phone || phone
//             },

//             // Order Items
//             items: validatedItems,
//             itemCount: validatedItems.length,
//             totalQuantity: validatedItems.reduce((sum, item) => sum + item.quantity, 0),

//             // Pricing Information
//             pricing: {
//                 subtotal: orderTotals.subtotal,
//                 totalMRP: orderTotals.totalMRP,
//                 totalSavings: orderTotals.totalSavings,
//                 deliveryCharge: orderTotals.deliveryCharge,
//                 codCharge: Number(codCharge),
//                 discountAmount: orderTotals.discountAmount,
//                 gst: orderTotals.gstAmount || 0,
//                 finalTotal: orderTotals.finalTotal
//             },

//             // Delivery Address
//             deliveryAddress: {
//                 fullName: fullName.trim(),
//                 phone: phone.replace(/\D/g, ''),
//                 email: email?.trim() || userData.email,
//                 addressLine1: addressLine1.trim(),
//                 addressLine2: addressLine2?.trim() || '',
//                 city: city.trim(),
//                 state: state.trim(),
//                 pincode: pincode.replace(/\D/g, ''),
//                 landmark: landmark?.trim() || '',
//                 addressType: addressType || 'Home',
//                 fullAddress: `${addressLine1.trim()}, ${addressLine2?.trim() || ''}, ${city.trim()}, ${state.trim()} - ${pincode}`.replace(', ,', ',')
//             },

//             // Payment Information
//             payment: {
//                 paymentMethod: paymentMethod,
//                 status: paymentMethod === 'cod' ? 'pending' : (paymentDetails?.transactionId ? 'completed' : 'pending'),
//                 amount: orderTotals.finalTotal,
//                 currency: 'INR',
//                 details: paymentDetails || {},
//                 transactionId: paymentDetails?.transactionId || null,
//                 paymentGateway: paymentDetails?.paymentGateway || null,
//                 paymentId: paymentDetails?.paymentId || null
//             },

//             // Order Status
//             status: 0,
//             orderStage: 'placed',
//             trackingStages: [
//                 {
//                     stage: 'placed',
//                     status: 'completed',
//                     timestamp: currentTimestamp,
//                     description: 'Order placed successfully'
//                 }
//             ],

//             // Delivery Information
//             delivery: {
//                 type: 'standard',
//                 preferredDate: preferredDeliveryDate || null,
//                 preferredTime: preferredDeliveryTime || null,
//                 estimatedDate: null,
//                 actualDate: null,
//                 trackingNumber: null,
//                 courierPartner: null
//             },

//             // Additional Information
//             couponCode: couponCode || null,
//             specialInstructions: specialInstructions?.trim() || '',

//             // Flags
//             active: true,
//             delete: false,
//             isPreorder: false,
//             isCancelledbyCustomer: false,
//             isReturnable: true,

//             // Timestamps
//             createdAt: serverTimestamp,
//             updatedAt: serverTimestamp,

//             // Metadata
//             metadata: {
//                 source: 'web',
//                 ipAddress: req.ip || req.connection.remoteAddress,
//                 userAgent: req.get('User-Agent') || 'Unknown',
//                 orderSource: 'website'
//             }
//         };

//         // Start a batch operation
//         const batch = db.batch();

//         // Add order to Firestore
//         const orderRef = db.collection('orders').doc(orderId);
//         batch.set(orderRef, orderData);

//         // Update product stock
//         if (paymentMethod === 'cod' || (paymentMethod !== 'cod' && paymentDetails?.transactionId)) {
//             for (const item of validatedItems) {
//                 const productRef = db.collection('products').doc(item.productId);
//                 const productDoc = await productRef.get();

//                 if (productDoc.exists) {
//                     const productData = productDoc.data();
//                     const currentStock = productData.quantity || productData.stock || 0;
//                     const newStock = Math.max(0, currentStock - item.quantity);

//                     batch.update(productRef, {
//                         quantity: newStock,
//                         stock: newStock,
//                         updatedAt: serverTimestamp
//                     });
//                 }
//             }
//         }

//         // Update settings
//         batch.update(settingsRef, {
//             'orders.orderId': firebaseAdmin.firestore.FieldValue.increment(1)
//         });

//         // Commit the batch
//         await batch.commit();

//         console.log(`✅ Order placed successfully: ${orderId} for user: ${userId}`);

//         // Prepare response
//         const responseData = {
//             orderId: orderId,
//             orderNumber: orderId,
//             status: 0,
//             totalAmount: orderTotals.finalTotal,
//             paymentMethod: paymentMethod,
//             paymentStatus: orderData.payment.status,
//             estimatedDelivery: '3-5 business days',
//             items: validatedItems,
//             pricing: orderTotals,
//             deliveryAddress: orderData.deliveryAddress
//         };

//         res.status(201).json({
//             success: true,
//             message: 'Order placed successfully',
//             order: responseData,
//             documentId: orderRef.id
//         });

//     } catch (error) {
//         console.error('❌ Error placing order:', error);

//         let statusCode = 500;
//         let message = 'Failed to place order. Please try again.';

//         if (error.message.includes('not found') || error.message.includes('not available')) {
//             statusCode = 404;
//             message = error.message;
//         } else if (error.message.includes('Insufficient stock') || error.message.includes('Error validating')) {
//             statusCode = 400;
//             message = error.message;
//         }

//         res.status(statusCode).json({
//             success: false,
//             message: message,
//             error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//         });
//     }
// });

app.post('/place-order', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const userId = user.userId;

        const {
            items,
            deliveryAddress,
            paymentMethod,
            paymentDetails,
            deliveryCharge = 0,
            codCharge = 0,
            discountAmount = 0,
            couponCode,
            specialInstructions,
            preferredDeliveryDate,
            preferredDeliveryTime
        } = req.body;

        // ---------------- VALIDATION ----------------
        if (!userId) throw new Error('User ID is required');
        if (!items || !Array.isArray(items) || items.length === 0)
            throw new Error('Order items are required');

        const {
            fullName,
            phone,
            email,
            addressLine1,
            addressLine2,
            city,
            state,
            pincode,
            landmark,
            addressType
        } = deliveryAddress || {};

        if (!fullName || !phone || !addressLine1 || !city || !state || !pincode)
            throw new Error('Complete delivery address is required');

        // ---------------- USER CHECK ----------------
        const userQuery = await db.collection('users')
            .where('userId', '==', userId)
            .where('active', '==', true)
            .where('delete', '==', false)
            .get();

        if (userQuery.empty) throw new Error('User not found');

        const userData = userQuery.docs[0].data();

        // ---------------- ORDER & INVOICE IDs ----------------
        const settingsRef = db.collection('settings').doc('global');
        const settingsDoc = await settingsRef.get();
        const settingsData = settingsDoc.data();
        
        const nextOrderId = settingsData?.orders?.orderId || 1;
        const nextInvoiceNo = settingsData?.invoices?.invoiceId || 1;

        const orderId = `OD${nextOrderId}`;
        const invoiceNo = `INV-${nextInvoiceNo}`;

        // ---------------- VALIDATE ITEMS ----------------
        const validatedItems = await validateOrderItems(items);

        // ---------------- COUPON RESTRICTIONS ----------------
        let applicableProductIds = null;
        if (couponCode) {
            const couponSnap = await db.collection('coupons')
                .where('code', '==', couponCode.toUpperCase())
                .where('delete', '==', false)
                .limit(1)
                .get();
                
            if (!couponSnap.empty) {
                const couponData = couponSnap.docs[0].data();
                if (couponData.productType === 'SPECIFIC') {
                    applicableProductIds = couponData.productIds || (couponData.productID ? [couponData.productID] : []);
                }
            }
        }

        // ---------------- CALCULATE PRICING ----------------
        const orderTotals = calculateOrderTotals(
            validatedItems,
            Number(deliveryCharge),
            Number(discountAmount),
            Number(codCharge),
            paymentMethod,
            applicableProductIds
        );

        // ---------------- TIMESTAMP ----------------
        const serverTimestamp = firebaseAdmin.firestore.FieldValue.serverTimestamp();
        const now = new Date();

        // ---------------- CLEAN ORDER DATA ----------------
        const orderData = {
            orderId,
            orderNumber: orderId,
            invoiceNo,

            // USER
            userId,
            userDetails: {
                name: userData.name,
                email: userData.email,
                phone: userData.phone || phone
            },

            // ✅ ONLY ONE ITEMS ARRAY
            items: validatedItems,
            itemCount: validatedItems.length,
            totalQuantity: validatedItems.reduce((sum, i) => sum + i.quantity, 0),

            // ✅ ONLY ONE PRICING OBJECT
            pricing: {
                subtotal: Number(orderTotals.subtotal || 0),
                totalMRP: Number(orderTotals.totalMRP || 0),
                totalSavings: Number(orderTotals.totalSavings || 0),
                deliveryCharge: Number(orderTotals.deliveryCharge || 0),
                codCharge: Number(codCharge || 0),
                discountAmount: Number(orderTotals.discountAmount || 0),
                gst: Number(orderTotals.gstAmount || 0),
                finalTotal: Number(orderTotals.finalTotal || 0),
                itemsPricing: orderTotals.itemsPricing || []
            },

            // ADDRESS
            deliveryAddress: {
                fullName: fullName.trim(),
                phone: phone.replace(/\D/g, ''),
                email: email || userData.email,
                addressLine1: addressLine1.trim(),
                addressLine2: addressLine2 || '',
                city: city.trim(),
                state: state.trim(),
                pincode: pincode.replace(/\D/g, ''),
                landmark: landmark || '',
                addressType: addressType || 'Home',
                fullAddress: `${addressLine1}, ${city}, ${state} - ${pincode}`
            },

            // PAYMENT
            payment: {
                paymentMethod,
                status:
                    paymentMethod === 'cod'
                        ? 'pending'
                        : (paymentDetails?.transactionId || paymentDetails?.paymentId || paymentDetails?.razorpayPaymentId)
                        ? 'completed'
                        : 'pending',
                amount: orderTotals.finalTotal,
                currency: 'INR',
                transactionId: paymentDetails?.transactionId || null,
                paymentGateway: paymentDetails?.paymentGateway || null,
                paymentId: paymentDetails?.paymentId || null
            },

            // STATUS
            status: 0,
            orderStage: 'placed',
            trackingStages: [
                {
                    stage: 'placed',
                    status: 'completed',
                    timestamp: now,
                    description: 'Order placed successfully'
                }
            ],

            // DELIVERY
            delivery: {
                type: 'standard',
                preferredDate: preferredDeliveryDate || null,
                preferredTime: preferredDeliveryTime || null,
                estimatedDate: null,
                actualDate: null,
                trackingNumber: null,
                courierPartner: null
            },

            // EXTRA
            couponCode: couponCode || null,
            specialInstructions: specialInstructions || '',

            active: true,
            delete: false,
            isPreorder: false,
            isCancelledbyCustomer: false,
            isReturnable: true,

            createdAt: serverTimestamp,
            updatedAt: serverTimestamp
        };

        // ---------------- GENERATE INVOICE ----------------
        try {
            const invoiceDetails = {
                orderId: orderId,
                userData: userData,
                deliveryAddress: orderData.deliveryAddress,
                items: validatedItems,
                pricing: orderTotals,
                payment: orderData.payment,
                couponCode: couponCode,
                createdAt: now
            };
            orderData.invoice = generateInvoiceData(invoiceDetails);
        } catch (invoiceError) {
            console.error('Invoice generation error:', invoiceError);
            // Non-blocking but should be logged
        }

        // ---------------- SAVE ----------------
        const batch = db.batch();
        const orderRef = db.collection('orders').doc(orderId);

        batch.set(orderRef, orderData);

        // STOCK UPDATE
        if (paymentMethod === 'cod' || paymentDetails?.transactionId) {
            for (const item of validatedItems) {
                const productRef = db.collection('products').doc(item.productId);
                const productDoc = await productRef.get();

                if (productDoc.exists) {
                    const stock = productDoc.data().stock || 0;
                    batch.update(productRef, {
                        stock: Math.max(0, stock - item.quantity),
                        updatedAt: serverTimestamp
                    });
                }
            }
        }

        // UPDATE ORDER & INVOICE IDs
        batch.update(settingsRef, {
            'orders.orderId': firebaseAdmin.firestore.FieldValue.increment(1),
            'invoices.invoiceId': firebaseAdmin.firestore.FieldValue.increment(1)
        });

        await batch.commit();

        // ---------------- SEND EMAIL NOTIFICATION ----------------
        try {
            const userEmail = orderData.deliveryAddress.email || userData.email;
            if (userEmail) {
                await sendOrderConfirmationEmail(userEmail, {
                    orderId: orderId,
                    totalAmount: orderTotals.finalTotal,
                    items: validatedItems
                });
            }
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }

        // ---------------- RESPONSE ----------------
        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            orderId,
            total: orderTotals.finalTotal,
            order: { ...orderData, id: orderId }
        });

    } catch (error) {
        console.error('❌ ERROR:', error.message);

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to place order'
        });
    }
});


////place order thats before  invoice 

app.post('/single-product-place-order', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const userId = user.userId;
        console.log(userId, 'user');

        const {
            // Single Product Information
            productId,
            quantity = 1,
            variant, // Optional: size, color, etc.
            price, // Optional: if variant price differs
            originalPrice,
            gstRate, // Optional: if variant gst differs

            // Delivery Address
            deliveryAddress: {
                fullName,
                phone,
                email,
                addressLine1,
                addressLine2,
                city,
                state,
                pincode,
                landmark,
                addressType = 'Home'
            },

            // Payment Information
            paymentMethod, // 'prepaid', 'cod', 'online'
            paymentDetails, // For prepaid orders: {transactionId, paymentGateway}

            // Optional Order Details
            deliveryCharge = 0,
            codCharge = 0,
            discountAmount = 0,
            couponCode,
            specialInstructions,
            preferredDeliveryDate,
            preferredDeliveryTime // 'morning', 'afternoon', 'evening'

        } = req.body;

        // Input Validation
        const validationErrors = [];

        if (!userId) {
            validationErrors.push('User ID is required');
        }

        if (!productId) {
            validationErrors.push('Product ID is required');
        }

        if (!quantity || quantity < 1 || quantity > 10) {
            validationErrors.push('Quantity must be between 1 and 10');
        }

        if (!fullName || !phone || !addressLine1 || !city || !state || !pincode) {
            validationErrors.push('Complete delivery address is required');
        }

        if (!paymentMethod || !['prepaid', 'cod', 'online'].includes(paymentMethod)) {
            validationErrors.push('Valid payment method is required (prepaid, cod, or online)');
        }

        // Validate phone number (10 or 12 digits)
        const cleanPhone = phone.replace(/\D/g, '');
        if (phone && cleanPhone.length !== 10 && cleanPhone.length !== 12) {
            validationErrors.push('Please provide a valid 10 or 12-digit phone number');
        }

        // Validate pincode (6 digits)
        if (pincode && !/^\d{6}$/.test(pincode.toString().replace(/\D/g, ''))) {
            validationErrors.push('Please provide a valid 6-digit pincode');
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Verify user exists and is active
        const userQuery = await db.collection('users')
            .where('userId', '==', userId)
            .where('active', '==', true)
            .where('delete', '==', false)
            .get();

        if (userQuery.empty) {
            return res.status(404).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        const userData = userQuery.docs[0].data();

        // ---------------- ORDER & INVOICE IDs ----------------
        const settingsRef = db.collection('settings').doc('global');
        const settingsDoc = await settingsRef.get();
        const settingsData = settingsDoc.data();
        
        const nextOrderId = settingsData?.orders?.orderId || 1;
        const nextInvoiceNo = settingsData?.invoices?.invoiceId || 1;

        const orderId = `OD${nextOrderId}`;
        const invoiceNo = `INV-${nextInvoiceNo}`;

        // Verify product exists and is available
        const productDoc = await db.collection('products').doc(productId).get();

        if (!productDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const productData = productDoc.data();

        // Check if product is active and available
        if (!productData.active || productData.delete) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }

        // Check stock availability
        const currentStock = productData.quantity || productData.stock || 0;
        if (currentStock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`
            });
        }

        // Create a single item array to match the structure of the regular place order API
        const items = [{
            productId: productId,
            name: productData.name || productData.title || 'Unknown Product',
            productImage: productData.images?.[0] || productData.image || '',
            quantity: quantity,
            price: price !== undefined && price !== null ? price : (productData.price || productData.sellingPrice || 0),
            mrp: originalPrice !== undefined && originalPrice !== null ? originalPrice : (productData.mrp || productData.originalPrice || productData.price || 0),
            gstRate: gstRate !== undefined && gstRate !== null ? parseFloat(gstRate) : null,
            variant: variant || null,
            sku: productData.sku || null,
            category: productData.category || null
        }];

        // Validate and process order items (using the same function as the regular API)
        const validatedItems = await validateOrderItems(items);

        // Calculate order totals (using the same function as the regular API)
        const orderTotals = calculateOrderTotals(validatedItems, Number(deliveryCharge), discountAmount, Number(codCharge), paymentMethod);

        // Create timestamps
        const serverTimestamp = firebaseAdmin.firestore.FieldValue.serverTimestamp();
        const currentTimestamp = new Date();

        // Prepare order data with the exact same structure as the regular API
        const orderData = {
            // Order Identification
            orderId: orderId,
            orderNumber: orderId,
            invoiceNo: invoiceNo,

            // User Information
            userId: userId,
            userDetails: {
                name: userData.name,
                email: userData.email,
                phone: userData.phone || phone
            },

            // Order Items (as an array with one item)
            items: validatedItems,
            itemCount: validatedItems.length,
            totalQuantity: validatedItems.reduce((sum, item) => sum + item.quantity, 0),

            // Pricing Information
            pricing: {
                subtotal: Number(orderTotals.subtotal || 0),
                totalMRP: Number(orderTotals.totalMRP || 0),
                totalSavings: Number(orderTotals.totalSavings || 0),
                deliveryCharge: Number(orderTotals.deliveryCharge || 0),
                codCharge: Number(codCharge || 0),
                discountAmount: Number(orderTotals.discountAmount || 0),
                gst: Number(orderTotals.gstAmount || 0),
                finalTotal: Number(orderTotals.finalTotal || 0),
                itemsPricing: orderTotals.itemsPricing || []
            },

            // Delivery Address
            deliveryAddress: {
                fullName: fullName.trim(),
                phone: phone.replace(/\D/g, ''),
                email: email?.trim() || userData.email,
                addressLine1: addressLine1.trim(),
                addressLine2: addressLine2?.trim() || '',
                city: city.trim(),
                state: state.trim(),
                pincode: pincode.replace(/\D/g, ''),
                landmark: landmark?.trim() || '',
                addressType: addressType || 'Home',
                fullAddress: `${addressLine1.trim()}, ${addressLine2?.trim() || ''}, ${city.trim()}, ${state.trim()} - ${pincode}`.replace(', ,', ',')
            },

            // Payment Information
            payment: {
                paymentMethod: paymentMethod,
                status: paymentMethod === 'cod' ? 'pending' : ((paymentDetails?.transactionId || paymentDetails?.paymentId || paymentDetails?.razorpayPaymentId) ? 'completed' : 'pending'),
                amount: orderTotals.finalTotal,
                currency: 'INR',
                details: paymentDetails || {},
                transactionId: paymentDetails?.transactionId || null,
                paymentGateway: paymentDetails?.paymentGateway || null,
                paymentId: paymentDetails?.paymentId || null
            },

            // Order Status
            status: 0,
            orderStage: 'placed',
            trackingStages: [
                {
                    stage: 'placed',
                    status: 'completed',
                    timestamp: currentTimestamp,
                    description: 'Order placed successfully'
                }
            ],

            // Delivery Information
            delivery: {
                type: 'standard',
                preferredDate: preferredDeliveryDate || null,
                preferredTime: preferredDeliveryTime || null,
                estimatedDate: null,
                actualDate: null,
                trackingNumber: null,
                courierPartner: null
            },

            // Additional Information
            couponCode: couponCode || null,
            specialInstructions: specialInstructions?.trim() || '',

            // Flags
            active: true,
            delete: false,
            isPreorder: false,
            isCancellable: true,
            isCancelledbyCustomer: false,
            isReturnable: true,

            // Timestamps
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,

            // Metadata
            metadata: {
                source: 'web',
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent') || 'Unknown',
                orderSource: 'website'
            },

            // Generate Invoice (Placeholder)
            invoice: null
        };

        // ---------------- GENERATE INVOICE ----------------
        try {
            const invoiceDetails = {
                orderId: orderId,
                userData: userData,
                deliveryAddress: orderData.deliveryAddress,
                items: validatedItems,
                pricing: orderTotals,
                payment: orderData.payment,
                couponCode: couponCode,
                createdAt: currentTimestamp
            };
            orderData.invoice = generateInvoiceData(invoiceDetails);
        } catch (invoiceError) {
            console.error('Invoice generation error in single-product:', invoiceError);
        }

        // Start a batch operation to ensure data consistency
        const batch = db.batch();

        // Add order to Firestore
        const orderRef = db.collection('orders').doc(orderId);
        batch.set(orderRef, orderData);

        // Update product stock only if payment is successful or it's COD
        if (paymentMethod === 'cod' || (paymentMethod !== 'cod' && paymentDetails?.transactionId)) {
            // Update stock for the product
            const newStock = Math.max(0, currentStock - quantity);

            batch.update(productDoc.ref, {
                quantity: newStock,
                stock: newStock,
                updatedAt: serverTimestamp
            });
        }

        // Update settings
        batch.update(settingsRef, {
            'orders.orderId': firebaseAdmin.firestore.FieldValue.increment(1),
            'invoices.invoiceId': firebaseAdmin.firestore.FieldValue.increment(1)
        });

        // Commit the batch
        await batch.commit();

        console.log(`✅ Single product order placed successfully: ${orderId} for user: ${userId}`);

        // ---------------- SEND EMAIL NOTIFICATION ----------------
        try {
            const userEmail = orderData.deliveryAddress.email || userData.email;
            if (userEmail) {
                await sendOrderConfirmationEmail(userEmail, {
                    orderId: orderId,
                    totalAmount: orderTotals.finalTotal,
                    items: validatedItems
                });
            }
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }

        // Prepare response data (exact same structure as the regular API)
        const responseData = {
            orderId: orderId,
            orderNumber: orderId,
            status: 0,
            totalAmount: orderTotals.finalTotal,
            paymentMethod: paymentMethod,
            paymentStatus: orderData.payment.status,
            estimatedDelivery: '3-5 business days',
            items: validatedItems,
            pricing: orderTotals,
            deliveryAddress: orderData.deliveryAddress
        };

        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            order: responseData,
            documentId: orderRef.id
        });

    } catch (error) {
        console.error('❌ Error placing single product order:', error);

        // Handle specific errors
        let statusCode = 500;
        let message = 'Failed to place order. Please try again.';

        if (error.message.includes('not found') || error.message.includes('not available')) {
            statusCode = 404;
            message = error.message;
        } else if (error.message.includes('Insufficient stock') || error.message.includes('Error validating')) {
            statusCode = 400;
            message = error.message;
        }

        res.status(statusCode).json({
            success: false,
            message: message,
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});


// Helper to get GST State Code
function getStateCode(stateName) {
    const stateCodes = {
        'jammu & kashmir': '01',
        'jammu and kashmir': '01',
        'himachal pradesh': '02',
        'punjab': '03',
        'chandigarh': '04',
        'uttarakhand': '05',
        'haryana': '06',
        'delhi': '07',
        'rajasthan': '08',
        'uttar pradesh': '09',
        'bihar': '10',
        'sikkim': '11',
        'arunachal pradesh': '12',
        'nagaland': '13',
        'manipur': '14',
        'mizoram': '15',
        'tripura': '16',
        'meghalaya': '17',
        'assam': '18',
        'west bengal': '19',
        'jharkhand': '20',
        'odisha': '21',
        'chhattisgarh': '22',
        'madhya pradesh': '23',
        'gujarat': '24',
        'daman & diu': '25',
        'daman and diu': '25',
        'dadra & nagar haveli': '26',
        'dadra and nagar haveli': '26',
        'maharashtra': '27',
        'andhra pradesh': '37',
        'karnataka': '29',
        'goa': '30',
        'lakshadweep': '31',
        'kerala': '32',
        'tamil nadu': '33',
        'puducherry': '34',
        'pondicherry': '34',
        'andaman & nicobar islands': '35',
        'andaman and nicobar islands': '35',
        'telangana': '36',
        'ladakh': '38'
    };

    if (!stateName) return '32'; // Default to Kerala if missing
    
    const normalizedState = stateName.toLowerCase().trim();
    return stateCodes[normalizedState] || '32'; // Default to Kerala if not found
}

// ============================================

// ============================================




app.post('/cancel-order/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const user = req.user;
        const userId = user.userId;

        // Input validation
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Extract reason, categoryName, and feedback from different possible structures
        let reason, categoryName, feedback;

        // Check if data is in nested cancellation object
        if (req.body.cancellation) {
            reason = req.body.cancellation.reason || req.body.cancellation.cancelreason;
            categoryName = req.body.cancellation.categoryName;
            feedback = req.body.cancellation.feedback;
        } else {
            // Check if data is directly in request body
            reason = req.body.reason || req.body.cancelreason;
            categoryName = req.body.categoryName;
            feedback = req.body.feedback;
        }

        if (!reason || !categoryName) {
            return res.status(400).json({
                success: false,
                message: 'Cancellation reason and category name are required',
                debug: {
                    receivedBody: req.body,
                    extractedReason: reason,
                    extractedCategoryName: categoryName,
                    extractedFeedback: feedback
                }
            });
        }

        // Validate feedback if provided
        if (feedback && typeof feedback !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Feedback must be a string'
            });
        }

        // Find the order in the orders collection
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const orderData = orderDoc.data();

        // Verify order belongs to the user (security check)
        if (orderData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to cancel this order'
            });
        }

        // Check if order is already cancelled
        if (orderData.isCancelledbyCustomer === true || orderData.status === 3) {
            return res.status(400).json({
                success: false,
                message: 'Order is already cancelled'
            });
        }

        // Check if order can be cancelled (e.g., not delivered yet)
        const allowedStatusesForCancellation = [0, 1, 2]; // pending, confirmed, processing
        if (!allowedStatusesForCancellation.includes(orderData.status)) {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be cancelled at this stage'
            });
        }

        const currentDate = new Date();

        // Prepare cancellation data with feedback
        const cancellationData = {
            cancelledByCustomer: true,
            cancelledDate: currentDate,
            categoryName: categoryName,
            cancelreason: reason,
            feedback: feedback || null, // Include feedback if provided
            refundAmount: orderData.pricing?.finalTotal || 0,
            refundStatus: orderData.payment?.method === 'cod' ? 'not_applicable' : 'pending',
            type: 'full_cancellation'
        };

        // Update order document
        const updateData = {
            isCancelledbyCustomer: true,
            status: 3, // Set status to cancelled
            orderStage: 'cancelled',
            cancellation: cancellationData, // Create cancellation object with feedback
            updatedAt: currentDate,
            // Update all items status to cancelled
            items: orderData.items?.map(item => ({
                ...item,
                status: 3, // cancelled status
                cancellation: {
                    reason: reason,
                    date: currentDate,
                    type: 'customer_request',
                    categoryName: categoryName,
                    feedback: feedback || null // Include feedback at item level too
                }
            })) || []
        };

        // Update the order in Firestore
        await orderRef.update(updateData);


        // Store feedback separately for analytics (optional)
        if (feedback && feedback.trim()) {
            try {
                await db.collection('cancellation_feedback').add({
                    orderId: orderId,
                    userId: userId,
                    categoryName: categoryName,
                    reason: reason,
                    feedback: feedback.trim(),
                    createdAt: currentDate,
                    orderValue: orderData.pricing?.finalTotal || 0,
                    orderDate: orderData.createdAt || null
                });
                console.log(`📝 Cancellation feedback stored for order: ${orderId}`);
            } catch (feedbackError) {
                console.error('⚠️ Error storing cancellation feedback:', feedbackError);
                // Don't fail the cancellation if feedback storage fails
            }
        }

        // Log the cancellation
        console.log(`✅ Order cancelled successfully: ${orderId} by user: ${userId}${feedback ? ' (with feedback)' : ''}`);

        // Prepare response data
        const responseData = {
            orderId: orderData.orderId,
            orderNumber: orderData.orderNumber,
            cancellation: {
                cancelledByCustomer: true,
                cancelledDate: currentDate,
                categoryName: categoryName,
                reason: reason,
                feedback: feedback || null,
                refundAmount: cancellationData.refundAmount,
                refundStatus: cancellationData.refundStatus
            }
        };

        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            data: responseData
        });

    } catch (error) {
        console.error('❌ Error cancelling order:', error);

        let statusCode = 500;
        let message = 'Failed to cancel order';

        if (error.message.includes('not found')) {
            statusCode = 404;
            message = 'Order not found';
        } else if (error.message.includes('Unauthorized')) {
            statusCode = 403;
            message = 'Unauthorized to cancel this order';
        }

        res.status(statusCode).json({
            success: false,
            message: message,
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

app.post('/request-cancel-order/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const user = req.user;
        const userId = user.userId;

        // Input validation
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Extract reason, categoryName, and feedback from different possible structures
        let reason, categoryName, feedback;

        // Check if data is in nested cancellation object
        if (req.body.cancellation) {
            reason = req.body.cancellation.reason || req.body.cancellation.cancelreason;
            categoryName = req.body.cancellation.categoryName;
            feedback = req.body.cancellation.feedback;
        } else {
            // Check if data is directly in request body
            reason = req.body.reason || req.body.cancelreason;
            categoryName = req.body.categoryName;
            feedback = req.body.feedback;
        }

        if (!reason || !categoryName) {
            return res.status(400).json({
                success: false,
                message: 'Cancellation reason and category name are required',
                debug: {
                    receivedBody: req.body,
                    extractedReason: reason,
                    extractedCategoryName: categoryName,
                    extractedFeedback: feedback
                }
            });
        }

        // Validate feedback if provided
        if (feedback && typeof feedback !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Feedback must be a string'
            });
        }

        // Find the order in the orders collection
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const orderData = orderDoc.data();

        // Verify order belongs to the user (security check)
        if (orderData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to request cancellation for this order'
            });
        }

        // Check if order is already cancelled
        if (orderData.isCancelledbyCustomer === true || orderData.status === 3) {
            return res.status(400).json({
                success: false,
                message: 'Order is already cancelled'
            });
        }

        // Check if order can have cancellation requested
        const allowedStatusesForCancellationRequest = [0, 1]; // placed, in transit
        if (!allowedStatusesForCancellationRequest.includes(orderData.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cancellation request cannot be made for this order at this stage'
            });
        }

        // Check if a cancellation request already exists for this order
        const existingRequestQuery = await db.collection('cancellation_requests')
            .where('orderId', '==', orderId)
            .where('userId', '==', userId)
            .where('status', 'in', ['pending', 'under_review'])
            .get();

        if (!existingRequestQuery.empty) {
            return res.status(400).json({
                success: false,
                message: 'A cancellation request has already been submitted for this order'
            });
        }

        const currentDate = new Date();

        // Prepare cancellation request data
        const cancellationRequestData = {
            orderId: orderId,
            userId: userId,
            orderNumber: orderData.orderNumber || orderData.orderId,

            // Order details for admin reference
            orderDetails: {
                items: orderData.items || [],
                totalAmount: orderData.pricing?.finalTotal || 0,
                paymentMethod: orderData.payment?.method || 'unknown',
                paymentId: orderData.payment?.paymentId || null,
                orderDate: orderData.createdAt || null,
                orderStatus: orderData.status,
                orderStage: orderData.orderStage || 'unknown'
            },

            // Cancellation request details
            cancellationDetails: {
                reason: reason,
                categoryName: categoryName,
                feedback: feedback || null,
                requestedDate: currentDate,
                requestType: 'customer_request'
            },

            // Request status tracking
            status: 'pending', // pending, under_review, approved, rejected
            adminResponse: null,
            adminUserId: null,
            reviewedDate: null,

            // Metadata
            createdAt: currentDate,
            updatedAt: currentDate
        };

        // Add the cancellation request to the database
        const cancellationRequestRef = await db.collection('cancellation_requests').add(cancellationRequestData);
        const cancellationRequestId = cancellationRequestRef.id;

        // Update order with cancellation request reference
        await orderRef.update({
            cancellationRequest: {
                requestId: cancellationRequestId,
                status: 'pending',
                requestedDate: currentDate,
                reason: reason,
                categoryName: categoryName
            },
            updatedAt: currentDate
        });

        // Store feedback separately for analytics (optional)
        if (feedback && feedback.trim()) {
            try {
                await db.collection('cancellation_feedback').add({
                    orderId: orderId,
                    userId: userId,
                    categoryName: categoryName,
                    reason: reason,
                    feedback: feedback.trim(),
                    requestType: 'cancellation_request',
                    createdAt: currentDate,
                    orderValue: orderData.pricing?.finalTotal || 0,
                    orderDate: orderData.createdAt || null
                });
                console.log(`Cancellation request feedback stored for order: ${orderId}`);
            } catch (feedbackError) {
                console.error('Error storing cancellation request feedback:', feedbackError);
                // Don't fail the request if feedback storage fails
            }
        }

        // Log the cancellation request
        console.log(`Cancellation request submitted successfully: ${orderId} by user: ${userId}${feedback ? ' (with feedback)' : ''}`);

        // Prepare response data
        const responseData = {
            orderId: orderData.orderId || orderId,
            orderNumber: orderData.orderNumber || orderData.orderId,
            cancellationRequest: {
                requestId: cancellationRequestId,
                status: 'pending',
                requestedDate: currentDate,
                reason: reason,
                categoryName: categoryName,
                feedback: feedback || null,
                estimatedReviewTime: '24-48 hours'
            }
        };

        res.status(200).json({
            success: true,
            message: 'Cancellation request submitted successfully. You will receive an update via email within 24-48 hours.',
            data: responseData
        });

    } catch (error) {
        console.error('Error submitting cancellation request:', error);

        let statusCode = 500;
        let message = 'Failed to submit cancellation request';

        if (error.message.includes('not found')) {
            statusCode = 404;
            message = 'Order not found';
        } else if (error.message.includes('Unauthorized')) {
            statusCode = 403;
            message = 'Unauthorized to request cancellation for this order';
        }

        res.status(statusCode).json({
            success: false,
            message: message,
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});




app.post('/CustomerRefundRequest', authenticateToken, upload.array('attachments', 5), async (req, res) => {
    try {
        console.log('🎫 Customer support/refund request received:', req.body);

        const user = req.user;
        const {
            fullName,
            phone,
            email,
            message,
            orderId,
            issueType = 'General Support'
        } = req.body;

        const files = req.files || [];

        // ✅ Validate required fields
        if (!fullName) return res.status(400).json({ success: false, error: 'Full name is required' });
        if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
        if (!message) return res.status(400).json({ success: false, error: 'Message is required' });
        if (!orderId) return res.status(400).json({ success: false, error: 'Order ID is required' });

        // ✅ Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
        }

        // ✅ Validate phone (more flexible regex for international numbers)
        const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
            return res.status(400).json({ success: false, error: 'Please provide a valid phone number' });
        }

        if (message.trim().length < 10) {
            return res.status(400).json({ success: false, error: 'Message must be at least 10 characters long' });
        }

        // ✅ Verify user exists
        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // ✅ Fetch order details from Firestore
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        const orderData = orderDoc.data();

        // Extract order information with fallbacks
        const orderInfo = {
            orderId: orderId,
            orderNumber: orderData.orderNumber || orderData.id || orderId,
            price: orderData.pricing?.finalTotal || orderData.pricing?.total || orderData.payment?.amount || 0,
            currency: orderData.pricing?.currency || orderData.payment?.currency || 'INR',
            createdAt: orderData.createdAt || null,
            paymentMethod: orderData.payment?.method || orderData.paymentMethod || 'Unknown',
            status: orderData.status || 'Unknown',
            deliveryAddress: orderData.delivery?.address || orderData.deliveryAddress || null,
            items: orderData.items || [],
            specialInstructions: orderData.specialInstructions || ''
        };

        // ✅ Upload attachments if any
        let attachments = [];
        if (files.length > 0) {
            const bucket = firebaseAdmin.storage().bucket();
            for (let file of files) {
                if (!file.mimetype.startsWith('image/')) {
                    return res.status(400).json({ success: false, error: `File ${file.originalname} is not an image` });
                }

                // Check file size (10MB limit)
                if (file.size > 10 * 1024 * 1024) {
                    return res.status(400).json({ success: false, error: `File ${file.originalname} is too large. Maximum size is 10MB` });
                }

                const fileName = `support-requests/${user.customDocId}/${Date.now()}_${file.originalname}`;
                const fileUpload = bucket.file(fileName);

                await new Promise((resolve, reject) => {
                    const stream = fileUpload.createWriteStream({
                        metadata: {
                            contentType: file.mimetype,
                            metadata: {
                                originalName: file.originalname,
                                uploadedBy: user.customDocId,
                                uploadedAt: new Date().toISOString(),
                                relatedOrder: orderId
                            }
                        }
                    });

                    stream.on('error', reject);
                    stream.on('finish', async () => {
                        try {
                            await fileUpload.makePublic();
                            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                            attachments.push({
                                fileName,
                                originalName: file.originalname,
                                publicUrl,
                                size: file.size,
                                mimetype: file.mimetype,
                                uploadedAt: new Date().toISOString()
                            });
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                    stream.end(file.buffer);
                });
            }
        }

        // ✅ Create support/refund request
        const supportRequest = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            type: issueType.toLowerCase().includes('refund') ? 'refund' : 'support',
            issueType: issueType.trim(),

            // Customer Information
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            message: message.trim(),

            // Order Information
            orderId,
            orderNumber: orderInfo.orderNumber,
            orderAmount: orderInfo.price,
            orderCurrency: orderInfo.currency,
            orderDate: orderInfo.createdAt,
            paymentMethod: orderInfo.paymentMethod,
            orderStatus: orderInfo.status,
            orderItems: orderInfo.items,
            deliveryAddress: orderInfo.deliveryAddress,
            specialInstructions: orderInfo.specialInstructions,

            // Request Information
            attachments,
            userId: user.customDocId,
            userEmail: user.email || email,
            status: 'pending',
            priority: 'medium',
            assignedTo: null,

            // Metadata
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),

            // Additional tracking
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            source: 'web_app'
        };

        // Determine collection based on issue type
        const collectionName = issueType.toLowerCase().includes('refund')
            ? 'customerRefundRequests'
            : 'customerSupportRequests';

        // Save support/refund request
        await db.collection(collectionName).doc(supportRequest.id).set(supportRequest);

        // Update user document with request reference
        const userData = userDoc.data();
        const userRequests = userData.supportRequests || [];
        await userRef.update({
            supportRequests: [...userRequests, {
                id: supportRequest.id,
                type: supportRequest.type,
                issueType: supportRequest.issueType,
                status: 'pending',
                submittedAt: new Date().toISOString(),
                orderId: orderId
            }],
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        // Create notification for admin (optional)
        try {
            await db.collection('adminNotifications').add({
                type: supportRequest.type === 'refund' ? 'new_refund_request' : 'new_support_request',
                title: `New ${supportRequest.issueType} Request`,
                message: `${fullName} submitted a ${issueType.toLowerCase()} request for order ${orderInfo.orderNumber}`,
                relatedId: supportRequest.id,
                orderId: orderId,
                userId: user.customDocId,
                priority: supportRequest.priority,
                read: false,
                createdAt: new Date().toISOString()
            });
        } catch (notificationError) {
            console.warn('Failed to create admin notification:', notificationError);
            // Don't fail the request if notification creation fails
        }



        console.log(`✅ ${supportRequest.type === 'refund' ? 'Refund' : 'Support'} request created:`, supportRequest.id);

        res.status(200).json({
            success: true,
            message: `${supportRequest.type === 'refund' ? 'Refund' : 'Support'} request submitted successfully`,
            request: {
                id: supportRequest.id,
                type: supportRequest.type,
                issueType: supportRequest.issueType,
                status: supportRequest.status,
                submittedAt: supportRequest.createdAt,
                orderId: orderId,
                orderNumber: orderInfo.orderNumber
            },
            totalRequests: userRequests.length + 1
        });

    } catch (error) {
        console.error('❌ Customer support/refund request error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit support request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


app.get('/orders', authenticateToken, async (req, res) => {
    try {
        const user = req.user; // from authenticateToken middleware
        console.log('📍 Orders endpoint hit');
        console.log('👤 User:', user);
        console.log('🔍 Query params:', req.query);

        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: No userId found'
            });
        }

        // Query user orders
        const snapshot = await db.collection('orders')
            .where('userId', '==', user.userId)
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({
                success: true,
                message: 'No orders found',
                orders: []
            });
        }

        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json({
            success: true,
            count: orders.length,
            orders
        });

    } catch (error) {
        console.error('❌ Error fetching orders:', error);

        let statusCode = 500;
        let message = 'Failed to fetch orders';

        // Show better errors
        if (error.code === 7) {
            message = 'Firestore permission denied – check Firestore security rules';
        } else if (error.message.includes('index')) {
            message = 'Firestore requires a composite index for this query';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});



// GET SINGLE ORDER BY ID API
app.get('/orders/:orderId', authenticateToken, async (req, res) => {
    try {
        // Get the authenticated user's information from the middleware
        const user = req.user;
        const { orderId } = req.params;

        // Input validation
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Query the order by orderId and ensure it belongs to the authenticated user
        const orderQuery = await db.collection('orders')
            .where('orderId', '==', orderId)
            .where('userId', '==', user.userId)
            .where('active', '==', true)
            .where('delete', '==', false)
            .limit(1)
            .get();

        if (orderQuery.empty) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or you do not have permission to view this order'
            });
        }

        const orderDoc = orderQuery.docs[0];
        const orderData = orderDoc.data();

        // Format the complete order data for response
        const formattedOrder = {
            documentId: orderDoc.id,
            orderId: orderData.orderId,
            orderNumber: orderData.orderNumber,
            status: orderData.status,
            orderStage: orderData.orderStage,
            createdAt: orderData.createdAt?.toDate(),
            updatedAt: orderData.updatedAt?.toDate(),

            // User details
            userDetails: orderData.userDetails,

            // Complete items information
            items: orderData.items,
            itemCount: orderData.itemCount,
            totalQuantity: orderData.totalQuantity,

            // Complete pricing breakdown
            pricing: orderData.pricing,

            // Complete delivery address
            deliveryAddress: orderData.deliveryAddress,

            // Payment information
            payment: {
                paymentMethod: orderData.payment?.paymentMethod,
                status: orderData.payment?.status,
                amount: orderData.payment?.amount,
                currency: orderData.payment?.currency,
                transactionId: orderData.payment?.transactionId,
                paymentGateway: orderData.payment?.paymentGateway,
                paymentId: orderData.payment?.paymentId
            },

            // Delivery information
            delivery: orderData.delivery,

            // Order tracking
            trackingStages: orderData.trackingStages,

            // Additional information
            couponCode: orderData.couponCode,
            specialInstructions: orderData.specialInstructions,
            isPreorder: orderData.isPreorder,
            isCancellable: orderData.isCancellable,
            isReturnable: orderData.isReturnable,

            // Metadata
            metadata: orderData.metadata
        };

        res.status(200).json({
            success: true,
            message: 'Order retrieved successfully',
            order: formattedOrder
        });

    } catch (error) {
        console.error('❌ Error fetching order:', error);

        let statusCode = 500;
        let message = 'Failed to fetch order. Please try again.';

        if (error.message.includes('not found')) {
            statusCode = 404;
            message = 'Order not found';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});


// GET SINGLE ORDER BY ID API

app.post('/add-to-wishlist', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                error: 'Product ID is required'
            });
        }

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        const wishlist = userData.wishlist || [];
        const cart = userData.cart || [];

        // Check if product exists
        const productDoc = await db.collection('products').doc(productId).get();
        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        // Check if product is already in wishlist
        const existingIndex = wishlist.findIndex(item => item.productId === productId);

        if (existingIndex >= 0) {
            return res.status(409).json({
                success: false,
                error: 'Product already in wishlist'
            });
        }

        // Add product to wishlist
        wishlist.push({
            productId,
            addedAt: new Date().toISOString()
        });

        // Update wishlist
        await userRef.update({
            wishlist,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Product added to wishlist',
            wishlist: wishlist
        });

    } catch (error) {
        console.error('❌ Add to wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add to wishlist'
        });
    }
});

// Get user's wishlist (with product details)
app.get('/get-wishlist', authenticateToken, async (req, res) => {
    try {
        const user = req.user;

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        const wishlist = userData.wishlist || [];

        // Get product details for each item in wishlist
        const wishlistWithDetails = [];

        for (const item of wishlist) {
            try {
                const productDoc = await db.collection('products').doc(item.productId).get();
                if (productDoc.exists) {
                    wishlistWithDetails.push({
                        productId: item.productId,
                        addedAt: item.addedAt,
                        product: productDoc.data()
                    });
                }
            } catch (error) {
                console.error(`Error fetching product ${item.productId}:`, error);
                // Skip this product if there's an error fetching it
                continue;
            }
        }

        res.status(200).json({
            success: true,
            wishlist: wishlistWithDetails,
            totalItems: wishlistWithDetails.length
        });

    } catch (error) {
        console.error('❌ Get wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch wishlist'
        });
    }
});

app.delete('/remove-from-wishlist', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                error: 'Product ID is required'
            });
        }

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        let wishlist = userData.wishlist || [];

        // Remove product from wishlist
        const initialLength = wishlist.length;
        wishlist = wishlist.filter(item => item.productId !== productId);

        if (wishlist.length === initialLength) {
            return res.status(404).json({
                error: 'Product not found in wishlist'
            });
        }

        await userRef.update({
            wishlist,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Product removed from wishlist',
            wishlist: wishlist
        });

    } catch (error) {
        console.error('❌ Remove from wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove from wishlist'
        });
    }
});

// Get products by category
app.get('/getProductsByCategory/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;

        if (!categoryId) {
            return res.status(400).json({
                success: false,
                message: 'Category ID is required'
            });
        }

        // Get the category details first to get category name
        const categoryDoc = await db.collection('categories').doc(categoryId).get();
        let categoryName = '';

        if (categoryDoc.exists) {
            categoryName = categoryDoc.data().name;
        }

        // Query products by categoryId or categoryName
        let query = db.collection('products')
            .where('active', '==', true)
            .where('delete', '==', false);

        // Try to match by categoryId first, then by categoryName
        let snapshot = await query.where('categoryId', '==', categoryId).get();

        if (snapshot.empty && categoryName) {
            // If no products found by ID, try by name
            snapshot = await query.where('categoryName', '==', categoryName).get();
        }

        if (snapshot.empty) {
            return res.status(200).json({
                success: true,
                products: [],
                categoryId,
                categoryName,
                total: 0,
                message: 'No products found for this category'
            });
        }

        const products = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const data = doc.data();

                // Process images with improved error handling
                let processedImages = [];
                let primaryImageUrl = '';

                if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                    processedImages = await processProductImages(data.images);

                    // Set primary image
                    if (processedImages.length > 0) {
                        primaryImageUrl = processedImages[0].url || processedImages[0].publicUrl || '';
                    }
                } else if (data.primaryImage) {
                    // Use existing primary image if no images array
                    primaryImageUrl = data.primaryImage;
                    processedImages = [{
                        id: 0,
                        url: data.primaryImage,
                        publicUrl: data.primaryImage,
                        signedUrl: data.primaryImage,
                        fileName: 'primary_image',
                        originalName: 'primary_image',
                        isValid: true
                    }];
                }

                // Calculate availability status
                const quantity = data.quantity || data.stock || 0;
                let availability = 'In stock';
                if (quantity === 0) {
                    availability = 'Out of stock';
                } else if (quantity < 5) {
                    availability = 'Low stock';
                }

                return {
                    id: doc.id,
                    productId: doc.id,
                    name: data.name || 'Unknown Product',
                    description: data.description || '',
                    features: data.features || '',
                    price: data.price || 0,
                    quantity: quantity,
                    stock: data.stock || quantity,
                    categoryName: data.categoryName || categoryName || 'Uncategorized',
                    categoryId: data.categoryId || categoryId || '',
                    offerPercentage: data.offerPercentage || 0,
                    shelfLife: data.shelfLife || '',
                    certification: data.certification || '',
                    storageInstruction: data.storageInstruction || '',
                    mrp: data.mrp || null,
                    sellingPrice: data.sellingPrice || data.price || 0,
                    sku: data.sku || '',
                    barcode: data.barcode || '',
                    weight: data.weight || '',
                    variants: data.variants || [],
                    dietType: data.dietType || 'Veg',
                    ingredients: data.ingredients || '',
                    nutritionFacts: data.nutritionFacts || '',
                    // Image data
                    primaryImage: primaryImageUrl,
                    imageUrl: primaryImageUrl, // For frontend compatibility
                    images: processedImages,
                    imageCount: processedImages.length,
                    // Status
                    active: data.active !== undefined ? data.active : true,
                    availability: availability,
                    // Timestamps
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
                };
            })
        );

        res.status(200).json({
            success: true,
            products: products,
            categoryId,
            categoryName,
            total: products.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting products by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get products by category',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const generateOrderId = async () => {
    try {
        // Get the latest order to find the highest order number
        const latestOrderQuery = await db.collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        let nextOrderNumber = 1; // Default to 1 if no orders exist

        if (!latestOrderQuery.empty) {
            const latestOrder = latestOrderQuery.docs[0].data();
            const latestOrderId = latestOrder.orderId;

            // Extract number from orderId (e.g., "OD001" -> 1)
            if (latestOrderId && latestOrderId.startsWith('OD')) {
                const numberPart = latestOrderId.substring(2); // Remove "OD" prefix
                const lastNumber = parseInt(numberPart, 10);
                if (!isNaN(lastNumber)) {
                    nextOrderNumber = lastNumber + 1;
                }
            }
        }

        // Format the order ID with leading zeros (e.g., OD001, OD010, OD100)
        const formattedNumber = nextOrderNumber.toString().padStart(3, '0');
        return `OD${formattedNumber}`;

    } catch (error) {
        console.error('Error generating order ID:', error);

        // Fallback to timestamp-based ID if database query fails
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `OD${timestamp.slice(-3)}${random}`;
    }
};

// Helper function to calculate order totals using standardized utility
const calculateOrderTotals = (items, deliveryCharge, discountAmount, codCharge, paymentMethod, applicableProductIds = null) => {
    return calculateCartTotals(items, discountAmount, deliveryCharge, codCharge, paymentMethod, applicableProductIds);
};

// ========== GENERATE INVOICE DATA HELPER ==========
function generateInvoiceData(orderDetails) {
    const {
        orderId,
        userData,
        deliveryAddress,
        items,
        pricing,
        payment,
        couponCode,
        createdAt
    } = orderDetails;

    const invoiceDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const oDate = (createdAt instanceof Date) ? createdAt : 
                 (createdAt && createdAt.toDate) ? createdAt.toDate() : new Date();
    
    const orderDate = oDate.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Company Information for KARIKKU
    const company = {
        name: 'KARIKKU VENTURES PRIVATE LIMITED',
        address: '01/152-25, ROYAL TRADE CENTER, BYE PASS ROAD, PERINTHALMANNA, MALAPPURAM, KERALA',
        city: 'Malappuram',
        state: 'Kerala',
        pincode: '679322',
        gst: '32AALCK2699D1ZF',
        fssai: '11325999000021',
        phone: '+91-XXXXXXXXXX',
        email: 'care@karikku.co',
        website: 'www.karikku.co'
    };

    // Customer Information
    const customer = {
        name: deliveryAddress.fullName,
        email: deliveryAddress.email || userData?.email || 'N/A',
        phone: deliveryAddress.phone,
        address: {
            line1: deliveryAddress.addressLine1,
            line2: deliveryAddress.addressLine2 || '',
            city: deliveryAddress.city,
            state: deliveryAddress.state,
            pincode: deliveryAddress.pincode
        }
    };

    const toNumber = (value, defaultValue = 0) => {
        const num = parseFloat(value);
        return isNaN(num) ? defaultValue : num;
    };

    // Format items for invoice
    const itemsForInvoice = items.map((item, index) => {
        const itemPricing = (pricing.itemsPricing || []).find(p => String(p.productId) === String(item.productId));
        
        const quantity = toNumber(item.quantity, 1);
        const mrpUnit = toNumber(item.price || item.unitPrice, 0);
        
        // Use standardized calculations from itemPricing if available, otherwise fallback
        const basePriceUnit = itemPricing ? (itemPricing.basePrice / quantity) : (mrpUnit / (1 + (toNumber(item.gstRate || 5) / 100)));
        const discountTotal = itemPricing ? itemPricing.discount : 0;
        const taxableValue = itemPricing ? itemPricing.taxableValue : (basePriceUnit * quantity - discountTotal);
        const gstAmount = itemPricing ? itemPricing.gstAmount : (taxableValue * (toNumber(item.gstRate || 5) / 100));

        return {
            sNo: index + 1,
            description: item.productName || item.name || 'Product',
            sku: item.productId || 'N/A',
            quantity: quantity,
            unit: item.unit || 'Pcs',
            unitPrice: basePriceUnit.toFixed(2),
            discount: discountTotal.toFixed(2),
            taxableValue: taxableValue.toFixed(2),
            gstRate: `${item.gstRate || 5}%`,
            gst: gstAmount.toFixed(2),
            totalAmount: (taxableValue + gstAmount).toFixed(2)
        };
    });

    return {
        invoiceNumber: orderId,
        invoiceDate,
        orderDate,
        company,
        customer,
        itemsForInvoice,
        pricing: {
            subtotal: toNumber(pricing.basePrice).toFixed(2),
            discount: toNumber(pricing.discount).toFixed(2),
            deliveryCharge: toNumber(pricing.delivery).toFixed(2),
            codCharge: toNumber(pricing.codCharge).toFixed(2),
            gst: toNumber(pricing.gst).toFixed(2),
            total: toNumber(pricing.total).toFixed(2)
        },
        payment: {
            method: String(payment.paymentMethod || 'N/A').toUpperCase(),
            status: String(payment.status || 'pending').toUpperCase(),
            amount: toNumber(payment.amount).toFixed(2),
            currency: 'INR',
            transactionId: payment.transactionId || 'N/A',
            paymentGateway: payment.paymentGateway || 'N/A'
        },
        coupon: couponCode || 'N/A',
        notes: 'Thank you for shopping with Karikku!'
    };
}

// Helper function to validate order items
const validateOrderItems = async (items) => {
    const validatedItems = [];

    for (const item of items) {
        try {
            // Fetch product from database
            const productDoc = await db.collection('products').doc(item.productId).get();

            if (!productDoc.exists) {
                throw new Error(`Product ${item.productId} not found`);
            }

            const productData = productDoc.data();

            // Check if product is active and not deleted
            if (!productData.active || productData.delete) {
                throw new Error(`Product ${productData.name} is not available`);
            }

            // Check stock availability
            const availableStock = productData.quantity || productData.stock || 0;
            if (availableStock < item.quantity) {
                throw new Error(`Insufficient stock for ${productData.name}. Available: ${availableStock}, Requested: ${item.quantity}`);
            }

            validatedItems.push({
                productId: item.productId,
                name: productData.name,
                price: item.price !== undefined && item.price !== null && item.price !== 0 ? item.price : (productData.sellingPrice || productData.price),
                mrp: item.originalPrice !== undefined && item.originalPrice !== null ? item.originalPrice : (item.mrp || productData.mrp || productData.price),
                quantity: item.quantity,
                sku: productData.sku || '',
                image: productData.primaryImage || (productData.images && productData.images[0]?.publicUrl) || '',
                categoryId: productData.categoryId || '',
                categoryName: productData.categoryName || '',
                weight: productData.weight || '',
                gstRate: item.gstRate !== undefined && item.gstRate !== null ? item.gstRate : (productData.gst || 0),
                variant: item.variant || null
            });
        } catch (error) {
            throw new Error(`Error validating item ${item.productId}: ${error.message}`);
        }
    }

    return validatedItems;
};

// Helper function to update product stock
const updateProductStock = async (items) => {
    const batch = db.batch();

    for (const item of items) {
        const productRef = db.collection('products').doc(item.productId);
        const productDoc = await productRef.get();

        if (productDoc.exists) {
            const productData = productDoc.data();
            const currentStock = productData.quantity || productData.stock || 0;
            const newStock = Math.max(0, currentStock - item.quantity);

            batch.update(productRef, {
                quantity: newStock,
                stock: newStock,
                updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    await batch.commit();
};


// GET order by ID endpoint
app.get('/get-order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Find order by orderId field (not document ID)
        const orderQuery = await db.collection('orders')
            .where('orderId', '==', orderId)
            .where('delete', '==', false)
            .get();

        if (orderQuery.empty) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const orderDoc = orderQuery.docs[0];
        const orderData = orderDoc.data();

        // Convert Firestore timestamps to ISO strings
        const processedOrder = {
            id: orderDoc.id,
            ...orderData,
            createdAt: orderData.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: orderData.updatedAt?.toDate?.()?.toISOString() || null,
            trackingStages: orderData.trackingStages?.map(stage => ({
                ...stage,
                timestamp: stage.timestamp?.toDate?.()?.toISOString() || null
            })) || []
        };

        res.status(200).json({
            success: true,
            order: processedOrder
        });

    } catch (error) {
        console.error('❌ Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// GET user orders endpoint
app.get('/get-user-orders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10, status } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Build query
        let query = db.collection('orders')
            .where('userId', '==', userId)
            .where('delete', '==', false);

        // Add status filter if provided
        if (status) {
            query = query.where('status', '==', status);
        }

        const ordersSnapshot = await query
            .orderBy('createdAt', 'desc')
            .get();

        if (ordersSnapshot.empty) {
            return res.status(200).json({
                success: true,
                orders: [],
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: 0,
                    totalItems: 0,
                    itemsPerPage: parseInt(limit)
                }
            });
        }

        // Process orders
        const orders = ordersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
                trackingStages: data.trackingStages?.map(stage => ({
                    ...stage,
                    timestamp: stage.timestamp?.toDate?.()?.toISOString() || null
                })) || []
            };
        });

        // Apply pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedOrders = orders.slice(startIndex, endIndex);

        res.status(200).json({
            success: true,
            orders: paginatedOrders,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(orders.length / parseInt(limit)),
                totalItems: orders.length,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching user orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ADD ADDRESS
app.post('/add-address', authenticateToken, async (req, res) => {
    try {
        console.log('📦 Add address request received:', req.body);

        const user = req.user;
        const {
            fullName,
            addressLine1,
            addressLine2,
            phone,
            city,
            state,
            country,
            zipCode,
            addressType
        } = req.body;

        // Validate required fields with better error messages
        if (!fullName) {
            return res.status(400).json({
                success: false,
                error: 'Full name is required'
            });
        }
        if (!addressLine1) {
            return res.status(400).json({
                success: false,
                error: 'Address line 1 is required'
            });
        }
        if (!state) {
            return res.status(400).json({
                success: false,
                error: 'State is required'
            });
        }
        if (!addressType) {
            return res.status(400).json({
                success: false,
                error: 'Address type is required'
            });
        }

        // Validate address type
        const validAddressTypes = ['Home', 'Office'];
        if (!validAddressTypes.includes(addressType)) {
            return res.status(400).json({
                success: false,
                error: 'Address type must be either "Home" or "Office"'
            });
        }

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.log('❌ User not found:', user.customDocId);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        const addresses = userData.addresses || [];

        // Create new address object
        const newAddress = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            fullName: fullName.trim(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2 ? addressLine2.trim() : '',
            city: city ? city.trim() : '',
            phone: phone ? phone.trim() : '',
            state: state.trim(),
            country: country ? country.trim() : 'India',
            zipCode: zipCode ? zipCode.trim() : '',
            addressType: addressType,
            isDefault: addresses.length === 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        console.log('➕ Adding new address:', newAddress);

        // Update user document
        await userRef.update({
            addresses: [...addresses, newAddress],
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ Address added successfully for user:', user.customDocId);

        res.status(200).json({
            success: true,
            message: 'Address added successfully',
            address: newAddress,
            totalAddresses: addresses.length + 1
        });

    } catch (error) {
        console.error('❌ Add address error:', error);
        console.error('Error stack:', error.stack);

        res.status(500).json({
            success: false,
            error: 'Failed to add address',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET ADDRESS
app.get('/get-address', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        const addresses = userData.addresses || [];

        res.status(200).json({
            success: true,
            addresses: addresses,
            totalAddresses: addresses.length
        });

    } catch (error) {
        console.error('❌ Get addresses error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch addresses'
        });
    }
});

// UPDATE ADDRESS
app.put('/update-address/:addressId', authenticateToken, async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = req.user;
        const updateData = req.body;

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        const addresses = userData.addresses || [];
        const index = addresses.findIndex(addr => addr.id === addressId);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Address not found'
            });
        }

        // Update the address fields
        addresses[index] = {
            ...addresses[index],
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        await userRef.update({
            addresses: addresses,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            address: addresses[index]
        });

    } catch (error) {
        console.error('❌ Update address error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update address'
        });
    }
});

// DELETE ADDRESS
app.delete('/delete-address/:addressId', authenticateToken, async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = req.user;

        const userRef = db.collection('users').doc(user.customDocId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userData = userDoc.data();
        let addresses = userData.addresses || [];
        const initialCount = addresses.length;
        
        addresses = addresses.filter(addr => addr.id !== addressId);

        if (addresses.length === initialCount) {
            return res.status(404).json({
                success: false,
                error: 'Address not found'
            });
        }

        await userRef.update({
            addresses: addresses,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Address deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete address error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete address'
        });
    }
});

// Get exclusive product
app.get('/get-exclusive-Products', async (req, res) => {
    try {
        const snapshot = await db.collection('products')
            .where('active', '==', true)
            .where('delete', '==', false)
            .where('exclusive', '==', true)
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({
                success: true,
                products: [],
                total: 0,
                message: 'No products found'
            });
        }

        const products = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const data = doc.data();

                // Process main product images
                let processedImages = [];
                let primaryImageUrl = '';

                if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                    processedImages = await processProductImages(data.images);

                    // Set primary image
                    if (processedImages.length > 0) {
                        primaryImageUrl = processedImages[0].url || processedImages[0].publicUrl || '';
                    }
                } else if (data.primaryImage) {
                    // Use existing primary image if no images array
                    primaryImageUrl = data.primaryImage;
                    processedImages = [{
                        id: 0,
                        url: data.primaryImage,
                        publicUrl: data.primaryImage,
                        signedUrl: data.primaryImage,
                        fileName: 'primary_image',
                        originalName: 'primary_image',
                        isValid: true
                    }];
                }

                // Process variant combinations with their images
                let processedVariantCombinations = [];
                if (data.hasVariants && data.variantCombinations && Array.isArray(data.variantCombinations)) {
                    processedVariantCombinations = data.variantCombinations.map((combo, index) => {
                        // Process variant-specific images
                        let variantImages = [];
                        if (combo.images && Array.isArray(combo.images) && combo.images.length > 0) {
                            variantImages = combo.images.map((img, imgIndex) => ({
                                id: imgIndex,
                                url: img.url || img.publicUrl || img,
                                publicUrl: img.publicUrl || img.url || img,
                                fileName: img.fileName || `variant_image_${imgIndex}`,
                                originalName: img.originalName || img.fileName || `variant_image_${imgIndex}`
                            }));
                        }

                        // Calculate availability for this variant
                        const variantQuantity = combo.quantity || 0;
                        let variantAvailability = 'In stock';
                        if (variantQuantity === 0) {
                            variantAvailability = 'Out of stock';
                        } else if (variantQuantity < 5) {
                            variantAvailability = 'Low stock';
                        }

                        return {
                            ...combo,
                            variantId: combo.variantId || `${doc.id}_V${(index + 1).toString().padStart(2, '0')}`,
                            price: combo.price || 0,
                            quantity: variantQuantity,
                            sku: combo.sku || `${data.sku || doc.id}-V${index + 1}`,
                            images: variantImages,
                            primaryImage: combo.primaryImage || (variantImages.length > 0 ? variantImages[0].url : primaryImageUrl),
                            imageCount: variantImages.length,
                            availability: variantAvailability,
                            active: combo.active !== undefined ? combo.active : true
                        };
                    });
                }

                // Calculate overall availability
                let quantity = 0;
                let availability = 'In stock';

                if (data.hasVariants && processedVariantCombinations.length > 0) {
                    // For products with variants, sum up all variant quantities
                    quantity = processedVariantCombinations.reduce((sum, combo) => sum + (combo.quantity || 0), 0);

                    if (quantity === 0) {
                        availability = 'Out of stock';
                    } else if (quantity < 5) {
                        availability = 'Low stock';
                    }
                } else {
                    // For products without variants
                    quantity = data.quantity || data.stock || 0;
                    if (quantity === 0) {
                        availability = 'Out of stock';
                    } else if (quantity < 5) {
                        availability = 'Low stock';
                    }
                }

                return {
                    id: doc.id,
                    productId: data.productId || doc.id,
                    customId: data.customId || data.productId || doc.id,
                    name: data.name || 'Unknown Product',
                    description: data.description || '',
                    features: data.features || '',

                    // Variant handling
                    hasVariants: data.hasVariants || false,
                    variants: data.variants || [],
                    variantCombinations: processedVariantCombinations,

                    // Pricing
                    price: data.price || 0,
                    offerPercentage: data.offerPercentage || 0,
                    mrp: data.mrp || null,
                    sellingPrice: data.sellingPrice || data.price || 0,
                    taxPercentage: data.taxPercentage || 0,

                    // Inventory
                    quantity: quantity,
                    stock: data.stock || quantity,
                    sku: data.sku || doc.id,
                    barcode: data.barcode || '',

                    // Category
                    categoryName: data.categoryName || 'Uncategorized',
                    categoryId: data.categoryId || '',

                    // Product details
                    shelfLife: data.shelfLife || '',
                    certification: data.certification || '',
                    storageInstruction: data.storageInstruction || '',
                    weight: data.weight || '',
                    fssai: data.fssai || '',
                    dietType: data.dietType || 'Veg',
                    ingredients: data.ingredients || '',
                    nutritionFacts: data.nutritionFacts || '',

                    // SEO fields
                    pageTitle: data.pageTitle || data.name || '',
                    metaDescription: data.metaDescription || data.description || '',
                    url: data.url || '',
                    videoLink: data.videoLink || '',

                    // Images
                    primaryImage: primaryImageUrl,
                    imageUrl: primaryImageUrl, // For frontend compatibility
                    images: processedImages,
                    imageCount: processedImages.length,

                    // Status
                    active: data.active !== undefined ? data.active : true,
                    availability: availability,
                    exclusive: data.exclusive || false,

                    // Metadata
                    addedBy: data.addedBy || '',
                    addedByEmail: data.addedByEmail || '',

                    // Timestamps
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
                };
            })
        );

        res.status(200).json({
            success: true,
            products: products,
            total: products.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get products',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Update order payment status
app.put("/update-order-payment", authenticateToken, async (req, res) => {
    try {
        const { orderId, paymentId, paymentStatus, failureReason } = req.body;

        const updateData = {
            paymentStatus,
            updatedAt: new Date()
        };

        if (paymentId) updateData.razorpayPaymentId = paymentId;
        if (failureReason) updateData.paymentFailureReason = failureReason;
        if (paymentStatus === 'completed') updateData.paidAt = new Date();

        const ordersQuery = await db.collection('orders').where('orderId', '==', orderId).get();
        
        if (ordersQuery.empty) {
            return res.status(404).json({ error: "Order not found" });
        }

        const orderDoc = ordersQuery.docs[0];
        await orderDoc.ref.update(updateData);

        res.json({
            success: true,
            message: "Order payment status updated successfully",
            order: { id: orderDoc.id, ...orderDoc.data(), ...updateData }
        });
    } catch (error) {
        console.error("Error updating order payment:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get payment status
app.get("/payment-status/:orderId", authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;

        // Fetch payment details from Razorpay
        const payment = await razorpay.orders.fetch(orderId);

        res.json({
            success: true,
            payment: {
                id: payment.id,
                status: payment.status,
                amount: payment.amount,
                currency: payment.currency,
                created_at: payment.created_at
            }
        });
    } catch (error) {
        console.error("Error fetching payment status:", error);
        res.status(500).json({ error: error.message });
    }
});

// Refund payment (if needed)
app.post("/refund-payment", authenticateToken, async (req, res) => {
    try {
        const { paymentId, amount, reason } = req.body;

        const refund = await razorpay.payments.refund(paymentId, {
            amount: amount * 100, // Convert to paisa
            speed: 'normal',
            notes: {
                reason: reason || 'Customer requested refund'
            }
        });

        // Update order status in your database
        await Order.findOneAndUpdate(
            { razorpayPaymentId: paymentId },
            {
                paymentStatus: 'refunded',
                refundId: refund.id,
                refundAmount: amount,
                refundedAt: new Date()
            }
        );

        res.json({
            success: true,
            refund: {
                id: refund.id,
                amount: refund.amount,
                status: refund.status
            }
        });

    } catch (error) {
        console.error("Error processing refund:", error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook to handle payment events (optional but recommended)
app.post("/razorpay-webhook", (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];

        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const event = req.body.event;
        const paymentEntity = req.body.payload.payment.entity;

        switch (event) {
            case 'payment.captured':
                // Payment successful
                console.log('Payment captured:', paymentEntity.id);
                // Update order status in database
                break;

            case 'payment.failed':
                // Payment failed
                console.log('Payment failed:', paymentEntity.id);
                // Update order status in database
                break;

            case 'payment.authorized':
                // Payment authorized but not captured
                console.log('Payment authorized:', paymentEntity.id);
                break;

            default:
                console.log('Unhandled event:', event);
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// //////////////////////////DELIVERY ZONES//////////////////////////////
app.get('/get-shipping-rates', async (req, res) => {
    try {
        const snapshot = await db.collection('shippingRates')
            .where('isActive', '==', true)
            .orderBy('updatedAt', 'desc')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({
                success: true,
                shippingRates: [],
                total: 0,
                message: 'No shipping rates found'
            });
        }

        const shippingRates = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                rateId: data.rateId || doc.id,
                rateName: data.rateName || '',
                description: data.description || '',
                price: data.price || 0,
                minPrice: data.minPrice || 0,
                maxPrice: data.maxPrice || null,
                minWeight: data.minWeight || null,
                maxWeight: data.maxWeight || null,
                zoneId: data.zoneId || '',
                isFree: data.isFree || false,
                isActive: data.isActive !== undefined ? data.isActive : true,
                createdByEmail: data.createdByEmail || '',
                createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
            };
        });

        res.status(200).json({
            success: true,
            shippingRates: shippingRates,
            total: shippingRates.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting shipping rates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shipping rates',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ///////////////////////////////////////////////    BLOGS    ///////////////////////////////////////////////
app.get('/get-blog-posts', async (req, res) => {
    try {
        const snapshot = await db.collection('blogPosts')
            .where('delete', '==', false)
            .where('active', '==', true)

            .orderBy('createdAt', 'desc')
            .get();
        const blogPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, blogPosts });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch blog posts', error: error.message });
    }
});

app.get('/get-blog-post/:id', authenticateToken, async (req, res) => {
    try {
        const doc = await db.collection('blogPosts').doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, message: 'Blog not found' });
        }
        res.status(200).json({ success: true, blog: { id: doc.id, ...doc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch blog', error: error.message });
    }
});


app.get('/home-banners', async (req, res) => {
    try {
        const snapshot = await db.collection('banners')
            .where('delete', '!=', true)
            .get();
        
        const banners = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(banner => banner.active !== false); // Filter for active banners

        // Optional: Sort by order if available
        banners.sort((a, b) => (a.order || 0) - (b.order || 0));

        res.status(200).json({ success: true, banners });
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch banners', error: error.message });
    }
});




// ============================================
// FIRESTORE LISTENER FOR IN-TRANSIT EMAILS
// ============================================
db.collection('orders').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'modified') {
            const newData = change.doc.data();
            
            // Check if status is in transit (assuming orderStage 'shipped' or 'in_transit' or status 2/3)
            const isNowInTransit = newData.orderStage === 'shipped' || newData.orderStage === 'in_transit' || newData.status === 2;
            
            // Flag to prevent duplicate emails
            if (isNowInTransit && !newData.inTransitEmailSent) {
                const userEmail = newData.deliveryAddress?.email || newData.userDetails?.email;
                if (userEmail) {
                    try {
                        await sendOrderInTransitEmail(userEmail, {
                            orderId: newData.orderId
                        });
                        // Mark as sent
                        await db.collection('orders').doc(newData.orderId).update({
                            inTransitEmailSent: true
                        });
                    } catch (error) {
                        console.error('Error sending in transit email:', error);
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3006;


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});