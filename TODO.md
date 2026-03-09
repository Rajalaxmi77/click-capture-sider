# Sync Now Implementation Plan

## Task: When user views a demand note detail and clicks "Sync Now", download documents from Filevine and upload to the backend API.

### Completed Steps:

1. [x] **Add file upload endpoint in backend (server.js)**
   - Created POST `/api/upload` endpoint
   - Accepts file, demandNoteId, and fileCategory
   - Saves file and creates DemandFile record in database
   - Added GET `/api/demand-notes/:id/files` endpoint

2. [x] **Update popup.html - Add Sync Now button in detail view**
   - Added a "Sync Now" button in the detail view header
   - Added detail sync status element for status messages

3. [x] **Update popup.js - Implement sync logic**
   - Added `currentDemandNoteId` state to track current demand note
   - Added `syncFilesForDemandNote()` function that:
     - Checks if user is on Filevine page
     - Triggers file download from content script
     - Shows success/error messages
     - Refreshes the detail view after download
   - Added authToken to the message sent to content script

4. [x] **Update content.js - Add SYNC_MEDICAL_RECORDS handler**
   - Added handler for `SYNC_MEDICAL_RECORDS` message type
   - Gets all documents from Filevine project
   - Filters for "Medical Provider Records" folder
   - Downloads each document and uploads to backend
   - Added `getFileContentForUpload()` helper function
   - Added `uploadFileToBackend()` helper function

### How to use:
1. Select a client from the demand notes list
2. View the demand note detail page
3. Click "Sync Now" button
4. Make sure you're on the Filevine page with documents
5. Documents will be downloaded from Filevine and uploaded to backend

### API Flow When Clicking "Sync Now":
1. **popup.js**: User clicks "Sync Now" → calls `syncFilesForDemandNote()`
2. **popup.js**: Sends message to content script with `SYNC_MEDICAL_RECORDS` type and authToken
3. **content.js**: Receives message → handler processes:
   - Gets project ID from current URL
   - Fetches all documents from Filevine via `/api/docs/project/{projectId}`
   - Filters for "Medical Provider Records" (folder name contains "medical", "provider", or "record")
   - For each document: downloads from Filevine → uploads to backend `/api/upload`
4. **popup.js**: Receives result → displays success/error message → refreshes detail view

### Backend API Details (as provided by user):
```javascript
for (const file of uploadFiles) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("demandNoteId", demandNote.id);
  formData.append("fileCategory", selectedCategory);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  // ...
}
```

### Dependencies Added:
- multer (for file uploads in Express)
- uuid (for generating unique filenames)

### How to Debug (Check if APIs are called):
1. Open Chrome DevTools (F12)
2. Go to the "Console" tab
3. Look for these log messages:

