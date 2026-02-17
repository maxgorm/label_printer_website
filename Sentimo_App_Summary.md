**Last Modified:** 2/16/26

# Sentimo - Couple's Label Printer App
## Product Development Plan

---

## Executive Summary

**Product Name:** Sentimo  
**Tagline:** "Print love notes, instantly"  
**Concept:** A mobile app enabling couples to send drawings, photos, and text messages that automatically print on their partner's Bluetooth label printer.

**Hardware:** Paired label printers (XiaoWa X6h or similar)
- Pink variant for one partner
- Blue variant for other partner
- Sold as 2-pack bundle

**Core Value Proposition:**
- Tangible, physical messages in digital age
- Surprise element (prints when partner opens app)
- No WiFi needed on printers (app is middleman)
- Instant romantic connection

---

## Product Architecture

### High-Level Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Mobile App    │ ◄─────► │  Backend Server  │ ◄─────► │   Mobile App    │
│   (Partner A)   │         │   (Cloud)        │         │   (Partner B)   │
│                 │         │                  │         │                 │
│  ┌───────────┐  │         │  ┌────────────┐  │         │  ┌───────────┐  │
│  │ Bluetooth │  │         │  │  Database  │  │         │  │ Bluetooth │  │
│  │  Manager  │  │         │  │  Messages  │  │         │  │  Manager  │  │
│  └─────┬─────┘  │         │  │  Partners  │  │         │  └─────┬─────┘  │
│        │        │         │  │  Devices   │  │         │        │        │
│   ┌────▼────┐   │         │  └────────────┘  │         │   ┌────▼────┐   │
│   │ Printer │   │         └──────────────────┘         │   │ Printer │   │
│   │ (Blue)  │   │                                      │   │ (Pink)  │   │
└───┴─────────┴───┘                                      └───┴─────────┴───┘
```

### Technology Stack Recommendations

#### Mobile App
- **Framework:** Flutter ✅ (Chosen)
  - Better performance and beautiful UI out of the box
  - Bluetooth via `flutter_blue_plus`
  - State management via `provider`
  - Cross-platform iOS + Android from single codebase

#### Backend
- **Firebase** ✅ (Chosen for MVP)
  - **Firebase Auth:** User authentication (email/password + Google Sign-In)
  - **Firestore:** Real-time database for messages (planned)
  - **Firebase Storage:** Image storage (planned)
  - **Firebase Cloud Messaging (FCM):** Push notifications (planned)

#### Bluetooth Protocol
- XiaoWa protocol fully ported to Dart ✅
  - `lib/core/services/ble_protocol.dart` — packet building, CRC-8, raster commands
  - `lib/core/services/image_processor.dart` — dithering, bitmap packing, text rendering

---

## Core Features & User Stories

### 1. Onboarding & Pairing

#### User Story
"As a new user, I want to pair my app with my partner's app so we can send messages to each other"

#### Features
- **Account Creation**
  - Email/password or social login (Google, Apple)
  - Profile setup (name, photo optional)
  
- **Partner Pairing**
  - Generate unique pairing code (e.g., "LOVE-88")
  - One partner creates code, other enters it
  - Immediate connection confirmation
  - Store partnership in database

- **Printer Setup**
  - Bluetooth scan for nearby printers
  - Identify printer model (X6h, etc.)
  - Pair via BLE
  - Test print to confirm connection
  - Save printer MAC address to user profile

#### Technical Requirements
- Unique 6-8 character pairing codes
- Code expiration (24 hours)
- Validation to prevent duplicate pairings
- Bluetooth permissions handling (iOS/Android)

---

### 2. Message Creation

#### User Story
"As a user, I want to create and send drawings, photos, or text to my partner"

#### Features

**A. Drawing Mode**
- Canvas with drawing tools
  - Pen/brush with size adjustment
  - Eraser
  - Undo/redo
  - Clear canvas
- Preview before sending
- Optimize for thermal printing (1-bit conversion)

**B. Text Mode**
- Text input field
- Font selection (limited to printer-friendly fonts)
- Font size adjustment
- Bold toggle
- Preview before sending

**C. Image Mode**
- Select from camera or photo library
- Crop/resize interface
- Image quality adjustments:
  - Brightness
  - Contrast
  - Gamma
  - Sharpness
- Dithering algorithm selection
- Preview dithered result

**D. Quick Sends**
- Pre-made templates (hearts, "I love you", etc.)
- Emoji support (converted to images)
- Recently sent messages

#### Technical Requirements
- Canvas API for drawing
- Image processing library (reuse existing `image-processor.js` logic)
- Camera/photo library permissions
- Maximum image size limits (for bandwidth)
- Compression before upload

---

### 3. Message Sending & Receiving

#### User Story
"As a user, I want my message to be delivered and printed on my partner's printer automatically"

#### Sending Flow
1. User creates message (draw/text/photo)
2. App processes image:
   - Convert to 1-bit bitmap
   - Apply LSB-first bit order
   - Compress for transmission
3. Upload to cloud backend
4. Backend stores message in queue
5. Send push notification to partner
6. UI shows "Sent" status with timestamp

#### Receiving Flow
1. App receives push notification
2. User opens app
3. App downloads pending messages from backend
4. **Automatic printing:**
   - Check if printer is connected via Bluetooth
   - If connected: Print immediately
   - If not connected: Show "Connect printer to print" prompt
5. Mark message as printed
6. Display in "Received" feed

#### Print Queue Management
- Queue multiple messages if printer offline
- Print in order received when printer connects
- Show print status (pending, printing, printed, failed)
- Retry logic for failed prints

#### Technical Requirements
- Message queue system (FIFO)
- Offline message storage (local SQLite/Realm)
- Background Bluetooth scanning (iOS limitations)
- Print job status tracking
- Error handling and retry logic

---

### 4. Message History

#### User Story
"As a user, I want to see the messages I've sent and received"

#### Features
- **Two Tabs:**
  - "Sent" - Messages sent to partner
  - "Received" - Messages from partner
  
- **Message Cards:**
  - Thumbnail preview
  - Timestamp (relative and absolute)
  - Print status indicator (Received tab):
    - ⏳ Pending
    - 🖨️ Printing
    - ✅ Printed
    - ⚠️ Failed (with retry button)
  
- **Message Details:**
  - Tap to view full size
  - Option to reprint (Received tab)
  - Option to delete

#### Technical Requirements
- Pagination for large message histories
- Image caching
- Local database sync with cloud
- Pull-to-refresh

---

### 5. Printer Management

#### User Story
"As a user, I want to manage my printer connection and settings"

#### Features

**Connection Status**
- Real-time status indicator
  - 🟢 Connected (device name, battery %)
  - 🔴 Disconnected
  - 🟡 Connecting

**Printer Settings**
- Print density adjustment (Light/Medium/Dark)
- Print width (384px default)
- Auto-print toggle (print immediately vs manual)
- Test print button

**Printer Pairing**
- Scan for printers
- Re-pair if connection lost
- Forget printer option

**Troubleshooting**
- Connection help guide
- "Printer not found" solutions
- Battery level warnings

#### Technical Requirements
- Background Bluetooth reconnection
- Battery level monitoring via BLE
- Printer state queries (paper, cover, temperature)
- Graceful handling of Bluetooth off/permissions denied

---

### 6. Settings & Profile

#### Features
- **Account:**
  - Profile photo
  - Display name
  - Email (non-editable)
  - Change password
  - Log out

- **Notifications:**
  - New message notifications
  - Print status notifications
  - Sound effects toggle

- **Partner:**
  - View partner profile
  - Unpair option (with confirmation)

- **General:**
  - Help center / FAQ
  - User manual
  - Terms of service
  - Privacy policy
  - App version info

- **Danger Zone:**
  - Delete account
  - Clear message history

---

## Data Models

### User
```javascript
{
  userId: string (UUID),
  email: string,
  passwordHash: string,
  displayName: string,
  profilePhotoUrl: string?,
  createdAt: timestamp,
  lastActiveAt: timestamp,
  
  // Pairing
  partnerId: string? (ref to User),
  pairingCode: string?,
  pairingCodeExpiry: timestamp?,
  
  // Printer
  printerMacAddress: string?,
  printerModel: string?,
  printerColor: enum('pink', 'blue')?,
  
  // Settings
  autoPrintEnabled: boolean (default: true),
  notificationsEnabled: boolean (default: true),
  printDensity: enum('light', 'medium', 'dark'),
  
  // FCM
  fcmTokens: string[] (multiple devices)
}
```

### Message
```javascript
{
  messageId: string (UUID),
  senderId: string (ref to User),
  recipientId: string (ref to User),
  
  type: enum('drawing', 'text', 'photo'),
  
  // Content
  imageUrl: string, // Processed bitmap image
  originalImageUrl: string?, // Original photo if type='photo'
  textContent: string?, // If type='text'
  
  // Metadata
  createdAt: timestamp,
  sentAt: timestamp,
  deliveredAt: timestamp?,
  printedAt: timestamp?,
  
  // Status
  status: enum('pending', 'sent', 'delivered', 'printed', 'failed'),
  failureReason: string?,
  retryCount: number,
  
  // Print data
  bitmapData: base64, // 1-bit bitmap ready for printer
  width: number,
  height: number,
  
  // Processing options (for reprocessing)
  processingOptions: {
    brightness: number,
    contrast: number,
    gamma: number,
    sharpness: number,
    dithering: string
  }
}
```

### Partnership
```javascript
{
  partnershipId: string (UUID),
  user1Id: string (ref to User),
  user2Id: string (ref to User),
  createdAt: timestamp,
  status: enum('active', 'dissolved'),
  dissolvedAt: timestamp?,
  messageCount: number
}
```

### PrintQueue (Local - SQLite/Realm)
```javascript
{
  queueId: string,
  messageId: string,
  timestamp: timestamp,
  attempts: number,
  status: enum('queued', 'printing', 'completed', 'failed'),
  errorMessage: string?
}
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/register          - Create account
POST   /api/auth/login             - Login
POST   /api/auth/logout            - Logout
POST   /api/auth/refresh-token     - Refresh auth token
POST   /api/auth/reset-password    - Password reset
```

### Pairing
```
POST   /api/pairing/generate-code  - Generate pairing code
POST   /api/pairing/validate-code  - Validate and pair
DELETE /api/pairing                - Unpair from partner
GET    /api/pairing/partner        - Get partner info
```

### Messages
```
POST   /api/messages               - Send new message
GET    /api/messages/inbox         - Get received messages
GET    /api/messages/sent          - Get sent messages
GET    /api/messages/:id           - Get message details
PATCH  /api/messages/:id/status    - Update print status
DELETE /api/messages/:id           - Delete message
```

### User
```
GET    /api/user/profile           - Get user profile
PATCH  /api/user/profile           - Update profile
POST   /api/user/fcm-token         - Register FCM token
DELETE /api/user/account           - Delete account
```

### Printer
```
PATCH  /api/user/printer           - Update printer info
GET    /api/user/printer/status    - Get printer settings
```

---

## Mobile App Structure

### Screen Hierarchy

```
App
├── Onboarding Flow (First time only)
│   ├── Welcome Screen
│   ├── Sign Up / Login
│   ├── Partner Pairing
│   │   ├── Generate Code
│   │   └── Enter Code
│   └── Printer Setup
│       ├── Scan for Printer
│       ├── Select Printer
│       └── Test Print
│
├── Main App (Tab Navigation)
│   ├── Home / Create Note
│   │   ├── Draw Tab
│   │   ├── Image Tab
│   │   └── Type Tab
│   │
│   ├── Messages / History
│   │   ├── Received Tab
│   │   └── Sent Tab
│   │
│   ├── Printer Status
│   │   └── Quick Print Queue
│   │
│   └── Settings
│       ├── Account
│       ├── Printer Configuration
│       ├── Notifications
│       └── Help
│
└── Modals
    ├── Message Preview
    ├── Printer Scanner
    ├── Image Editor
    └── Help / Tutorials
