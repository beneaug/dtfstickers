const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const Busboy = require("busboy");
const { withRateLimit } = require("./middleware/rateLimit");
const { captureException } = require("./lib/sentry");

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const handler = (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
  }

  console.log("📤 Upload file endpoint called");
  console.log("Content-Type:", req.headers["content-type"]);

  const busboy = Busboy({ 
    headers: req.headers,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB per file
      files: 10,
      fields: 20,
      fieldSize: 1024 * 1024,
    }
  });

  busboy.on("filesLimit", () => console.error("⚠ File limit reached"));
  busboy.on("fieldsLimit", () => console.error("⚠ Field limit reached"));

  let fileProcessingPromise = null;
  let fileReceived = false;

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    console.log("📁 File event fired:", { fieldname, filename, mimetype });
    fileReceived = true;
    
    // Only process the first file
    if (fileProcessingPromise) {
      file.resume();
      return;
    }

    // Create promise immediately so finish handler can await it
    fileProcessingPromise = new Promise((resolve) => {
      const chunks = [];
      
      file.on("data", (data) => {
        chunks.push(data);
      });

      file.on("limit", () => {
        console.error("⚠ File size limit exceeded");
        resolve({ error: "File exceeds 50MB limit" });
      });
      
      file.on("end", async () => {
        console.log("📦 File stream ended, processing...");
        const buffer = Buffer.concat(chunks);

        // Normalize filename and mimetype (Busboy sometimes passes objects)
        const filenameStr = typeof filename === 'string' ? filename : (filename?.filename || filename?.name || String(filename || ''));
        let mimetypeStr = typeof mimetype === 'string' ? mimetype : (mimetype?.mimetype || mimetype?.type || '');

        console.log("📄 Parsed file info:", { filenameStr, mimetypeStr, bufferSize: buffer.length });

        // Infer MIME type from extension if missing
        if (!mimetypeStr && filenameStr) {
          const ext = filenameStr.toLowerCase().split('.').pop();
          const mimeMap = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'svg': 'image/svg+xml',
            'pdf': 'application/pdf',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'tif': 'image/tiff',
            'tiff': 'image/tiff',
          };
          mimetypeStr = mimeMap[ext] || 'application/octet-stream';
          console.log("📝 Inferred MIME type from extension:", mimetypeStr);
        }

        if (!filenameStr || filenameStr === 'unknown' || !buffer.length) {
          console.error("❌ Invalid file:", { filenameStr, bufferLength: buffer.length });
          return resolve({ error: "Invalid file - no filename or empty file" });
        }
        
        console.log("✅ File validated:", { filenameStr, mimetypeStr, size: buffer.length });

        // Validate MIME type
        const allowedMimeTypes = [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/svg+xml",
          "application/pdf",
          "image/gif",
          "image/bmp",
          "image/tiff",
          "application/octet-stream", // Allow if we couldn't determine type
        ];

        if (!mimetypeStr || !allowedMimeTypes.includes(mimetypeStr.toLowerCase())) {
          console.error("❌ Invalid MIME type:", mimetypeStr);
          return resolve({ error: `Invalid file type: ${mimetypeStr}` });
        }

        // Validate file size (50MB max)
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        if (buffer.length > MAX_FILE_SIZE) {
          console.error("❌ File too large:", buffer.length);
          return resolve({ error: `File size ${buffer.length} exceeds 50MB limit` });
        }

        // Upload to S3
        const key = `dtf-orders/${Date.now()}-${Math.random().toString(36).slice(2)}-${filenameStr}`;
        console.log("☁️ Uploading to S3:", key);

        try {
          await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mimetypeStr,
          }));

          console.log("✅ S3 upload successful:", key);
          resolve({
            success: true,
            url: `s3://${process.env.AWS_S3_BUCKET}/${key}`,
            key: key,
            filename: filenameStr,
            mimetype: mimetypeStr,
            size: buffer.length,
          });
        } catch (err) {
          console.error("❌ Failed to upload file to S3:", err);
          captureException(err, { endpoint: '/api/upload-file', filename: filenameStr });
          resolve({ error: "Failed to upload file to S3: " + err.message });
        }
      });
    });
  });

  // Set a timeout to handle cases where finish never fires
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error("❌ Timeout: Upload took too long");
      res.statusCode = 408;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Upload timeout." }));
    }
  }, 60000); // 60 second timeout

  busboy.on("finish", async () => {
    clearTimeout(timeout);
    console.log("✅ Busboy finish event fired");
    console.log("File received:", fileReceived);
    console.log("Processing promise:", fileProcessingPromise ? "exists" : "null");
    
    res.setHeader("Content-Type", "application/json");

    if (!fileReceived) {
      console.error("❌ No file event fired");
      res.statusCode = 400;
      return res.end(JSON.stringify({ 
        error: "No file provided. Make sure the form field is named 'file'."
      }));
    }

    if (!fileProcessingPromise) {
      console.error("❌ File event fired but no processing promise");
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "File processing failed to start" }));
    }

    // Wait for file processing to complete
    console.log("⏳ Waiting for file processing to complete...");
    const result = await fileProcessingPromise;
    console.log("📋 File processing result:", result.success ? "success" : result.error);

    if (result.error) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: result.error }));
    }

    res.statusCode = 200;
    res.end(JSON.stringify(result));
  });

  busboy.on("error", (err) => {
    clearTimeout(timeout);
    console.error("❌ Busboy error:", err);
    if (!res.headersSent) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "File upload error: " + err.message }));
    }
  });

  // Handle request errors
  req.on("error", (err) => {
    clearTimeout(timeout);
    console.error("❌ Request error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Request error" }));
    }
  });

  req.pipe(busboy);
};

module.exports = withRateLimit(handler, {
  requests: 50,
  window: "1h",
});
