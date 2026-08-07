

app.post('/CustomerRefundRequest', authenticateToken, upload.array('attachments', 5), async (req, res) => {
    try {
        const user = req.user;
        const userId = user.userId;
        
        // Extract data from request body
        const {
            fullName,
            phone,
            email,
            issueType,
            message
        } = req.body;

        // Get uploaded files
        const uploadedFiles = req.files || [];

        // Input validation
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Validate required fields
        const requiredFields = {
            fullName: fullName,
            phone: phone,
            email: email,
            issueType: issueType,
            message: message
        };

        const missingFields = Object.entries(requiredFields)
            .filter(([key, value]) => !value || value.toString().trim() === '')
            .map(([key]) => key);

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate phone number (basic validation - adjust regex as needed)
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format'
            });
        }

        // Validate issue type (customize these options as needed)
        const validIssueTypes = [
            'Product Defect',
            'Wrong Item Received',
            'Damaged Item',
            'Not as Described',
            'Billing Issue',
            'Delivery Problem',
            'Quality Issue',
            'Other'
        ];

        if (!validIssueTypes.includes(issueType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid issue type. Valid options: ${validIssueTypes.join(', ')}`
            });
        }

        // Handle file uploads to Firebase Storage
        const attachmentUrls = [];
        
        if (uploadedFiles.length > 0) {
            const bucket = admin.storage().bucket();
            
            // Upload each file
            for (const file of uploadedFiles) {
                try {
                    const fileName = `refund-attachments/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}_${file.originalname}`;
                    const fileUpload = bucket.file(fileName);

                    // Create write stream
                    const stream = fileUpload.createWriteStream({
                        metadata: {
                            contentType: file.mimetype,
                            metadata: {
                                uploadedBy: userId,
                                originalName: file.originalname,
                                uploadDate: new Date().toISOString()
                            }
                        },
                        resumable: false
                    });

                    // Upload file
                    await new Promise((resolve, reject) => {
                        stream.on('error', (error) => {
                            console.error('Upload error for file:', file.originalname, error);
                            reject(error);
                        });

                        stream.on('finish', async () => {
                            try {
                                // Get signed URL for secure access (valid for 7 days)
                                const [signedUrl] = await fileUpload.getSignedUrl({
                                    action: 'read',
                                    expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
                                });
                                
                                attachmentUrls.push({
                                    fileName: fileName, // Store the file path for future access
                                    url: signedUrl, // Temporary signed URL
                                    originalName: file.originalname,
                                    mimeType: file.mimetype,
                                    size: file.size,
                                    uploadedAt: new Date().toISOString()
                                });
                                
                                resolve();
                            } catch (error) {
                                console.error('Error generating signed URL:', error);
                                reject(error);
                            }
                        });

                        stream.end(file.buffer);
                    });

                } catch (uploadError) {
                    console.error('Failed to upload file:', file.originalname, uploadError);
                    // Continue with other files, but log the error
                }
            }
        }

        // Prepare the refund request data
        const refundRequestData = {
            userId: userId,
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim().toLowerCase(),
            issueType: issueType,
            message: message.trim(),
            attachments: attachmentUrls, // Array of attachment objects with metadata
            status: 'pending', // Initial status
            priority: 'normal', // Default priority
            ticketNumber: `REF-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`, // Generate unique ticket number
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Create a new customer refund request document
        const refundRequestRef = db.collection('CustomerRefundRequest').doc();
        await refundRequestRef.set(refundRequestData);

        // Prepare response data (exclude sensitive info if needed)
        const responseData = {
            id: refundRequestRef.id,
            ticketNumber: refundRequestData.ticketNumber,
            fullName: refundRequestData.fullName,
            email: refundRequestData.email,
            issueType: refundRequestData.issueType,
            status: refundRequestData.status,
            priority: refundRequestData.priority,
            attachmentsCount: attachmentUrls.length,
            createdAt: refundRequestData.createdAt
        };

        // Optional: Send confirmation email or notification
        // await sendConfirmationEmail(refundRequestData);
        // await notifyAdminTeam(refundRequestData);

        res.status(201).json({
            success: true,
            message: 'Refund request submitted successfully',
            data: responseData
        });

    } catch (error) {
        console.error('❌ Error creating refund request:', error);
        
        // Handle specific multer errors
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File size too large. Maximum 5MB per file.'
                });
            } else if (error.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({
                    success: false,
                    message: 'Too many files. Maximum 5 files allowed.'
                });
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create refund request. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});