```

### Implemented File Structure (Flutter)

```
sentimo_app/lib/
├── main.dart                          # App entry, provider setup
├── firebase_options.dart              # Firebase config
├── core/
│   ├── providers/
│   │   ├── auth_provider.dart         # Firebase Auth + Google Sign-In
│   │   ├── printer_provider.dart      # BLE connection, printing, auto-reconnect
│   │   ├── message_provider.dart      # Message queue, send/receive, print status
│   │   └── partner_provider.dart      # Pairing codes, rate-limiting, partner management
│   ├── services/
│   │   ├── ble_protocol.dart          # XiaoWa packet protocol (Dart port)
│   │   └── image_processor.dart       # Dithering, bitmap packing, text-to-bitmap
│   └── theme/
│       └── app_theme.dart             # Colors, text styles, theme data
└── features/
    ├── auth/
    │   ├── login_screen.dart
    │   └── signup_screen.dart
    ├── create/
    │   ├── create_note_screen.dart     # Draw / Image / Type tabs
    │   └── drawing_canvas.dart         # CustomPainter drawing widget
    ├── history/
    │   └── history_screen.dart         # Sent/Received message tabs
    ├── home/
    │   ├── home_screen.dart            # Dashboard, printer status, quick actions
    │   └── main_navigation.dart        # Bottom nav + auto-reconnect + auto-print dialog
    ├── onboarding/
    │   └── welcome_screen.dart
    ├── pairing/
    │   └── partner_pairing_screen.dart # Code gen/entry, partner naming, rate-limiting
    ├── printer/
    │   └── printer_setup_screen.dart
    ├── settings/
    │   └── settings_screen.dart
    └── splash/
        └── splash_screen.dart
