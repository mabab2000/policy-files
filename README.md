# Policy Files - Firebase Storage Upload Endpoint

This project exposes a simple HTTP endpoint to upload files to Firebase Storage (a bucket for policy files).

Quick start

1. Install dependencies:

```powershell
npm install
```

2. Provide Firebase service account credentials either by placing the JSON file and setting `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env`, or by setting `FIREBASE_SERVICE_ACCOUNT` to the base64-encoded JSON string.

Example `.env` (copy from `.env.example`):

```
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=policy-file
PORT=3000
```

3. Run the server:

```powershell
npm start
```

4. Upload a file (multipart form, field name `file`):

```bash
curl -F "file=@./somefile.pdf" http://localhost:3000/upload
```

Response contains the stored name and a signed URL valid for 1 hour.
"# F-policy-files" 
