# Security Specification - Music/Video Library App

## Data Invariants
1. A **Song** must always have a `title`, `audioUrl`, and `uploadedBy`.
2. `uploadedBy` must strictly match the `uid` of the authenticated user creating the document.
3. Users can only `read`, `update`, or `delete` their own songs (where `uploadedBy == auth.uid`).
4. `createdAt` must be set to `request.time` on creation and be immutable.
5. Search/List operations must be restricted to the user's own items.

## The "Dirty Dozen" (Test Payloads for Rejection)
1. **Identity Spoofing**: Create a song with `uploadedBy` set to a different user's UID.
2. **Metadata Tampering**: Update a song to change the `uploadedBy` field.
3. **Malicious ID Injection**: Create a song with a 2MB string as a field value.
4. **Invalid Type**: Set `type` to 'podcast' (not in enum ['audio', 'video']).
5. **PII Leak**: Attempting to read a song collection without a `where` clause for the user's UID (if list rule enforced).
6. **Future Dating**: Set `createdAt` to a future timestamp.
7. **Phantom Doc**: Create a song with empty required fields.
8. **Shadow Field**: Adding an `isAdmin` field to a song document.
9. **Cross-User Delete**: Delete a song document that belongs to another UID.
10. **State Corruption**: Changing `source` after creation.
11. **Excessive List**: Attempting to list all songs in the database.
12. **MIME Poisoning**: Setting `mimeType` to a 100KB string of junk characters.

## Security Controls
- **isValidSong(data)**: Standalone helper for schema validation.
- **Affected Keys**: Using `affectedKeys().hasOnly()` for updates to ensure only `title`, `artist`, `coverUrl`, and `mimeType` can change.
- **Size Guards**: All strings limited to 256-1024 characters depending on use.