```

### Key Components

**Drawing Canvas**
- Touch event handling
- Stroke smoothing
- Multi-touch support (zoom/pan)
- Export to image

**Image Processor**
- Port from `image-processor.js`
- Brightness/contrast/gamma adjustments
- Dithering algorithms (Atkinson, Floyd-Steinberg, etc.)
- LSB-first bit packing
- Preview generation

**Bluetooth Manager**
- BLE scanning and connection
- XiaoWa protocol implementation
- Print queue management
- Connection state monitoring
- Error handling

**Message Queue**
- Local storage (SQLite/Realm)
- Sync with cloud
- Background processing
- Retry logic

**Push Notification Handler**
- FCM integration
- Local notification display
- Deep linking to messages
- Badge count management

---

## Implementation Phases

### Phase 1: MVP (Minimum Viable Product) - 8-12 weeks

**Goal:** Basic app with core functionality for beta testing

**Features (Current Implementation Status as of Feb 2026):**
- ✅ User authentication (email/password + Google Sign-In)
- ✅ Partner pairing with short-lived one-time codes, confirmation step, rate-limiting, partner naming
- ✅ Bluetooth printer connection (X6h only, auto-scan, auto-reconnect on app resume)
- ✅ Text message creation (with keyboard-aware layout, font picker, thermal print tips)
- ✅ Drawing creation (pen, eraser, undo/redo, clear, stroke width)
- ✅ Image message creation (camera/gallery, brightness/contrast, multiple dithering modes, crop support)
- ✅ Message sending (local queue, demo mode)
- ✅ Auto-reconnect on app open/resume (WidgetsBindingObserver lifecycle)
- ✅ Auto-print pending messages on printer connection (with status popup, retry logic)
- ✅ Message history (sent/received tabs, status badges, print/resend from history)
- ✅ Full settings screen (printer density/quality, partner management, profile editing, unlink/unpair with confirmation)
- ✅ Print queue with status tracking (pending → printing → printed/failed)
- ✅ Cloud message storage (Firestore + Firebase Storage — messages persist across app restarts)
- ✅ Push notifications for new messages (FCM token registration, Cloud Function for send, NotificationService client setup)

**Platform:** iOS and Android (Flutter)

**Backend:** Firebase Auth ✅ | Firestore/Storage/FCM in progress

**Deliverables:**
- Beta app on TestFlight / Google Play Beta
- 10-20 beta tester couples
- Basic documentation

---

### Phase 2: Enhancement - 4-6 weeks

**Features:**
- ✅ Photo messaging with brightness/contrast controls
- ✅ Multiple dithering algorithms (Floyd-Steinberg, Atkinson, Ordered, Threshold) — Atkinson ("Artistic") is now the default
- ✅ Image quality controls (brightness, contrast)
- ✅ Image cropping via native crop UI (image_cropper)
- ✅ Dithered image preview (1-bit bitmap → PNG conversion for live preview)
- ✅ Post-print 2mm blank margin to keep prints away from tear edge
- ✅ Battery level correctly parsed from voltage (decivolts → percentage via Li-ion discharge curve)
- ⬜ Templates and quick sends
- ⬜ Message reprint functionality (UI exists, backend pending)
- ✅ Auto-reconnect to printer on app resume
- ✅ Offline message queue (local print queue)
- ✅ Print status tracking (pending, printing, printed, failed) with auto-print dialog
- ✅ Google Sign-In (Apple Sign-In pending)
- ⬜ Enhanced onboarding tutorial

**UI/UX:**
- Polish based on beta feedback
- Add animations and transitions
- Improve error messaging

---

### Phase 3: Scaling - 4-6 weeks

**Features:**
- ✅ Support for additional printer models
- ✅ Multi-language support
- ✅ Dark mode
- ✅ Message encryption (E2E)
- ✅ Scheduled message sending
- ✅ Message reactions/acknowledgments
- ✅ Analytics dashboard (for admin)
- ✅ In-app purchases (premium features?)

**Infrastructure:**
- Move to custom backend if Firebase limits reached
- CDN for images
- Database optimization
- Load testing

---

### Phase 4: Growth Features - Ongoing

**Potential Features:**
- Custom printer colors (not just pink/blue)
- Group messaging (family mode)
- Third-party printer support
- Desktop app
- Web interface
- AI-generated message suggestions
- Handwriting recognition
- Voice-to-text messages
- Sticker packs
- Anniversary reminders
- Message statistics (total sent, longest streak, etc.)

---

## Technical Challenges & Solutions

### Challenge 1: Bluetooth Background Operation

**Problem:** Mobile OSs restrict Bluetooth in background

**iOS Limitations:**
- Background scanning is limited
- Can maintain connection to paired device
- Cannot auto-connect in background

**Android Limitations:**
- Better than iOS but still restricted
- Background location permission needed for BLE scan

**Solutions:**
- **Don't auto-print in background** - Only print when app is open
- Use push notifications to prompt user to open app
- Maintain connection while app in foreground
- Show persistent notification when printer connected

---

### Challenge 2: Print Reliability

**Problem:** Bluetooth connections can be unstable

**Solutions:**
- Robust error handling and retry logic
- Queue messages locally if printer disconnected
- User feedback on print status
- Manual retry button
- Automatic reconnection attempts
- Test print on every app launch (optional setting)

---

### Challenge 3: Image Processing Performance

**Problem:** Image processing is CPU-intensive

**Solutions:**
- Process images on backend before storing
- Use native image processing libraries
- Show progress indicators during processing
- Optimize algorithms (use lookup tables, etc.)
- Limit max image resolution
- Use worker threads/isolates (Dart) or workers (React Native)

---

### Challenge 4: Offline Functionality

**Problem:** Users may not always have internet

**Solutions:**
- Local message queue
- Offline mode for viewing history
- Sync when connection restored
- Clear indicators of online/offline state
- Cache images locally
- Store sent messages locally before upload

---

### Challenge 5: User Pairing Security

**Problem:** Pairing codes could be intercepted

**Solutions:**
- Short-lived codes (24h expiration)
- One-time use codes
- Require both partners to confirm pairing
- Option to manually verify partner (show profile info)
- Encrypted messaging (E2E later)
- Rate limiting on pairing attempts

---

## Security & Privacy Considerations

### Data Security
- HTTPS for all API communication
- JWT or OAuth tokens for authentication
- Secure token storage (Keychain/KeyStore)
- Image encryption in transit (SSL)
- End-to-end encryption (future phase)

### Privacy
- Minimal data collection
- Clear privacy policy
- GDPR compliance (if operating in EU)
- Option to delete all data
- No sharing of messages with third parties
- No analytics without consent

### User Safety
- Block/report functionality (future)
- Easy unpair process
- Account deletion
- Clear data after unpair option

---

## Monetization Strategy

### Initial Launch
- **Paid Hardware:** Sell label printer bundles
  - 2-pack: $79-99 USD
  - Includes both printers + starter paper roll
  - Pink + Blue variants

### App Model
- **Free app** (included with purchase)
- No ads
- No subscription (initially)

### Future Revenue Streams
1. **Premium Features** ($2.99/month or $19.99/year)
   - Additional templates
   - Advanced editing tools
   - Unlimited message history
   - Priority printing
   - Custom printer colors

2. **Consumables**
   - Replacement paper rolls ($5-10)
   - Premium colored paper
   - Sticker paper

3. **Merchandise**
   - Printer cases
   - Carrying pouches
   - Gift bundles (Valentine's, Anniversary)

---

## Marketing & Go-to-Market

### Target Audience
- **Primary:** Couples (ages 18-35)
- **Secondary:** Long-distance relationships
- **Tertiary:** Close friends, family members

### Launch Strategy
1. **Beta Testing** (Phase 1)
   - Invite 20-50 couples
   - Gather feedback
   - Iterate quickly

2. **Soft Launch** (Phase 2)
   - Kickstarter/Indiegogo campaign
   - Pre-orders for printer bundles
   - Social media marketing
   - Influencer partnerships

3. **Full Launch** (Phase 3)
   - Direct-to-consumer website
   - Amazon/retail partnerships
   - Holiday gift season timing
   - PR campaign

### Marketing Channels
- Instagram/TikTok (visual platform, young audience)
- YouTube (product reviews, tutorials)
- Reddit (r/LongDistance, r/relationship_advice)
- Wedding/engagement blogs
- Valentine's Day campaigns

---

## Success Metrics

### User Engagement
- Daily Active Users (DAU)
- Messages sent per day per couple
- App retention rate (Day 1, 7, 30)
- Time between messages (engagement frequency)

### Technical Metrics
- Message delivery success rate (>99%)
- Print success rate (>95%)
- Average time from send to print (<30 seconds)
- App crash rate (<1%)
- API response times (<200ms p95)

### Business Metrics
- Hardware units sold
- Customer acquisition cost (CAC)
- Lifetime value (LTV)
- Churn rate
- Net Promoter Score (NPS)

---

## Development Timeline

### Month 1-2: Foundation
- Finalize tech stack decision
- Backend setup (Firebase or custom)
- Basic React Native/Flutter project structure
- User authentication system
- Database schema implementation

### Month 3-4: Core Features
- Bluetooth integration (port XiaoWa protocol)
- Message creation (drawing, text)
- Message sending/receiving
- Push notifications
- Basic printer connection

### Month 5-6: Polish MVP
- Message history
- Settings screens
- Error handling
- Beta testing preparation
- Bug fixes

### Month 7-8: Beta Testing
- Recruit beta testers
- Gather feedback
- Iterate on UX
- Fix critical bugs
- Performance optimization

### Month 9-10: Enhancement
- Photo messaging
- Advanced editing tools
- Additional printer models
- Offline mode
- UI polish

### Month 11-12: Launch Prep
- App store submissions
- Marketing materials
- Documentation
- Customer support setup
- Final testing

---

## Team Requirements

### Development Team
- **1 Mobile Developer (React Native/Flutter)** - Full time
- **1 Backend Developer (Node.js/Firebase)** - Full time
- **1 UI/UX Designer** - Part time / Contract
- **1 QA Tester** - Part time

### Optional/Consultant Roles
- Bluetooth specialist (for complex printer integration)
- DevOps engineer (for backend scaling)
- Technical writer (documentation)

---

## Technology Reference (Porting from Web)

### Code to Port
From existing webapp, the following can be reused/ported:

**image-processor.js:**
- ✅ `textToBitmap()` - Text rendering
- ✅ `floydSteinbergDither()` - Dithering
- ✅ `atkinsonDither()` - Better thermal dithering
- ✅ `orderedDither()` - Bayer matrix
- ✅ `applyContrast()` - Contrast adjustment
- ✅ `applyBrightness()` - Brightness adjustment
- ✅ `applyGamma()` - Gamma correction
- ✅ `applySharpen()` - Sharpening filter
- ✅ `packBitmap()` - **Critical:** LSB-first bit packing

**ble-protocol.js:**
- ✅ Packet structure `[0x51, 0x78, CMD, ...]`
- ✅ CRC-8 calculation
- ✅ Command bytes (0xBF line data, 0xA6 start, etc.)
- ✅ Print sequence logic
- ✅ All SDK command implementations

### Platform Chosen: Flutter

- **Bluetooth:** `flutter_blue_plus` ✅
- **Drawing Canvas:** `CustomPainter` (DrawingCanvas widget) ✅
- **Image Processing:** `image` package + custom Dart port of JS processor ✅
- **Camera/Gallery:** `image_picker` ✅
- **State Management:** `provider` ✅
- **Local Storage:** `shared_preferences` + `sqflite` ✅
- **Auth:** `firebase_auth` + `google_sign_in` ✅

---

## Risk Assessment

### Technical Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Bluetooth connectivity issues | High | High | Robust error handling, user guides |
| iOS background limitations | Medium | High | Don't rely on background printing |
| Image processing performance | Medium | Medium | Optimize algorithms, backend processing |
| Print quality issues | High | Medium | Extensive testing, multiple dithering options |
| Printer hardware compatibility | High | Low | Focus on one model (X6h) initially |

### Business Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Low market demand | High | Medium | Beta test, Kickstarter validation |
| High customer support needs | Medium | High | Great documentation, FAQ, video tutorials |
| Printer supply chain issues | High | Low | Multiple supplier relationships |
| Competitor entry | Medium | Medium | Move fast, build community, patents? |

---

## Next Steps

1. **Validate Market Demand**
   - Survey target audience
   - Build landing page with email signup
   - Gauge interest before full development

2. **Make Tech Stack Decision**
   - React Native vs Flutter
   - Firebase vs Custom backend
   - Consider team expertise

3. **Create Detailed Design Mockups**
   - High-fidelity UI designs
   - User flow diagrams
   - Interactive prototype

4. **Set Up Development Environment**
   - Project repositories
   - CI/CD pipeline
   - Development/staging/production environments

5. **Begin Phase 1 Development**
   - Authentication system
   - Backend setup
   - Basic mobile app structure

---

## Appendix

### Similar Products (Competition Analysis)
- **Bond Touch Bracelets** - Haptic touch bracelets for couples (~$98)
- **LokLok** - Shared lock screen drawing app (free app)
- **Between** - Couple's messaging app (free with premium)
- **Flic Buttons** - Physical buttons for triggering actions (~$34)

### Differentiation
- Only product with **physical printed output**
- **Tangible keepsakes** vs ephemeral digital
- **Surprise element** of printing
- **Nostalgia factor** (like passing notes in class)

### Technical Resources
- XiaoWa SDK documentation (from AAR decompilation)
- Web Bluetooth API (as reference)
- React Native BLE examples
- Flutter Bluetooth examples
- Thermal printer protocols (ESC/POS reference)

### XiaoWa Protocol Quality Settings (From Official App Analysis)

Based on reverse engineering the official TinyPrint iOS app packet captures, these are the critical settings for optimal print quality:

#### Density Command (0xAF) - **CRITICAL FOR QUALITY**
| Setting | Hex Value | Decimal | Notes |
|---------|-----------|---------|-------|
| Light   | 0x40      | 64      | Low energy, faster printing |
| Medium  | 0x80      | 128     | Balanced |
| **Dark (Official App)** | **0xB0** | **176** | **Recommended - used by official app** |
| Maximum | 0xFF      | 255     | Maximum darkness, slower printing |

#### Quality Command (0xA4)
| Level | ASCII Value | Hex | Notes |
|-------|-------------|-----|-------|
| 1     | '1'         | 0x31 | Lowest quality |
| 2     | '2'         | 0x32 | Low quality |
| **3 (Default)** | **'3'** | **0x33** | **Standard - used by official app** |
| 4     | '4'         | 0x34 | High quality |
| 5     | '5'         | 0x35 | Highest quality |

#### Official App Command Sequence
For best results, send commands in this order:
1. `0xA8` - Get device info (wait for response)
2. `0xBB` - Unknown capability query (optional)
3. `0xA3` - Get device state
4. `0xA4` - Set quality level (0x33 recommended)
5. `0xAF` - **Set density to 0xB0 (176)**
6. `0xBE` - Set image mode (0x00)
7. `0xA6` - **Print Lattice Start** (CRITICAL — initializes thermal head timings)
8. `0xA2` - Send raster lines (row by row)
9. `0xA6` - **Print Lattice Finish** (finalizes thermal head operations)
10. `0xA1` - Paper feed

#### Implementation Notes
- **MTU Negotiation**: Request 512, expect ~185 actual
- **Density 0xB0 is the key quality improvement** - lower values result in faded prints
- **Print Lattice Start/Finish (0xA6) is CRITICAL** — without these commands, the thermal print head uses suboptimal heating parameters. The first print after power-on will be faded/low-quality. The printer's built-in diagnostic page (double-press power) sends these internally, which is why subsequent prints appear higher quality.
- Consider implementing RLE compression (0xA2 command) for faster transfers
- Map user-facing "Light/Medium/Dark" settings to 0x40/0x80/0xB0 hex values

---

<<<<<<< HEAD
**Document Version:** 1.9.0
**Last Updated:** February 12, 2026  
**Author:** Product Planning Team  
**Status:** Active Development — Flutter app MVP in progress

### Changelog (v1.9.0 — Feb 12, 2026)
- **New-messages popup on app open** — When the user opens the app with unprinted received notes, a popup now says "New Notes Waiting!" and asks if they'd like to print. The popup intentionally hides message content (no preview, no type labels) to preserve the surprise. If the user taps "Print Now" but the printer is not connected, the app first attempts auto-reconnect, then falls back to the device picker bottom sheet, then starts printing.
  - `MessageProvider._loadMessageHistory()` now adds unprinted received messages (status != printed/failed, with imageData) to the print queue on startup, which triggers the popup.
  - `_onMessageProviderChanged` in `MainNavigation` replaced the old snackbar + auto-print behavior with the new ask-first popup (`_NewMessagesDialog`).
  - `_onPrinterConnected` now shows the new-messages popup instead of immediately starting auto-print.
  - New `_handlePrintAfterPopup()` and `_attemptReconnectThenPrint()` methods handle the reconnect-then-print flow.
  - `_AutoPrintDialog` updated: message type labels removed ("Drawing", "Image", "Text" → "Note 1", "Note 2") and text changed from "Messages" to "Notes" throughout.
- **Push notifications via FCM** — Receiving users now get a push notification when their partner sends a note.
  - New `NotificationService` (`lib/core/services/notification_service.dart`): requests notification permissions, obtains and saves FCM device token to Firestore, listens for token refreshes, configures iOS foreground notification presentation.
  - New `FirebaseService.saveFcmToken()` / `removeFcmToken()` methods for persisting FCM tokens as an array on the user's Firestore document.
  - New Cloud Function (`functions/index.js`): triggers on Firestore `messages/{messageId}` creation, looks up receiver's FCM tokens and partner name, sends push notification via FCM with APNs + Android configuration, cleans up invalid tokens.
  - `NotificationService.initialize()` is called during Firebase provider initialization in `MainNavigation`.
  - **Deployment required**: Run `cd functions && npm install && firebase deploy --only functions` to activate push notifications.
- **History tab order swapped** — The History screen now defaults to the "Received" tab (left), with "Sent" on the right, so users see incoming notes first.
- **Notification permission onboarding screen** — New `NotificationPermissionScreen` added to the onboarding flow (after printer setup, before main app). Explains why notifications matter with benefit bullets ("Know instantly when your partner sends a note"), offers "Enable Notifications" and "Maybe Later" buttons. Triggers the system permission dialog and initializes FCM when enabled.

### Changelog (v1.8.3 — Feb 16, 2026)
- **Fixed text alignment not printing correctly** — Text alignment (left / center / right) selected in the Type tab was visible in the app's preview but always printed left-aligned. Root cause: `staticTextToBitmap()` in `image_processor.dart` called `textPainter.layout(maxWidth: ...)` without setting `minWidth`, so the `TextPainter` layout box shrank to fit the widest line. This left no room for `textAlign` to position lines within the box. Fix: set `minWidth == maxWidth` to force a fixed-width layout, and always paint at the left padding edge, letting `TextPainter.textAlign` handle per-line alignment internally. The manual `dx` offset switch statement was removed.
- **Added `textAlign` parameter passthrough** — The instance method `textToBitmap()` was not forwarding the `textAlign` parameter to `staticTextToBitmap()`, silently dropping the user's alignment choice. Now correctly passed through.
- **Battery display uses word labels instead of percentages** — The printer reports battery as integer decivolts (~10 discrete levels in the 3.3–4.2V range), making a numeric percentage misleadingly precise. Battery is now displayed as a word label (Full / Good / OK / Low / Critical) via `PrinterStatus.batteryLabel`. Updated on Home screen and Settings screen.
- **Refined battery voltage-to-percentage curve** — Updated `_voltageToPercentage()` lookup table in `ble_protocol.dart` to better match a standard Li-ion discharge curve: 4.0V→75% (was 80%), 3.9V→55% (was 60%), 3.8V→35% (was 40%), 3.7V→18% (was 20%), 3.6V→8% (was 10%), 3.5V→3% (was 5%).
- **Battery icon thresholds aligned with labels** — `_batteryIcon()` and `_batteryColor()` on the Home screen now use the same breakpoints as `batteryLabel` (85/60/30/12%) instead of the old 90/60/40/20% thresholds.

### Changelog (v1.8.2 — Feb 11, 2026)
- **Fixed message persistence across app restarts** — Messages (sent and received drawings, images, text) are now reliably retained in the History tab after restarting the app. Root causes:
  - Firestore `loadReceivedMessages` query used `orderBy('createdAt', descending: true)` which requires a composite index (`receiverId ASC, createdAt DESC`) that was never created. The query threw a silent error, and since both queries were inside a single `Future.wait`, the sent messages query was also lost.
  - **Fix**: Removed `orderBy` from both `loadSentMessages` and `loadReceivedMessages` in `FirebaseService`. Messages are now sorted client-side after fetching, eliminating composite index requirements for history loading. Comments document the recommended indexes for future performance optimization.
  - **Fix**: Separated error handling for sent and received message loading — each query now has its own try/catch so a failure in one doesn't prevent the other from loading.
  - **Fix**: Individual message processing errors (e.g. bitmap download failures) are now caught per-message instead of aborting the entire load.
- **Fixed History tab Print button** — The "Print" button in the message detail bottom sheet was a stub (only called `Navigator.pop(context)`). It now:
  - Calls `PrinterProvider.printBitmap()` with the message's stored bitmap data, width, and height
  - Shows appropriate errors when printer is not connected or message has no printable data
  - Displays a loading spinner during printing
  - Marks the message as printed (updates both local state and Firestore) on success
  - Shows success/failure feedback via SnackBar
- **Fixed History tab Resend button** — The "Resend" button was also a stub. It now resends the message to the partner via `MessageProvider.sendMessage()`.
- **markAsPrinted now updates sent messages too** — Previously only updated received messages. Users can now print their own sent messages from history and see the correct "Printed" status.
- **Text content now saved to Firestore** — `_handleSend` in `CreateNoteScreen` now passes `textContent` for text-type messages to `sendMessage()`, so the original text is preserved in Firestore alongside the bitmap.
- **Loading indicator on History screen** — Shows a `CircularProgressIndicator` while messages are loading from Firestore, instead of showing the empty state during load.
- **Removed Print Quality option from Settings** — The "Print Quality" setting (levels 1-5) had no functional effect on printing. Removed from the Settings screen and `_showQualityPicker` method. Print density (which does work) is still available.
- **Fixed camera button crash** — Tapping "Camera" on the Image tab crashed the app because `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` were missing from `ios/Runner/Info.plist`. Added both permission strings. Also added try/catch error handling around `_pickImage()` so camera/gallery errors show a user-friendly SnackBar instead of crashing.
- **Dramatically reduced iOS build times** — Added precompiled Firestore iOS SDK (`invertase/firestore-ios-sdk-frameworks`, tag `11.15.0`) to `ios/Podfile`. This replaces compiling 500k+ lines of C++ Firestore source each build with precompiled xcframeworks, reducing iOS build time by ~67%. Deleted `Podfile.lock` to force re-resolution.
- **Refactored message detail bottom sheet** — Extracted to a `_MessageDetailSheet` `StatefulWidget` for proper state management of the printing flow (loading state, error handling).
- **iPad Draw tab layout** — On iPad (shortestSide ≥ 600px), the Draw tab now uses a side-by-side layout: a square canvas on one side and a vertical controls panel on the other. Prevents the canvas from stretching too wide on tablet screens. Added a flip button (chevron icon) that swaps the canvas and controls positions (left ↔ right). Phone layout is unchanged.

### Changelog (v1.8.1 — Feb 9, 2026)
- **Create Note UX improvements** — Enhanced the Create Note screen with multiple quality-of-life improvements:
  - **Clear text button** — Added an 'X' button in the top-right corner of the Type tab text preview that clears the input field, matching the existing clear button behavior in the Image tab
  - **Font size preview scaling** — Removed the artificial `.clamp(12, 36)` limit on the Type tab preview text so it now scales properly up to the slider maximum of 48pt
  - **Slider visual consistency** — Added light grey inactive track (`Colors.grey.shade300`) to pen thickness (Draw), brightness/contrast (Image), and font size (Type) sliders to match the darkness slider appearance
  - **Reset buttons for sliders** — Added small reset icon buttons (refresh icon) next to pen thickness, brightness, contrast, and font size sliders that restore default values (pen:5.0, brightness:0.0, contrast:1.0, font:24)
  - **Image preview optimization** — Images in the Image tab now show the dithered 1-bit bitmap preview immediately upon loading instead of showing the color version first
  - **Debounced slider updates** — Added 300ms debouncing to brightness and contrast sliders to prevent continuous reprocessing during drag, significantly improving responsiveness
  - **Combined image adjustments** — Merged brightness, contrast, and gamma adjustments into a single pixel loop, reducing pixel iterations by ~66% (from 3-4 separate loops to 1 combined pass) for ~3x faster processing when adjustments are applied
- **Reconnect button text size** — Reduced "Reconnect" button font size to 12px in the Printer Disconnected dialog to prevent text wrapping to two lines
- **Settings screen printer connect flow** — Updated Settings screen Connect button to match home screen behavior: first attempts auto-connect to last-known device, then falls back to device picker sheet if auto-connect fails; added loading spinner during connection attempt
- **Default print density changed** — Changed default printer density from level 3 (Medium) to level 5 (Extra Dark) for darker, more visible prints out of the box

### Changelog (v1.8 — Feb 7, 2026)
- **Rewrote print protocol to match TiMini-Print** — Cloned and analyzed the open-source [TiMini-Print](https://github.com/Dejniel/TiMini-Print) project which reverse-engineered the X6h protocol. Major protocol changes:
  - **Energy values now use proper 16-bit LE range** — Old code accidentally sent 0x8000 (32768) from a single byte at the wrong position. TiMini-Print's X6h model specifies thin/mod/deep = 5000, text = 8000. X6H (uppercase) uses 9500 everywhere. Density levels 1-5 now map to energy 3000–8000.
  - **Print job sequence restructured** — Now: A4 blackening → AF energy → BE print mode → BD speed(10) → A2 raster lines → BD feed → A1 paper x2 → BD feed → A3 state query. Removed A8 device info, BB device ID, and A6 lattice commands that were not part of TiMini-Print's sequence.
  - **Speed command (BD) added** — img_print_speed=10 from X6h model config, sent before raster data.
  - **Periodic feed every 200 lines** — Prevents printer buffer overflow on tall images.
  - **Post-print sequence** — Feed padding + paper command x2 + feed padding + device state query.
  - **RLE compression (0xBF) implemented but disabled** — X6h supports `new_compress=true` with LSB-first pixel RLE, but our bitmap data is MSB-first. Using raw A2 packets for now to avoid bit-order mismatches until bit flip is implemented.
  - **Default density lowered from 5 to 3** — Matches TiMini-Print's default blackening level.
  - **Removed thermal warm-up strip** — Was a workaround for the byte-order energy bug; proper energy values should fix the cold-start issue.
- **Important**: User should check if printer BLE name starts with `X6h-` (energy ~5000) or `X6H-` (energy ~9500). If prints are too light, density 5 (energy 8000) or the X6H energy table may be needed.

### Changelog (v1.7 — Feb 7, 2026)
- **Message history persistence** — Sent and received messages are now loaded from Firestore on startup so the History screen retains data across sessions. `MessageProvider.initializeWithUser()` now calls `_loadMessageHistory()` which fetches up to 50 sent + 50 received messages (including bitmap downloads) before starting the real-time listener. `Message.fromJson()` also handles Firestore `Timestamp` types.
- **Reconnect dialog on unexpected disconnect** — When the printer drops its BLE connection mid-print or while idle, a "Printer Disconnected" dialog now appears with a "Reconnect" button. The reconnect flow mirrors the home screen's Connect button: auto-connect to the last-known device first, then fall back to a BLE scan + device picker bottom sheet. `PrinterProvider` tracks `_userInitiatedDisconnect` so the dialog only appears for unexpected drops (not explicit user disconnects).
- **Removed notification bell** — The non-functional bell icon in the home screen header has been removed.

### Changelog (v1.6 — Feb 7, 2026)
- **Fixed cold-start print quality** — Root cause: Both the first (faded) print and the second (crisp) print after the diagnostic page send **identical** BLE commands. The only difference is that the diagnostic page physically heats the thermal head. Solution: added a **thermal warm-up strip** (40 solid-black raster lines, ~5 mm) that prints automatically on the first job after power-on / reconnect. This heats the ceramic print head to operating temperature before the actual image. Subsequent prints skip the warm-up since the head is already warm.
- **Reverted energy byte-order** — The v1.5 byte-order swap was wrong. Original `[0x00, 0x80]` is interpreted by the printer as 16-bit little-endian = 0x8000 (high energy). The v1.5 "fix" sent `[0xB0, 0x00]` = 0x00B0 (low energy), making prints extremely faint. Byte order is now restored to original big-endian layout where the energy byte lands in the high byte of the LE 16-bit value.
- **Removed speed command** — `0xBD` speed=2 was too fast and reduced thermal energy per line. The original packet captures show no speed command, so it is not sent. The `buildSpeedCommand()` method is retained in BleProtocol for future use if needed.
- **Default density kept at level 5** — With restored byte order, density 5 (0xB0) yields LE value 0xB000 = 45056, higher than the old density-3 value of 0x8000 = 32768, giving darker prints.
- v1.4 lattice start/finish commands retained

### Changelog (v1.5 — Feb 7, 2026)
- *(Superseded by v1.6)* — Attempted energy byte-order swap + speed command. Made prints faintly visible. Reverted.

### Changelog (v1.4 — Feb 7, 2026)
- **Added Print Lattice Start/Finish commands** — `0xA6` commands now frame raster data in `printBitmap()`
- **Updated protocol command sequence** in documentation to include `0xA6` lattice start/finish and `0xBE` image mode commands

### Changelog (v1.3 — Feb 6, 2026)
- **Default dithering** changed from Smooth (Floyd-Steinberg) to Artistic (Atkinson) on Image tab
- **Fixed image preview bug** — changing dithering style no longer makes the image disappear; 1-bit bitmap is now converted to PNG for preview
- **Added image cropping** — native crop UI via `image_cropper` package, accessible from Image tab
- **Added 2mm post-print margin** — 16 blank raster lines sent after image data to keep prints clear of the tear edge
- **Fixed battery reading** — raw byte from printer is now interpreted as voltage in decivolts (e.g. 0x27 = 3.9V → ~60%) and converted via a lithium battery discharge curve lookup, instead of being displayed as a raw percentage
- **Battery icon** on home screen now dynamically reflects charge level with appropriate icon and color
