import './style.css';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { bridgeCategories, allBridgeQuestions } from './content.js';

// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let gameState = {};
let currentUser = null;
let currentGameUnsubscribe = null;
let connectionUnsubscribe = null;
let invitesUnsubscribe = null;
let myThreadsUnsubscribe = null;
let lastAcceptedThread = null; // for the "Continue last thread" quick button
let threadsCollapsed = false;

let prevGameState = {}; // for detecting partner changes for toasts
let notificationPermissionAsked = false;
let activeToasts = 0;

// Robust formatter (defined early so renderAll never crashes on it)
function formatLoveMeter(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '10.00';
  if (n >= 100) return '100';
  return n.toFixed(2);
}

// ==================== BADGE DEFINITIONS ====================
// Updated to use the actual uploaded images in public/badges/
const BADGES = [
  { id: 'first-spark',      name: 'First Spark',      desc: '1 day streak',           icon: '🔥', minStreak: 1,  img: '/badges/first_spark.jpg' },
  { id: 'consistent-heart', name: 'Consistent Heart', desc: '3 day streak',           icon: '❤️', minStreak: 3,  img: '/badges/consistent_heart.jpg' },
  { id: 'weekly-weaver',    name: 'Weekly Weaver',    desc: '7 day streak',           icon: '🧵', minStreak: 7,  img: '/badges/weekly_weaver.jpg' },
  { id: 'fortnight-flame',  name: 'Fortnight Flame',  desc: '14 day streak',          icon: '🌟', minStreak: 14, img: '/badges/fortnight_flame.jpg' },
  { id: 'monthly-bond',     name: 'Monthly Bond',     desc: '30 day streak',          icon: '🌕', minStreak: 30, img: '/badges/Monthly_bond.jpg' },
  { id: 'storyteller',      name: 'Storyteller',      desc: '10 stories shared',      icon: '📖', stories: 10,   img: '/badges/storyteller.jpg' },
  { id: 'bridge-builder',   name: 'Bridge Builder',   desc: '50 questions answered',  icon: '🌉', bridge: 50,    img: '/badges/Bridge_builder.jpg' },
  { id: 'note-keeper',      name: 'Note Keeper',      desc: '20 love notes',          icon: '✉️', notes: 20,     img: '/badges/Notekeeper.jpg' },
  { id: 'heart-gardener',   name: 'Heart Gardener',   desc: 'Love meter reached 50',  icon: '🌱', meter: 50,     img: '/badges/heart_gardener.jpg' },
  { id: 'perfect-weave',    name: 'Perfect Weave',    desc: 'Love meter reached 100', icon: '💯', meter: 100,    img: '/badges/perfect_weave.jpg' },
];

let myBridgeRole = 'a'; // 'a' for first/creator, 'b' for joiner. Persisted per game in localStorage.
let currentBridgeCategory = 'all';

// ==================== 100 PROMPTS ====================
let promptsPool = [
  "What’s one small thing I did recently that made you feel incredibly loved?",
  "If we could teleport anywhere together for 24 hours right now, where would we go?",
  "What’s a memory of us that still makes you smile?",
  "Describe the perfect lazy Sunday we would have together.",
  "What’s something you’ve always wanted to try with me but haven’t said out loud?",
  "If our relationship was a movie, what genre would it be and why?",
  "What’s one thing about my personality that turns you on the most?",
  "Write a short message to our future selves 5 years from now.",
  "What’s the most romantic thing you can imagine us doing together?",
  "If you could relive one day we spent together, which day would it be?",
  "How do you feel when we go a whole day without talking?",
  "What’s one thing you love about how we communicate despite the distance?",
  "If we closed the distance tomorrow, what’s the first thing you’d want to do?",
  "What’s a dream you have for our future together that excites you?",
  "When do you feel most connected to me even when we’re apart?",
  "What’s something you miss most about being physically together?",
  "If we won the lottery, what’s the first crazy thing we’d do together?",
  "What’s one habit of mine that you find adorable?",
  "Describe how you would greet me if I walked through your door right now.",
  "What’s something you’ve learned about love because of our relationship?",
  "Would you rather have a big romantic gesture or quiet quality time with me?",
  "What’s your favorite memory of us being intimate (emotionally or physically)?",
  "If we could have one perfect day together with no limits, what would it look like?",
  "What’s one thing you want us to experience together in the next year?",
  "How has being long-distance made you appreciate me more?",
  "What’s something you’re looking forward to doing with me in person?",
  "If you could read my mind for one hour, what would you want to know?",
  "What’s a song that reminds you of us?",
  "Describe your ideal date night if we were in the same city.",
  "What’s one fear you have about our future that you’ve never told me?",
  "What’s something you love about my voice or the way I talk to you?",
  "If we adopted a pet together, what would we name it and why?",
  "What’s the best compliment I’ve ever given you?",
  "How do you want us to celebrate our next anniversary?",
  "What’s one thing you want me to know about how you feel about me?",
  "If we could live anywhere in the world together, where would it be?",
  "What’s something you do when you miss me?",
  "Describe the kind of life you want us to build together.",
  "What’s one way I make you feel safe even from far away?",
  "If we could do any activity together right now, what would it be?",
  "What’s a dream trip you’d love to take with me?",
  "How do you imagine our mornings together when we close the distance?",
  "What’s something you’ve been wanting to tell me but haven’t yet?",
  "What’s your favorite way I show you love from a distance?",
  "If we could freeze time for one day together, what would we do?",
  "What’s one thing you hope never changes about us?",
  "Describe how you want to feel when we finally see each other again.",
  "What’s a small daily habit you want us to have when we’re together?",
  "What’s something you’re proud of that you want to share with me?",
  "If we could send each other one gift right now, what would it be?",
  "What’s one thing you want our relationship to teach us?",
  "How do you want us to support each other’s dreams?",
  "What’s the most meaningful thing I’ve ever said to you?",
  "What’s one thing you want to do with me before we close the distance?",
  "If we could relive our first date, what would you change?",
  "What’s something you’ve been meaning to ask me?",
  "How do you want us to handle tough times together?",
  "What’s one thing you love about my sense of humor?",
  "If we could have a do-over of any moment in our relationship, which would it be?",
  "What’s something you want us to try together when we meet?",
  "How do you feel about the pace of our relationship?",
  "What’s one thing you want me to know about your love language?",
  "If we could create our own holiday, what would it be called?",
  "What’s something you want us to achieve together in the next 3 years?",
  "How do you want our communication to improve?",
  "What’s one thing you find incredibly attractive about me?",
  "If we could spend a week doing anything, what would it be?",
  "What’s a fear you have about long distance that you’ve overcome?",
  "What’s one thing you want to teach me?",
  "How do you want us to celebrate small wins together?",
  "What’s something you want our future home to have?",
  "If we could send each other a care package right now, what would you include?",
  "What’s one thing you want me to know about how you show love?",
  "How do you want us to spend our first Christmas together?",
  "What’s something you want us to be known for as a couple?",
  "If we could have a superpower as a couple, what would it be?",
  "What’s one thing you want to do more of when we’re together?",
  "How do you want us to stay connected on hard days?",
  "What’s something you want me to know about your past?",
  "If we could write a book about our relationship, what would the title be?",
  "What’s one thing you want us to experience before we get old?",
  "How do you want our intimacy to evolve when we close the distance?",
  "What’s something you want me to know about your dreams?",
  "If we could have any animal as a pet together, what would it be?",
  "What’s one thing you want us to do every year as a tradition?",
  "How do you want us to handle disagreements?",
  "What’s something you want me to know about how you want to be loved?",
  "If we could teleport to any moment in our future, what moment would you choose?",
  "What’s one thing you want us to build together?",
  "How do you want our relationship to make us better people?",
  "What’s something you want me to know about your boundaries?",
  "If we could have a perfect week together, how would we spend it?",
  "What’s one thing you want us to talk about more?",
  "How do you want us to keep the spark alive long-term?",
  "What’s something you want me to know about your future goals?"
];

// Bridge questions now come from content.js (categorized 500 questions)
let bridgeQuestions = allBridgeQuestions;

// Local fallback sets
const QUESTION_SETS = {
  bridge: {
    id: 'bridge',
    title: 'Bridge the Gap',
    questions: allBridgeQuestions
  },
  loveSparks: {
    id: 'loveSparks',
    title: 'Love Sparks',
    questions: promptsPool
  }
};

// ==================== QUESTIONS SEEDING (creates /questions collection) ====================
async function ensureQuestionsSeeded() {
  // Seeding requires being signed in (per current rules)
  const user = currentUser || auth.currentUser;
  if (!user) {
    console.log('[LoveWeave] Skipping questions seed (no auth)');
    return;
  }

  try {
    const bridgeRef = doc(db, 'questions', 'bridge');
    const sparkRef = doc(db, 'questions', 'loveSparks');

    const [bridgeSnap, sparkSnap] = await Promise.all([
      getDoc(bridgeRef),
      getDoc(sparkRef)
    ]);

    if (!bridgeSnap.exists()) {
      await setDoc(bridgeRef, {
        title: 'Bridge the Gap',
        questions: allBridgeQuestions,
        count: allBridgeQuestions.length,
        updatedAt: Date.now()
      });
      console.log('[LoveWeave] ✅ Seeded questions/bridge (500 questions)');
    } else {
      console.log('[LoveWeave] questions/bridge already exists');
    }

    if (!sparkSnap.exists()) {
      await setDoc(sparkRef, {
        title: 'Love Sparks',
        questions: promptsPool,
        count: promptsPool.length,
        updatedAt: Date.now()
      });
      console.log('[LoveWeave] ✅ Seeded questions/loveSparks');
    } else {
      console.log('[LoveWeave] questions/loveSparks already exists');
    }
  } catch (e) {
    console.error('ensureQuestionsSeeded error:', e);
  }
}

// Manual helper (call from console if needed)
window.seedQuestionsToFirestore = ensureQuestionsSeeded;

// ==================== FLOATING HEARTS ====================
function createFloatingHearts() {
  const container = document.getElementById('hearts-bg');
  if (!container) return;
  for (let i = 0; i < 12; i++) {
    const heart = document.createElement('i');
    heart.className = `fa-solid fa-heart heart-float text-xl`;
    heart.style.left = Math.random() * 100 + '%';
    heart.style.top = Math.random() * 70 + '%';
    heart.style.animationDuration = (Math.random() * 10 + 7) + 's';
    container.appendChild(heart);
  }
}

// ==================== FIREBASE HELPERS ====================
function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'LOVE-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function makePairKey(emailA, emailB) {
  const e1 = (emailA || '').toLowerCase().trim();
  const e2 = (emailB || '').toLowerCase().trim();
  if (!e1 || !e2) return null;   // only treat as a pair if BOTH emails are known
  const parts = [e1, e2].sort();
  return parts.join('|');
}

async function findExistingGameForPair(pairKey) {
  if (!pairKey) return null;
  try {
    const q = query(collection(db, 'games'), where('pairKey', '==', pairKey));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  } catch (e) {
    console.error('findExistingGameForPair error:', e);
  }
  return null;
}

// Force a brand new game even if the pair already has one (used by the "New Game" button inside an active game)
async function forceNewGame() {
  const gameId = generateGameId();

  // Build a fresh pairKey that is intentionally different so it never matches previous threads
  const currentPartner = gameState?.members?.find(e => e !== currentUser?.email?.toLowerCase()) || '';
  const members = [];
  if (currentUser?.email) members.push(currentUser.email.toLowerCase());
  if (currentPartner) members.push(currentPartner);

  const uniquePairKey = (makePairKey(currentUser?.email, currentPartner) || 'solo') + '_' + Date.now();

  gameState = {
    id: gameId,
    story: [],
    currentPrompt: promptsPool[Math.floor(Math.random() * promptsPool.length)],
    myAnswer: '',
    partnerAnswer: '',
    notes: [],
    guesses: [],
    correctGuesses: 0,
    totalAnswered: 0,
    loveMeter: 10,
    createdAt: Date.now(),
    bridgeIndex: 0,
    bridgeAnswers: {},
    members: members.length ? members : undefined,
    pairKey: uniquePairKey
  };

  ensureBridgeRole(gameId, true);

  try {
    await setDoc(doc(db, 'games', gameId), gameState);
    listenToGame(gameId);
    showGameScreen(gameId);

    // Send a fresh invite to the same partner for this new independent thread
    if (currentPartner) {
      await setDoc(doc(collection(db, 'invites')), {
        fromUid: currentUser.uid,
        fromEmail: (currentUser.email || '').toLowerCase(),
        toEmail: currentPartner,
        gameId,
        status: 'pending',
        createdAt: Date.now()
      });
      showToast('New thread created — invite sent to ' + currentPartner, 'invite');
    }
  } catch (e) {
    console.error('forceNewGame failed:', e);
    showToast('Unable to create game. Please try again.', 'info');
  }
}

function saveToFirebase() {
  if (!gameState.id) return;
  setDoc(doc(db, 'games', gameState.id), gameState).catch((e) => {
    console.error('saveToFirebase error:', e);
    if (e && e.code === 'permission-denied') {
      const el = document.getElementById('connection-status');
      if (el) el.innerHTML = `<span class="text-red-400 text-xs">No write access (fix rules)</span>`;
    }
  });
}

function listenToGame(gameId) {
  if (currentGameUnsubscribe) {
    currentGameUnsubscribe();
    currentGameUnsubscribe = null;
  }

  document.getElementById('connection-status').innerHTML = `
    <span class="flex items-center gap-x-1.5">
      <span class="w-2 h-2 bg-emerald-400 rounded-full"></span>
      <span class="hidden sm:inline text-emerald-400 text-xs">Synced</span>
    </span>
  `;

  const gameDoc = doc(db, 'games', gameId);
  currentGameUnsubscribe = onSnapshot(gameDoc, (snapshot) => {
    if (snapshot.exists()) {
      gameState = snapshot.data();

      // Legacy flat daily fields are ignored; dailyHistory is authoritative.
      renderAll();
      // Re-check penalties after any live update (e.g. partner just answered)
      applyDailyCompliancePenalty();

      // Toast only on partner-driven changes (self changes already toast locally)
      detectPartnerToasts(prevGameState, gameState);
      prevGameState = JSON.parse(JSON.stringify(gameState || {}));
    }
  }, (err) => {
    console.error('Snapshot error:', err);
    if (err && err.code === 'permission-denied') {
      const el = document.getElementById('connection-status');
      if (el) el.innerHTML = `<span class="text-red-400 text-xs">No access</span>`;
    }
  });
}

// ==================== CONNECTION STATUS ====================
// Using Firestore (no Realtime Database). Simple status.
function setupConnectionStatus() {
  const statusEl = document.getElementById('connection-status');
  statusEl.innerHTML = `
    <span class="flex items-center gap-x-1.5">
      <span class="w-2 h-2 bg-emerald-400 rounded-full"></span>
      <span class="hidden sm:inline text-emerald-400 text-xs">Synced</span>
    </span>
  `;
}

// ==================== GAME FUNCTIONS ====================
async function createNewGame() {
  const gameId = generateGameId();

  // Build members from current user + the email in the "add partner" field (if any)
  const partnerEmail = (document.getElementById('partner-email')?.value || '').trim().toLowerCase();
  const members = [];
  if (currentUser?.email) members.push(currentUser.email.toLowerCase());
  if (partnerEmail) members.push(partnerEmail);

  const pairKey = makePairKey(currentUser?.email, partnerEmail);

  // Only auto-reuse an existing thread if we have a clear pair (both sides known)
  let targetGameId = gameId;

  if (pairKey) {
    const existing = await findExistingGameForPair(pairKey);
    if (existing) {
      listenToGame(existing);
      showGameScreen(existing);
      return;
    }
  }

  gameState = {
    id: gameId,
    story: [],
    currentPrompt: promptsPool[Math.floor(Math.random() * promptsPool.length)],
    myAnswer: '',
    partnerAnswer: '',
    notes: [],
    guesses: [],
    correctGuesses: 0,
    totalAnswered: 0,
    loveMeter: 10,
    createdAt: Date.now(),
    bridgeIndex: 0,
    bridgeAnswers: {},
    members: members.length ? members : undefined,
    pairKey: pairKey || undefined,
    petNames: { a: '', b: '' },
    petNameForPartner: { a: '', b: '' },
    dailyPrompts: [],     // history of {id, prompt, answers: {a:'', b:''}, createdAt}
    currentDailyId: null
  };

  ensureBridgeRole(gameId, true);

  try {
    await setDoc(doc(db, 'games', gameId), gameState);
    listenToGame(gameId);
    showGameScreen(gameId);
  } catch (e) {
    console.error('Create game failed:', e);
    if (e && e.code === 'permission-denied') {
      showToast('Something went wrong. Please try again.', 'info');
    } else {
      showToast('Unable to create game. Please try again.', 'info');
    }
  }
}

function joinGame() {
  const gameId = document.getElementById('join-game-id').value.trim().toUpperCase();
  if (!gameId) { showToast("Please enter a Game ID", 'info'); return; }

  getDoc(doc(db, 'games', gameId))
    .then(snapshot => {
      if (snapshot.exists()) {
        ensureBridgeRole(gameId, false); // joiner is role 'b'
        listenToGame(gameId);
        showGameScreen(gameId);
      } else {
        showToast("Game not found", 'info');
      }
    })
    .catch((e) => {
      console.error(e);
      showToast('Unable to join game. Please try again.', 'info');
    });
}

function showGameScreen(gameId) {
  // Aggressively show ONLY the game screen. Hide everything else.
  const wait = document.getElementById('waiting-screen');
  const landing = document.getElementById('landing-screen');
  const choice = document.getElementById('auth-choice-screen');
  const game = document.getElementById('game-screen');

  if (wait) wait.classList.add('hidden');
  if (landing) landing.classList.add('hidden');
  if (choice) choice.classList.add('hidden');
  if (game) game.classList.remove('hidden');

  // Early hint so any post-auth logic sees a game is active
  if (!gameState || typeof gameState !== 'object') gameState = {};
  gameState.id = gameId;

  document.getElementById('game-id-display').textContent = gameId;
  renderAll();
}

// ==================== RENDER FUNCTIONS ====================
function renderAll() {
  recalculateLoveMeter();
  document.getElementById('love-meter-value').textContent = formatLoveMeter(gameState.loveMeter);

  const streakEl = document.getElementById('love-streak-badge');
  if (streakEl) {
    const s = getDailyStreak();
    streakEl.textContent = s > 0 ? `${s}d` : '';
    streakEl.style.display = s > 0 ? '' : 'none';
  }

  // Pet name inputs on landing have been removed. Pet names are now captured via the invite/accept modal only.

  // Ensure there is always a daily prompt for today
  ensureTodayDailyEntry();

  // Apply daily response penalties if partner answered and I didn't (consecutive = exponential)
  applyDailyCompliancePenalty();

  // Check and award badges (streaks, volume, milestones)
  checkAndAwardBadges();

  renderStory();
  renderPrompt();
  renderNotes();
  renderGuesses();
  renderBridge();
  populatePastDailySelect();
  renderBadges();
}

function renderStory() {
  const container = document.getElementById('story-container');
  container.innerHTML = '';

  if (!gameState.story || gameState.story.length === 0) {
    container.innerHTML = `<p class="text-center text-white/50 py-4">No entries yet. Start writing your story.</p>`;
    return;
  }

  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  gameState.story.forEach(entry => {
    const div = document.createElement('div');
    const isMine = !!(entry.authorRole && entry.authorRole === myRole);
    div.className = `p-4 rounded-2xl border ${isMine ? 'bg-pink-500/10 border-pink-400/30' : 'bg-sky-500/10 border-sky-400/30'}`;
    
    let icon = '';
    if (entry.tone === 'romantic') icon = '❤️';
    else if (entry.tone === 'silly') icon = '😄';
    else if (entry.tone === 'future') icon = '🌟';
    else if (entry.tone === 'spicy') icon = '🔥';

    const time = new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Resolve display name correctly:
    // - If I wrote it: use the name I chose for myself (petNameSelf)
    // - If partner wrote it: use the name THEY chose for themselves (their petNameSelf)
    let display = entry.author || 'You';
    if (entry.authorRole) {
      if (entry.authorRole === myRole) {
        display = entry.petNameSelf || 'You';
      } else {
        display = entry.petNameSelf || 'Partner';   // partner's self-name
      }
    }

    div.innerHTML = `
      <div class="flex justify-between items-center mb-1.5">
        <span class="font-semibold text-sm">${display} ${icon}</span>
        <span class="text-xs text-white/50">${time}</span>
      </div>
      <p class="text-[15px]">${entry.text}</p>
    `;
    container.appendChild(div);
  });
}

function renderPrompt() {
  const promptEl = document.getElementById('current-prompt');

  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  // Always ensure today's entry exists (one prompt per day)
  const entry = ensureTodayDailyEntry();

  // If user selected a past day via the selector, use that instead
  const active = getActiveDailyEntry() || entry;

  promptEl.innerHTML = `"${active.prompt || 'No prompt yet'}"`;

  // My answer for the active day
  const myAns = active.answers ? (active.answers[myRole] || '') : '';
  document.getElementById('my-answer').value = myAns;

  // Partner answer ONLY to partner block
  const partnerEl = document.getElementById('partner-answer-text');
  const partnerLabel = document.getElementById('partner-answer-label');
  const partnerAns = active.answers ? (active.answers[partnerRole] || '') : '';

  // Show the name the partner chose for themselves (what they want to be called)
  const partnerSelfName = (active.petNames && active.petNames[partnerRole]) || getPartnerPetNameForMe() || 'Partner';
  if (partnerLabel) partnerLabel.textContent = partnerSelfName;

  if (partnerAns) {
    partnerEl.textContent = partnerAns;
    partnerEl.classList.remove('italic');
  } else {
    partnerEl.textContent = "Your partner hasn't answered yet...";
    partnerEl.classList.add('italic');
  }
}

function renderNotes() {
  const container = document.getElementById('notes-container');
  container.innerHTML = '';

  if (!gameState.notes || gameState.notes.length === 0) {
    container.innerHTML = `<p class="text-center text-white/50 py-3">No love notes yet.</p>`;
    return;
  }

  const myRole = getBridgeRoleForGame(gameState.id);

  gameState.notes.slice().reverse().forEach(note => {
    const div = document.createElement('div');
    const isMine = !!(note.authorRole && note.authorRole === myRole);
    div.className = `p-4 rounded-2xl border ${isMine ? 'bg-pink-500/10 border-pink-400/30' : 'bg-sky-500/10 border-sky-400/30'}`;
    const time = new Date(note.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Same rule as story: prefer the author's own self-name (petNameSelf)
    let display = note.author || 'You';
    if (note.authorRole) {
      if (note.authorRole === myRole) {
        display = note.petNameSelf || 'You';
      } else {
        display = note.petNameSelf || 'Partner';
      }
    }

    div.innerHTML = `
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium text-pink-300">${display}</span>
        <span class="text-white/40">${time}</span>
      </div>
      <p>${note.text}</p>
    `;
    container.appendChild(div);
  });
}

function renderGuesses() {
  const container = document.getElementById('guesses-container');
  const scoreEl = document.getElementById('guess-score');
  container.innerHTML = '';

  const correct = gameState.correctGuesses || 0;
  const total = gameState.totalAnswered || 0;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  scoreEl.innerHTML = `Score: ${correct}/${total} (${percentage}%)`;

  if (!gameState.guesses || gameState.guesses.length === 0) {
    container.innerHTML = `<p class="text-center text-white/50 py-4">No guesses yet.</p>`;
    return;
  }

  const myRole = getBridgeRoleForGame(gameState.id);

  gameState.guesses.forEach(guess => {
    const div = document.createElement('div');
    const submitRole = guess.submittedByRole || null;
    const isMySubmission = submitRole ? (submitRole === myRole) : (guess.submittedBy === "You");
    // re-compute for coloring (above line already sets isMySubmission)
    const isMine = isMySubmission;

    // Same rule: prefer the submitter's own self-name
    let submittedLabel = isMySubmission ? "You" : "Partner";
    if (isMySubmission) {
      submittedLabel = guess.petNameSelf || getMyPetName() || "You";
    } else {
      submittedLabel = guess.petNameSelf || "Partner";   // partner's self-name
    }

    let statusHTML = '';
    if (guess.status === "pending") {
      if (isMySubmission) {
        statusHTML = `<div class="mt-2 text-xs text-white/60 italic">Awaiting your partner's response...</div>`;
      } else {
        statusHTML = `
          <div class="flex gap-2 mt-3">
            <button onclick="answerGuess(${guess.id}, true)" class="flex-1 py-2 bg-emerald-600/80 active:bg-emerald-600 rounded-2xl text-sm">True</button>
            <button onclick="answerGuess(${guess.id}, false)" class="flex-1 py-2 bg-red-600/80 active:bg-red-600 rounded-2xl text-sm">False</button>
          </div>
        `;
      }
    } else {
      const isCorrect = guess.status === "true";
      const answeredByMe = guess.answeredByRole ? (guess.answeredByRole === myRole) : (guess.answeredBy === "You");

      if (isMySubmission) {
        // I submitted → partner answered
        statusHTML = `<div class="mt-3 text-sm ${isCorrect ? 'text-emerald-400' : 'text-red-400'} font-medium">
          ${isCorrect ? '✓ Your partner confirmed this' : '✗ Your partner said this is not true'}
        </div>`;
      } else {
        // Partner submitted → I answered (or in old data)
        statusHTML = `<div class="mt-3 text-sm ${isCorrect ? 'text-emerald-400' : 'text-red-400'} font-medium">
          ${isCorrect ? '✓ You confirmed this' : '✗ You said this is not true'}
        </div>`;
      }
    }

    div.innerHTML = `
      <p class="text-[15px]">${guess.text}</p>
      <div class="text-xs text-white/50 mt-1">By ${submittedLabel}</div>
      ${statusHTML}
    `;
    container.appendChild(div);
  });
}

// ==================== ACTION FUNCTIONS ====================
function addStoryEntry() {
  const text = document.getElementById('story-input').value.trim();
  if (!text) return;

  if (!gameState.story) gameState.story = [];

  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  // Pet names are no longer captured from landing inputs (removed). They come from invite/accept modals.

  gameState.story.push({
    id: Date.now(),
    author: "You",
    authorRole: myRole,
    petNameSelf: getMyPetName(),
    petNameForPartner: getPetNameIUseForPartner(),
    text: text,
    tone: document.getElementById('story-tone').value,
    timestamp: new Date().toISOString()
  });

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 10) + 5);
  document.getElementById('story-input').value = '';
  saveToFirebase();
  // No self-toast here — only the partner should see a notification ("Partner added to the story")
  renderAll();
}

function submitMyAnswer() {
  const answer = document.getElementById('my-answer').value.trim();
  if (!answer) return;

  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  gameState.myAnswer = answer;
  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 10) + 8);

  // Ensure pet name maps
  if (!gameState.petNames) gameState.petNames = { a: '', b: '' };
  if (!gameState.petNameForPartner) gameState.petNameForPartner = { a: '', b: '' };

  // Always target the active day (today or the one selected in the dropdown)
  const active = getActiveDailyEntry() || ensureTodayDailyEntry();
  if (active) {
    active.answers[myRole] = answer;
    active.petNames = active.petNames || {};
    active.petNames[myRole] = getMyPetName();
    active.petNameForPartner = active.petNameForPartner || {};
    active.petNameForPartner[myRole] = getPetNameIUseForPartner();
  }

  saveToFirebase();
  showToast('Daily answer saved', 'success');
  renderPrompt();
  populatePastDailySelect();
}

function addLoveNote() {
  const text = document.getElementById('note-input').value.trim();
  if (!text) return;

  if (!gameState.notes) gameState.notes = [];

  const myRole = getBridgeRoleForGame(gameState.id);

  // Pet names are captured via modals only (landing inputs removed).

  gameState.notes.push({
    id: Date.now(),
    author: "You",
    authorRole: myRole,
    petNameSelf: getMyPetName(),
    petNameForPartner: getPetNameIUseForPartner(),
    text: text,
    timestamp: new Date().toISOString()
  });

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 10) + 4);
  document.getElementById('note-input').value = '';
  saveToFirebase();
  showToast('Love note sent', 'success');
  renderNotes();
}

function addGuess() {
  const input = document.getElementById('guess-input');
  const text = input.value.trim();
  if (!text) return;

  if (!gameState.guesses) gameState.guesses = [];

  const myRole = getBridgeRoleForGame(gameState.id);
  gameState.guesses.push({
    id: Date.now(),
    text: text,
    submittedByRole: myRole,
    petNameSelf: getMyPetName(),
    petNameForPartner: getPetNameIUseForPartner(),
    status: "pending"
  });

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 10) + 3);
  input.value = '';
  saveToFirebase();
  showToast('Guess submitted', 'success');
  renderGuesses();
}

function answerGuess(guessId, isTrue) {
  const guess = gameState.guesses.find(g => g.id === guessId);
  if (!guess || guess.status !== "pending") return;

  const myRole = getBridgeRoleForGame(gameState.id);
  const submitRole = guess.submittedByRole;

  // Strict rule: only the partner (not the submitter) can mark true/false
  if (submitRole && submitRole === myRole) {
    return; // I submitted this guess — I cannot answer it
  }
  // Legacy fallback: if no role data, treat "You" as the submitter
  if (!submitRole && guess.submittedBy === "You") {
    return;
  }

  guess.status = isTrue ? "true" : "false";
  guess.answeredByRole = myRole;

  gameState.totalAnswered = (gameState.totalAnswered || 0) + 1;
  if (isTrue) {
    gameState.correctGuesses = (gameState.correctGuesses || 0) + 1;
    gameState.loveMeter = Math.min(100, (gameState.loveMeter || 10) + 6);
  } else {
    gameState.loveMeter = Math.min(100, (gameState.loveMeter || 10) + 2);
  }

  saveToFirebase();
  showToast('Guess answered', 'success');
  renderGuesses();
}

function getNewPrompt() {
  // "New" button replaces today's prompt (user explicitly wants a different one today)
  const todayEntry = ensureTodayDailyEntry();
  todayEntry.prompt = promptsPool[Math.floor(Math.random() * promptsPool.length)];
  gameState.currentPrompt = todayEntry.prompt;
  gameState.myAnswer = '';
  gameState.partnerAnswer = '';
  saveToFirebase();
  renderPrompt();
  populatePastDailySelect();
}

// ==================== BRIDGE THE GAP ====================
function getBridgeRoleForGame(gid) {
  if (!gid) return 'a';
  const key = `bridgeRole_${gid}`;
  return localStorage.getItem(key) || 'a';
}

function getMyPetName() {
  const role = getBridgeRoleForGame(gameState.id);
  return (gameState.petNames && gameState.petNames[role]) || '';
}

function getPetNameIUseForPartner() {
  const role = getBridgeRoleForGame(gameState.id);
  return (gameState.petNameForPartner && gameState.petNameForPartner[role]) || '';
}

function getPartnerPetNameForMe() {
  const role = getBridgeRoleForGame(gameState.id);
  const partnerRole = role === 'a' ? 'b' : 'a';
  return (gameState.petNames && gameState.petNames[partnerRole]) || '';
}

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateMinusDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function applyDailyCompliancePenalty() {
  if (!gameState.dailyHistory) gameState.dailyHistory = [];
  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  const today = getTodayStr();

  // Consider the last 7 days (including today)
  let consecutiveMisses = 0;
  for (let i = 1; i <= 7; i++) {
    const d = dateMinusDays(today, i);
    const e = gameState.dailyHistory.find(x => x.date === d);
    const partnerAnswered = e && e.answers && e.answers[partnerRole];
    const iAnswered = e && e.answers && e.answers[myRole];
    if (partnerAnswered && !iAnswered) {
      consecutiveMisses++;
    } else {
      break; // streak broken
    }
  }

  if (consecutiveMisses > 0) {
    // exponential: 2, 4, 8, ...
    const penalty = 2 * Math.pow(2, consecutiveMisses - 1);
    const before = gameState.loveMeter || 10;
    gameState.loveMeter = Math.max(0, before - penalty);
    if (gameState.loveMeter !== before && gameState.id) {
      setDoc(doc(db, 'games', gameState.id), gameState, { merge: true }).catch(() => {});
    }
  }
}

function getDailyStreak() {
  if (!gameState.dailyHistory) return 0;
  const myRole = getBridgeRoleForGame(gameState.id);
  let streak = 0;
  let d = getTodayStr();
  for (let i = 0; i < 30; i++) {
    const entry = gameState.dailyHistory.find(e => e.date === d);
    if (entry && entry.answers && entry.answers[myRole]) {
      streak++;
      d = dateMinusDays(d, 1);
    } else {
      break;
    }
  }
  return streak;
}

function recalculateLoveMeter() {
  const streak = getDailyStreak();

  // Base from streak: exactly 10 consecutive days to unlock the final push to 100
  let fromStreak = Math.min(81, streak * 8.1);

  // Volume contributions (stories, bridge answers, notes, guesses)
  const storyCount = (gameState.story || []).length;
  const bridgeCount = countBridgeAnswered();
  const noteCount = (gameState.notes || []).length;
  const guessCount = (gameState.guesses || []).length;

  let volume = 0;
  volume += Math.min(6, storyCount * 0.5);
  volume += Math.min(7, bridgeCount * 0.1);
  volume += Math.min(3, noteCount * 0.2);
  volume += Math.min(3, guessCount * 0.15);

  // Milestones (small one-time style bumps via counts)
  if (storyCount >= 10) volume += 1;
  if (bridgeCount >= 50) volume += 2;
  if (noteCount >= 20) volume += 1;

  let meter = 10 + fromStreak + volume;

  // Hard cap rule: cannot hit 100 until 10 consecutive days
  if (streak < 10) {
    meter = Math.min(99.99, meter);
  } else {
    meter = Math.min(100, meter);
  }

  meter = Math.max(10, meter);
  gameState.loveMeter = meter;
}

function checkAndAwardBadges() {
  if (!gameState.badges) gameState.badges = [];

  const streak = getDailyStreak();
  const storyCount = (gameState.story || []).length;
  const bridgeCount = countBridgeAnswered();
  const noteCount = (gameState.notes || []).length;
  const meter = gameState.loveMeter || 10;

  const newlyEarned = [];

  BADGES.forEach(badge => {
    let qualifies = false;

    if (badge.minStreak && streak >= badge.minStreak) qualifies = true;
    if (badge.stories && storyCount >= badge.stories) qualifies = true;
    if (badge.bridge && bridgeCount >= badge.bridge) qualifies = true;
    if (badge.notes && noteCount >= badge.notes) qualifies = true;
    if (badge.meter && meter >= badge.meter) qualifies = true;

    if (qualifies && !gameState.badges.includes(badge.id)) {
      gameState.badges.push(badge.id);
      newlyEarned.push(badge);
    }
  });

  if (newlyEarned.length > 0) {
    saveToFirebase();
    newlyEarned.forEach(badge => {
      showBadgeUnlock(badge);
    });
  }
}

function renderBadges() {
  const container = document.getElementById('badges-display');
  if (!container) return;

  container.innerHTML = '';

  const earned = (gameState.badges || []).map(id => BADGES.find(b => b.id === id)).filter(Boolean);

  if (earned.length === 0) {
    const span = document.createElement('span');
    span.className = 'text-[9px] px-1 py-0.5 rounded bg-white/5 text-white/40';
    span.textContent = 'No badges';
    container.appendChild(span);
    return;
  }

  earned.forEach(b => {
    const el = document.createElement('span');
    el.className = 'inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/10 hover:bg-white/15 rounded text-[10px] cursor-default';
    el.title = b.desc;
    const iconHTML = b.img
      ? `<img src="${b.img}" class="w-3 h-3 rounded" onerror="this.outerHTML='${b.icon}'" alt="" />`
      : b.icon;
    el.innerHTML = `${iconHTML} <span class="hidden md:inline">${b.name}</span>`;
    container.appendChild(el);
  });
}

function countBridgeAnswered() {
  if (!gameState.bridgeAnswers) return 0;
  const a = gameState.bridgeAnswers.a || {};
  const b = gameState.bridgeAnswers.b || {};
  return new Set([...Object.keys(a), ...Object.keys(b)]).size;
}

function detectPartnerToasts(prev, curr) {
  if (!curr || !curr.id) return;
  if (!prev || !prev.id || prev.id !== curr.id) return;

  const myRole = getBridgeRoleForGame(curr.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  // Story by partner
  const pStory = (prev.story || []).length;
  const cStory = (curr.story || []).length;
  if (cStory > pStory) {
    const last = curr.story[cStory - 1];
    if (last && last.authorRole && last.authorRole !== myRole) {
      showToast('Partner added to the story', 'info');
    }
  }

  // Note by partner
  const pNotes = (prev.notes || []).length;
  const cNotes = (curr.notes || []).length;
  if (cNotes > pNotes) {
    const last = curr.notes[cNotes - 1];
    if (last && last.authorRole && last.authorRole !== myRole) {
      showToast('Partner sent a love note', 'info');
    }
  }

  // Guess submitted by partner
  const pGuesses = (prev.guesses || []).length;
  const cGuesses = (curr.guesses || []).length;
  if (cGuesses > pGuesses) {
    const last = curr.guesses[cGuesses - 1];
    if (last && last.submittedByRole && last.submittedByRole !== myRole) {
      showToast('Partner made a new guess', 'info');
    }
  }

  // Daily spark answered by partner (any day in history)
  const pDaily = prev.dailyHistory || [];
  const cDaily = curr.dailyHistory || [];
  cDaily.forEach(e => {
    const old = pDaily.find(x => x.date === e.date);
    const hadPartner = old && old.answers && old.answers[partnerRole];
    const nowPartner = e.answers && e.answers[partnerRole];
    if (!hadPartner && nowPartner) {
      showToast('Partner answered a daily spark', 'info');
    }
  });

  // Bridge answers by partner (new or updated)
  const pBridge = (prev.bridgeAnswers && prev.bridgeAnswers[partnerRole]) || {};
  const cBridge = (curr.bridgeAnswers && curr.bridgeAnswers[partnerRole]) || {};
  let bridgeChanged = false;
  Object.keys(cBridge).forEach(k => {
    if (cBridge[k] && cBridge[k] !== pBridge[k]) bridgeChanged = true;
  });
  if (bridgeChanged || Object.keys(cBridge).length > Object.keys(pBridge).length) {
    showToast('Partner updated a Bridge answer', 'info');
  }
}

let currentSelectedDailyDate = null;

function ensureTodayDailyEntry() {
  if (!gameState.dailyHistory) gameState.dailyHistory = [];
  const today = getTodayStr();
  let entry = gameState.dailyHistory.find(e => e.date === today);
  if (!entry) {
    entry = {
      date: today,
      prompt: promptsPool[Math.floor(Math.random() * promptsPool.length)],
      answers: { a: '', b: '' },
      petNames: { a: '', b: '' },
      petNameForPartner: { a: '', b: '' },
      createdAt: Date.now()
    };
    gameState.dailyHistory.push(entry);
  }
  gameState.currentPrompt = entry.prompt;
  gameState.currentDailyDate = today;
  return entry;
}

function getActiveDailyEntry() {
  if (!gameState.dailyHistory) gameState.dailyHistory = [];
  const targetDate = currentSelectedDailyDate || getTodayStr();
  let entry = gameState.dailyHistory.find(e => e.date === targetDate);
  if (!entry && targetDate === getTodayStr()) {
    entry = ensureTodayDailyEntry();
  }
  return entry;
}

// dailyHistory is the single source for per-day prompts now.
// dailyPrompts left for backward data if any, but we prioritize dailyHistory.

function populatePastDailySelect() {
  const sel = document.getElementById('past-daily-select');
  if (!sel) return;

  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  sel.innerHTML = '<option value="">Choose from past days</option>';

  if (!gameState.dailyHistory || gameState.dailyHistory.length === 0) return;

  // Only days where partner has answered
  const answered = gameState.dailyHistory.filter(e => e.answers && e.answers[partnerRole]);

  answered.slice().reverse().forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.date;
    const short = (e.prompt || '').slice(0, 55) + ((e.prompt || '').length > 55 ? '…' : '');
    opt.textContent = `${e.date} — ${short}`;
    if (currentSelectedDailyDate === e.date) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.onchange = () => {
    const date = sel.value;
    if (!date) {
      currentSelectedDailyDate = null;
    } else {
      currentSelectedDailyDate = date;
    }
    // render will pick the right day via getActiveDailyEntry
    renderPrompt();
  };
}

function ensureBridgeRole(gid, isCreator) {
  if (!gid) return;
  const key = `bridgeRole_${gid}`;
  let role = localStorage.getItem(key);
  if (!role) {
    role = isCreator ? 'a' : 'b';
    localStorage.setItem(key, role);
  }
  myBridgeRole = role;
}

function changeBridgeIndex(delta) {
  if (!gameState.id) return;

  const active = getActiveBridgeList();
  const offset = active.offset;
  const len = active.list.length;

  let idx = (gameState.bridgeIndex || 0) + delta;

  // Clamp inside active category range
  idx = Math.max(offset, Math.min(offset + len - 1, idx));

  if (idx !== (gameState.bridgeIndex || 0)) {
    gameState.bridgeIndex = idx;
    saveToFirebase();
    renderBridge();
  }
}

function saveBridgeAnswer() {
  const ta = document.getElementById('bridge-my-answer');
  if (!ta || !gameState.id) return;
  const text = ta.value.trim();
  if (!text) return;

  const idx = gameState.bridgeIndex || 0;
  if (!gameState.bridgeAnswers) gameState.bridgeAnswers = { a: {}, b: {} };
  const role = getBridgeRoleForGame(gameState.id);
  if (!gameState.bridgeAnswers[role]) gameState.bridgeAnswers[role] = {};

  const wasUpdate = !!gameState.bridgeAnswers[role][idx];

  gameState.bridgeAnswers[role][idx] = text;

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 2);
  saveToFirebase();

  // Clear the input field after submission — answers should not remain in the input
  ta.value = '';

  renderBridge();

  // Local confirmation
  showToast(wasUpdate ? 'Bridge answer updated' : 'Bridge answer saved', 'success');
}

function randomBridge() {
  if (!gameState.id) return;

  const unanswered = getUnansweredIndices();

  let idx;
  if (unanswered.length > 0) {
    // Pick random from unanswered
    idx = unanswered[Math.floor(Math.random() * unanswered.length)];
  } else {
    // All answered in current category — pick any from the active list
    const active = getActiveBridgeList();
    const offset = active.offset;
    const len = active.list.length;
    idx = offset + Math.floor(Math.random() * len);
  }

  gameState.bridgeIndex = idx;
  saveToFirebase();
  renderBridge();
}

function resetBridge() {
  if (!gameState.id || !confirm('Reset Bridge the Gap answers and progress for everyone?')) return;
  gameState.bridgeIndex = 0;
  gameState.bridgeAnswers = { a: {}, b: {} };
  saveToFirebase();
  renderBridge();
}

function getActiveBridgeList() {
  if (currentBridgeCategory === 'all') return { list: allBridgeQuestions, offset: 0 };
  const catIdx = parseInt(currentBridgeCategory);
  if (!bridgeCategories[catIdx]) return { list: allBridgeQuestions, offset: 0 };
  let offset = 0;
  for (let i = 0; i < catIdx; i++) offset += bridgeCategories[i].questions.length;
  return { list: bridgeCategories[catIdx].questions, offset };
}

function getUnansweredIndices() {
  const active = getActiveBridgeList();
  const list = active.list;
  const offset = active.offset;
  const answers = gameState.bridgeAnswers || { a: {}, b: {} };
  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';
  const unanswered = [];
  for (let i = 0; i < list.length; i++) {
    const globalIdx = offset + i;
    const myAns = answers[myRole] && answers[myRole][globalIdx];
    const partnerAns = answers[partnerRole] && answers[partnerRole][globalIdx];
    if (!myAns && !partnerAns) unanswered.push(globalIdx);
  }
  return unanswered;
}

function getRandomUnansweredIndex() {
  const unanswered = getUnansweredIndices();
  if (unanswered.length === 0) return null;
  const rand = unanswered[Math.floor(Math.random() * unanswered.length)];
  return rand;
}

function renderBridge() {
  const qEl = document.getElementById('bridge-question');
  const progEl = document.getElementById('bridge-progress');
  const compEl = document.getElementById('bridge-completed');
  const myTa = document.getElementById('bridge-my-answer');
  const paEl = document.getElementById('bridge-partner-answer');
  const totalEl = document.getElementById('bridge-total');
  if (!qEl || !gameState.id) return;

  const active = getActiveBridgeList();
  const activeList = active.list;
  const offset = active.offset;

  if (totalEl) totalEl.textContent = activeList.length;

  let idx = gameState.bridgeIndex || 0;
  // clamp to full list
  if (idx < 0 || idx >= allBridgeQuestions.length) idx = 0;

  // if current idx is not in the active category range, snap to first of active
  const inRange = idx >= offset && idx < offset + activeList.length;
  if (!inRange) {
    idx = offset;
    gameState.bridgeIndex = idx;
  }

  const localIdx = idx - offset;
  qEl.textContent = activeList[localIdx] || allBridgeQuestions[idx];

  if (progEl) progEl.textContent = `Q ${localIdx + 1} / ${activeList.length}`;

  const answers = gameState.bridgeAnswers || { a: {}, b: {} };
  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  const myAns = (answers[myRole] && answers[myRole][idx]) || '';
  if (myTa) myTa.value = myAns;

  const partnerAns = (answers[partnerRole] && answers[partnerRole][idx]) || "Waiting for partner...";
  if (paEl) {
    paEl.textContent = partnerAns;
    paEl.classList.toggle('italic', !answers[partnerRole] || !answers[partnerRole][idx]);
  }

  // completed count (any side answered in current active list)
  let completed = 0;
  const aAns = answers.a || {};
  const bAns = answers.b || {};
  for (let i = offset; i < offset + activeList.length; i++) {
    if (aAns[i] || bAns[i]) completed++;
  }
  if (compEl) compEl.textContent = `${completed} answered`;
}

// ==================== TAB SWITCHING ====================
function switchTab(tab) {
  document.querySelectorAll('[id^="tab-content-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-content-' + tab).classList.remove('hidden');

  document.querySelectorAll('[id^="tab-"]').forEach((el, i) => {
    if (i == tab) {
      el.classList.add('border-b-[3px]', 'border-pink-400');
      el.classList.remove('text-white/70');
    } else {
      el.classList.remove('border-b-[3px]', 'border-pink-400');
      el.classList.add('text-white/70');
    }
  });

  if (tab === 4) renderBridge();
}

// ==================== HELP MODAL ====================
function showHelp() {
  const modal = document.getElementById('help-modal');
  if (modal) modal.classList.remove('hidden');
}

function hideHelp() {
  const modal = document.getElementById('help-modal');
  if (modal) modal.classList.add('hidden');
}

// Pet name prompt shown when clicking Invite (for sender) or Accept (for receiver)
function askForPetName(title = 'Set your pet name', desc = 'This is the name your partner will see for you.') {
  return new Promise((resolve) => {
    const modal = document.getElementById('petname-modal');
    const titleEl = document.getElementById('petname-modal-title');
    const descEl = document.getElementById('petname-modal-desc');
    const input = document.getElementById('petname-modal-input');
    const skipBtn = document.getElementById('petname-modal-skip');
    const saveBtn = document.getElementById('petname-modal-save');

    if (!modal || !input || !skipBtn || !saveBtn) {
      // Modal not present — fall back to empty name (non-blocking)
      resolve('');
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    input.value = '';

    modal.classList.remove('hidden');
    setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 30);

    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      modal.classList.add('hidden');
      cleanup();
      resolve(val);
    };

    const onSkip = () => finish('');
    const onSave = () => {
      const v = (input.value || '').trim();
      finish(v);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSave(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(null); } // full cancel
    };

    const cleanup = () => {
      skipBtn.removeEventListener('click', onSkip);
      saveBtn.removeEventListener('click', onSave);
      input.removeEventListener('keydown', onKey);
      modal.onclick = null;
    };

    skipBtn.addEventListener('click', onSkip, { once: true });
    saveBtn.addEventListener('click', onSave, { once: true });
    input.addEventListener('keydown', onKey);

    // Click outside to cancel
    modal.onclick = (e) => {
      if (e.target === modal) finish(null);
    };
  });
}

function showAuthChoiceScreen() {
  // Use the centralized refresher so we never leave the UI blank
  showPostAuthScreen();

  // Also ensure we clean up listeners and state when forcing to auth choice
  if (currentGameUnsubscribe) {
    currentGameUnsubscribe();
    currentGameUnsubscribe = null;
  }
  // Only clear gameState if we're not keeping an active game
  if (!gameState || !gameState.id) {
    gameState = {};
  }
}

// ==================== TOAST SYSTEM ====================
function showToast(message, type = 'info', duration = 1500) {
  const container = document.getElementById('toast-container');
  const backdrop = document.getElementById('toast-backdrop');
  if (!container) return;

  // Show backdrop blur when first toast appears
  if (backdrop) {
    if (activeToasts === 0) backdrop.classList.remove('hidden');
    activeToasts++;
  }

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center gap-x-3 px-4 py-3 rounded-2xl border text-sm shadow-2xl max-w-[320px] bg-[#1f1a27] border-white/10`;

  let iconHTML = `<img src="/logo.png" class="w-6 h-6 rounded-lg object-cover ring-1 ring-white/20" alt="" />`;

  if (type === 'success') {
    toast.classList.add('!border-emerald-400/30');
    iconHTML = `<div class="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center"><i class="fa-solid fa-check text-emerald-400 text-xs"></i></div>`;
  } else if (type === 'milestone') {
    toast.classList.add('!border-pink-400/30');
    iconHTML = `<img src="/logo.png" class="w-6 h-6 rounded-lg object-cover ring-1 ring-pink-400/30" alt="" />`;
  } else if (type === 'invite') {
    toast.classList.add('!border-sky-400/30');
    iconHTML = `<img src="/logo.png" class="w-6 h-6 rounded-lg object-cover ring-1 ring-sky-400/30" alt="" />`;
  }

  toast.innerHTML = `
    <div class="flex items-center gap-x-3">
      ${iconHTML}
      <div class="text-white/90">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  const cleanup = () => {
    toast.remove();
    if (backdrop) {
      activeToasts = Math.max(0, activeToasts - 1);
      if (activeToasts === 0) backdrop.classList.add('hidden');
    }
  };

  // Auto dismiss
  setTimeout(() => {
    toast.style.transition = 'all 0.2s ease';
    toast.style.opacity = '0';
    setTimeout(cleanup, 150);
  }, duration);

  // Click to dismiss
  toast.onclick = cleanup;
}

// Confirmation toast with action buttons (used for End Game verification)
function showConfirmToast(message, onConfirm, onCancel) {
  const container = document.getElementById('toast-container');
  const backdrop = document.getElementById('toast-backdrop');
  if (!container) return;

  if (backdrop) {
    if (activeToasts === 0) backdrop.classList.remove('hidden');
    activeToasts++;
  }

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto px-4 py-3 rounded-2xl border text-sm shadow-2xl max-w-[320px] bg-[#1f1a27] border-white/10`;

  toast.innerHTML = `
    <div class="text-white/90 mb-2">${message}</div>
    <div class="flex gap-2">
      <button class="flex-1 py-1.5 bg-red-600/80 active:bg-red-600 rounded-xl text-xs">End Game</button>
      <button class="flex-1 py-1.5 bg-white/10 active:bg-white/20 rounded-xl text-xs">Cancel</button>
    </div>
  `;

  container.appendChild(toast);

  const cleanup = () => {
    toast.remove();
    if (backdrop) {
      activeToasts = Math.max(0, activeToasts - 1);
      if (activeToasts === 0) backdrop.classList.add('hidden');
    }
  };

  const [confirmBtn, cancelBtn] = toast.querySelectorAll('button');

  confirmBtn.onclick = () => {
    cleanup();
    if (onConfirm) onConfirm();
  };
  cancelBtn.onclick = () => {
    cleanup();
    if (onCancel) onCancel();
  };
}

// Dedicated badge unlock toast that prominently shows the actual badge image
function showBadgeUnlock(badge) {
  const container = document.getElementById('toast-container');
  const backdrop = document.getElementById('toast-backdrop');
  if (!container) return;

  if (backdrop) {
    if (activeToasts === 0) backdrop.classList.remove('hidden');
    activeToasts++;
  }

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-start gap-x-3 px-4 py-3.5 rounded-2xl border text-sm shadow-2xl max-w-[340px] bg-[#1f1a27] border-pink-400/40`;

  const imgHTML = badge.img
    ? `<img src="${badge.img}" class="w-14 h-14 rounded-2xl object-cover ring-1 ring-white/20 flex-shrink-0" onerror="this.outerHTML='<div class=\\'w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-2xl\\'>${badge.icon}</div>'" alt="" />`
    : `<div class="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-2xl flex-shrink-0">${badge.icon}</div>`;

  toast.innerHTML = `
    <div class="flex items-start gap-x-3">
      ${imgHTML}
      <div class="min-w-0 pt-0.5">
        <div class="text-pink-300 font-semibold text-xs tracking-wide">BADGE UNLOCKED</div>
        <div class="text-white font-semibold">${badge.name}</div>
        <div class="text-white/75 text-xs mt-0.5">${badge.desc}</div>
      </div>
    </div>
  `;

  container.appendChild(toast);

  const cleanup = () => {
    toast.remove();
    if (backdrop) {
      activeToasts = Math.max(0, activeToasts - 1);
      if (activeToasts === 0) backdrop.classList.add('hidden');
    }
  };

  setTimeout(() => {
    toast.style.transition = 'all 0.25s ease';
    toast.style.opacity = '0';
    setTimeout(cleanup, 180);
  }, 1500);

  toast.onclick = cleanup;
}

// Request notification permission (non-blocking). Toasts are ALWAYS the in-app centered UI, never browser/system alerts.
function requestNotificationPermissionOnce() {
  if (notificationPermissionAsked) return;
  notificationPermissionAsked = true;
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (_) {}
}

// ==================== AUTH (Gmail only) ====================
async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
    // Ask once for notification permission (used for real notifications if desired later; toasts remain in-app)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (e) {
    console.error(e);
    showToast('Sign in failed. Please try again.', 'info');
  }
}

function handleAuthChange(user) {
  currentUser = user;
  // Ask for notification permission (non-blocking). Toasts are always the in-app centered UI.
  requestNotificationPermissionOnce();

  const authArea = document.getElementById('auth-area');
  const userInfo = document.getElementById('user-info');
  const partnerTools = document.getElementById('partner-tools');
  const emailEl = document.getElementById('user-email');

  const choice = document.getElementById('auth-choice-screen');
  const landing = document.getElementById('landing-screen');

  // Compact navbar user UI
  const navbarUser = document.getElementById('navbar-user');
  const navbarUserName = document.getElementById('navbar-user-name');
  const navbarSignout = document.getElementById('navbar-signout-btn');

  if (user) {
    if (emailEl) emailEl.textContent = user.email || '';

    // Hide big sign-in area on landing
    if (userInfo) userInfo.classList.remove('hidden');
    if (partnerTools) partnerTools.classList.remove('hidden');
    if (authArea) authArea.classList.add('hidden');

    // Navbar compact user
    if (navbarUser) navbarUser.classList.remove('hidden');
    if (navbarUserName) navbarUserName.textContent = user.displayName || user.email || 'You';

    if (navbarSignout) {
      navbarSignout.onclick = async () => {
        try { await signOut(auth); } catch (_) {}
        showAuthChoiceScreen();
      };
    }

    // Hide "Create New Game" when signed in with Gmail (email invites already available)
    const createBtn = document.getElementById('create-game-btn');
    if (createBtn) createBtn.classList.add('hidden');

    // ensureUserDoc skipped to avoid permission-denied noise on /users (non-critical).
    // If you need user profiles, deploy updated rules and re-enable.
    listenForMyInvites(user);
    listenForMyAcceptedThreads(user);
    ensureQuestionsSeeded();

    // Ask for notification permission (once) after sign-in; toasts remain the centered in-app UI
    requestNotificationPermissionOnce();

    // switch from choice to main landing
    if (choice) choice.classList.add('hidden');
    if (landing) landing.classList.remove('hidden');
  } else {
    if (userInfo) userInfo.classList.add('hidden');
    if (partnerTools) partnerTools.classList.add('hidden');
    if (authArea) authArea.classList.remove('hidden');

    if (navbarUser) navbarUser.classList.add('hidden');
    if (navbarSignout) navbarSignout.onclick = null;

    // Show "Create New Game" for anonymous users
    const createBtn = document.getElementById('create-game-btn');
    if (createBtn) createBtn.classList.remove('hidden');

    if (invitesUnsubscribe) {
      invitesUnsubscribe();
      invitesUnsubscribe = null;
    }
    if (myThreadsUnsubscribe) {
      myThreadsUnsubscribe();
      myThreadsUnsubscribe = null;
    }
  }
}

// Expose for manual debug if needed
window.loadMyThreads = () => {
  if (currentUser) listenForMyAcceptedThreads(currentUser);
};

function listenForMyAcceptedThreads(user) {
  if (myThreadsUnsubscribe) {
    myThreadsUnsubscribe();
    myThreadsUnsubscribe = null;
  }

  const listEl = document.getElementById('connections-list');
  const section = document.getElementById('connections-section');
  if (!listEl || !section || !user?.email) return;

  const email = user.email.toLowerCase();

  // Listen to invites sent to me that are accepted
  const q1 = query(
    collection(db, 'invites'),
    where('toEmail', '==', email),
    where('status', '==', 'accepted')
  );

  // Listen to invites I sent (from me)
  const q2 = query(
    collection(db, 'invites'),
    where('fromEmail', '==', email)
  );

  const threadsMap = new Map(); // gameId -> {gameId, partner, createdAt}

  const updateList = () => {
    listEl.innerHTML = '';

    const items = Array.from(threadsMap.values());
    if (items.length === 0) {
      section.classList.add('hidden');
      lastAcceptedThread = null;
      updateContinueLastBtn();
      return;
    }

    section.classList.remove('hidden');

    // Sort newest first
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Set the most recent as quick-continue target
    lastAcceptedThread = { gameId: items[0].gameId, partner: items[0].partner || 'Partner' };
    updateContinueLastBtn();

    items.forEach(t => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-white/5 px-2 py-1 rounded-xl text-xs gap-2';

      row.innerHTML = `
        <div class="truncate pr-2 font-mono">${t.partner || 'Partner'}</div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button class="px-2 py-0.5 bg-white/10 active:bg-white/20 rounded-lg">Continue</button>
          <button class="px-1 py-0.5 text-white/50 hover:text-red-400" title="Remove"><i class="fa-solid fa-trash text-[10px]"></i></button>
        </div>
      `;

      // Continue button
      row.querySelector('button').onclick = () => {
        listenToGame(t.gameId);
        showGameScreen(t.gameId);
      };

      // Delete button
      const delBtn = row.querySelector('button[title="Remove"]');
      if (delBtn) {
        delBtn.onclick = async (e) => {
          e.stopImmediatePropagation();
          if (!confirm('Remove this thread from your list? (This won\'t affect your partner)')) return;
          await removeThread(t.gameId, email);
        };
      }

      listEl.appendChild(row);
    });

    // Apply current collapse state after (re)render
    applyThreadsCollapse();
  };

  // Merge results from both queries (skip removedFor)
  const unsub1 = onSnapshot(q1, (snap) => {
    snap.forEach(d => {
      const inv = d.data();
      const removed = Array.isArray(inv.removedFor) ? inv.removedFor : [];
      if (inv.gameId && !removed.includes(email)) {
        threadsMap.set(inv.gameId, {
          gameId: inv.gameId,
          partner: inv.fromEmail || 'Partner',
          createdAt: inv.createdAt || 0
        });
      }
    });
    updateList();
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    snap.forEach(d => {
      const inv = d.data();
      const removed = Array.isArray(inv.removedFor) ? inv.removedFor : [];
      if (inv.gameId && !removed.includes(email)) {
        threadsMap.set(inv.gameId, {
          gameId: inv.gameId,
          partner: inv.toEmail || 'Partner',
          createdAt: inv.createdAt || 0
        });
      }
    });
    updateList();
  });

  // Combined unsubscribe
  myThreadsUnsubscribe = () => {
    unsub1();
    unsub2();
  };

  // Make map available for fast delete UX
  window.__threadsMap = threadsMap;

  // Setup collapsible once the elements exist
  setupThreadsCollapsible();
}

async function removeThread(gameId, email) {
  if (!gameId || !email) return;

  try {
    const invitesRef = collection(db, 'invites');
    const q = query(invitesRef, where('gameId', '==', gameId));
    const snap = await getDocs(q);

    const updates = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.fromEmail === email || data.toEmail === email) {
        const removed = Array.isArray(data.removedFor) ? [...data.removedFor] : [];
        if (!removed.includes(email)) {
          removed.push(email);
          updates.push(setDoc(doc(db, 'invites', d.id), { removedFor: removed }, { merge: true }));
        }
      }
    });

    await Promise.all(updates);
  } catch (e) {
    console.error('removeThread error:', e);
  }

  // Remove locally regardless
  // Note: threadsMap is local to the listener scope; we rely on snapshot re-firing or manual removal
  // To be safe we clear and let snapshots repopulate, but for instant UI:
  if (window.__threadsMap) {
    window.__threadsMap.delete(gameId);
  }

  if (lastAcceptedThread && lastAcceptedThread.gameId === gameId) {
    lastAcceptedThread = null;
    updateContinueLastBtn();
  }

  // Re-render by forcing update if possible
  const listEl = document.getElementById('connections-list');
  if (listEl) {
    // Remove the row immediately for snappy feel
    const rows = listEl.children;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].textContent.includes(gameId) || rows[i].innerText.includes('Partner')) {
        // best effort; snapshots will correct
      }
    }
  }

  // The snapshots will eventually remove it when they refire with updated removedFor.
  // For instant, we can just hide the row we clicked, but simplest is to let next snapshot handle.
  // To force immediate, we can re-run the listener logic by clearing map entries client-side.
  // Since threadsMap is scoped, we do a tiny trick: store reference.
}

// Helper to expose threadsMap for instant delete UX (optional, safe)
window.__threadsMap = null;

function setupThreadsCollapsible() {
  const header = document.getElementById('threads-header');
  const list = document.getElementById('connections-list');
  const chevron = document.getElementById('threads-chevron');
  if (!header || !list || !chevron) return;

  // Restore state
  const saved = localStorage.getItem('threadsCollapsed');
  threadsCollapsed = saved === 'true';

  const apply = () => {
    if (threadsCollapsed) {
      list.classList.add('hidden');
      chevron.classList.remove('fa-chevron-down');
      chevron.classList.add('fa-chevron-right');
    } else {
      list.classList.remove('hidden');
      chevron.classList.remove('fa-chevron-right');
      chevron.classList.add('fa-chevron-down');
    }
  };

  apply();

  // Toggle
  header.onclick = () => {
    threadsCollapsed = !threadsCollapsed;
    localStorage.setItem('threadsCollapsed', String(threadsCollapsed));
    apply();
  };
}

function applyThreadsCollapse() {
  const list = document.getElementById('connections-list');
  const chevron = document.getElementById('threads-chevron');
  if (!list || !chevron) return;

  if (threadsCollapsed) {
    list.classList.add('hidden');
    chevron.classList.remove('fa-chevron-down');
    chevron.classList.add('fa-chevron-right');
  } else {
    list.classList.remove('hidden');
    chevron.classList.remove('fa-chevron-right');
    chevron.classList.add('fa-chevron-down');
  }
}

async function ensureUserDoc(user) {
  if (!user || !user.uid) return;
  const uref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(uref);
    if (!snap.exists()) {
      await setDoc(uref, {
        uid: user.uid,
        email: user.email || '',
        createdAt: Date.now()
      });
    }
  } catch (err) {
    // Silently ignore permission-denied (common before rules are deployed or in transient auth state).
    // User doc is optional metadata; app continues without it.
    if (err && err.code !== 'permission-denied') {
      console.warn('ensureUserDoc non-fatal:', err?.message || err);
    }
  }
}

async function invitePartnerByEmail() {
  if (!currentUser) { showToast('Please sign in first to invite by email.', 'info'); return; }
  const input = document.getElementById('partner-email');
  if (!input) return;
  const email = (input.value || '').trim().toLowerCase();
  if (!email) { showToast('Enter a Gmail address.', 'info'); return; }

  // Ask for the inviter's pet name (what they want to be called) before sending.
  const mySelfPet = await askForPetName('Set your pet name', 'This is the name your partner will see for you.');
  if (mySelfPet === null) {
    // User cancelled the whole invite
    return;
  }

  // Check if we already have an active thread with this exact person
  const pairKey = makePairKey(currentUser.email, email);
  if (pairKey) {
    const existingGameId = await findExistingGameForPair(pairKey);
    if (existingGameId) {
      // Reuse existing game: send a fresh invite pointing to it (game already exists)
      await setDoc(doc(collection(db, 'invites')), {
        fromUid: currentUser.uid,
        fromEmail: (currentUser.email || '').toLowerCase(),
        toEmail: email,
        gameId: existingGameId,
        fromSelfPetName: mySelfPet,
        status: 'pending',
        createdAt: Date.now()
      });
      showToast('Existing thread found — opening and notifying partner', 'invite');
      listenToGame(existingGameId);
      showGameScreen(existingGameId);
      input.value = '';
      return;
    }
  }

  // Brand new connection: create invite WITHOUT creating the game yet.
  await setDoc(doc(collection(db, 'invites')), {
    fromUid: currentUser.uid,
    fromEmail: (currentUser.email || '').toLowerCase(),
    toEmail: email,
    fromSelfPetName: mySelfPet,
    // no gameId yet — defer creation until acceptance
    status: 'pending',
    createdAt: Date.now()
  });

  showToast('Invitation sent. Awaiting acceptance from ' + email, 'invite');
  input.value = '';

  // Show full-screen waiting page with the video
  showWaitingScreen(email);
}

function listenForMyInvites(user) {
  if (invitesUnsubscribe) {
    invitesUnsubscribe();
    invitesUnsubscribe = null;
  }

  const listEl = document.getElementById('invitations-list');
  if (!listEl || !user || !user.email) return;

  const email = user.email.toLowerCase();
  const q = query(
    collection(db, 'invites'),
    where('toEmail', '==', email),
    where('status', '==', 'pending')
  );

  invitesUnsubscribe = onSnapshot(q, (snapshot) => {
    listEl.innerHTML = '';

    const items = [];
    snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));

    if (items.length === 0) {
      const none = document.createElement('div');
      none.className = 'text-white/50 text-xs px-1 py-1';
      none.textContent = 'No invitations yet';
      listEl.appendChild(none);
      return;
    }

    items.forEach(inv => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-white/5 px-3 py-2 rounded-2xl gap-2';
      row.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="text-[10px] text-white/60">From</div>
          <div class="font-mono text-sm truncate">${inv.fromEmail || 'Unknown'}</div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button class="accept-btn px-3 py-1 text-xs bg-emerald-600/80 active:bg-emerald-600 rounded-xl">Accept</button>
          <button class="decline-btn px-2 py-1 text-xs bg-white/10 active:bg-white/20 rounded-xl text-white/70">Decline</button>
        </div>
      `;

      const acceptBtn = row.querySelector('.accept-btn');
      const declineBtn = row.querySelector('.decline-btn');

      // ACCEPT handler — creates game if it doesn't exist yet
      acceptBtn.onclick = async () => {
        // Ask the invitee for their self pet name BEFORE we accept/create the game.
        const inviteeSelfPet = await askForPetName('Set your pet name', 'This is the name your partner will see for you.');
        if (inviteeSelfPet === null) {
          // user cancelled
          if (acceptBtn) acceptBtn.disabled = false;
          if (declineBtn) declineBtn.disabled = false;
          return;
        }

        acceptBtn.disabled = true;
        if (declineBtn) declineBtn.disabled = true;

        try {
          // If the invite already points to a game (reused thread), use it.
          // Otherwise, create the game NOW (on acceptance).
          let gameId = inv.gameId;

          if (!gameId) {
            gameId = generateGameId();
            const newGame = {
              id: gameId,
              story: [],
              currentPrompt: promptsPool[Math.floor(Math.random() * promptsPool.length)],
              myAnswer: '',
              partnerAnswer: '',
              notes: [],
              guesses: [],
              correctGuesses: 0,
              totalAnswered: 0,
              loveMeter: 10,
              createdAt: Date.now(),
              bridgeIndex: 0,
              bridgeAnswers: {},
              members: [(inv.fromEmail || '').toLowerCase(), (user.email || '').toLowerCase()],
              // Seed pet names:
              // a (inviter) gets their self name from the invite (if provided)
              // b (invitee) gets their self name captured just now
              petNames: {
                a: inv.fromSelfPetName || '',
                b: inviteeSelfPet || ''
              },
              petNameForPartner: { a: '', b: '' }
            };
            await setDoc(doc(db, 'games', gameId), newGame);
          } else {
            // Game already existed (reused thread). Still patch the invitee's self name.
            if (inviteeSelfPet) {
              const snap = await getDoc(doc(db, 'games', gameId));
              if (snap.exists()) {
                const g = snap.data();
                g.petNames = g.petNames || { a: '', b: '' };
                g.petNames['b'] = inviteeSelfPet;
                await setDoc(doc(db, 'games', gameId), g, { merge: true });
              }
            }
          }

          // Mark invite as accepted and attach the (possibly new) gameId
          await setDoc(doc(db, 'invites', inv.id), {
            ...inv,
            gameId,
            status: 'accepted'
          }, { merge: true });

          // Invitee only sets their own self pet name here (what they want to be called).
          // They do NOT set a name for the inviter.
          try {
            const mySelf = (document.getElementById('my-pet-name')?.value || '').trim();

            await new Promise(res => setTimeout(res, 30));

            if (mySelf) {
              gameState.petNames = gameState.petNames || { a: '', b: '' };
              gameState.petNames['b'] = mySelf;
              // Do not touch petNameForPartner for the other side here
              saveToFirebase();
            }
          } catch (_) { /* non-fatal */ }

          lastAcceptedThread = { gameId, partner: inv.fromEmail || 'Partner' };
          updateContinueLastBtn();

          // Set correct role for the person who just accepted (they are the joiner)
          ensureBridgeRole(gameId, false); // 'b'

          // === Accept + pet name done → immediately show ONLY the game screen ===
          const _w = document.getElementById('waiting-screen');
          const _l = document.getElementById('landing-screen');
          const _c = document.getElementById('auth-choice-screen');
          const _g = document.getElementById('game-screen');
          if (_w) _w.classList.add('hidden');
          if (_l) _l.classList.add('hidden');
          if (_c) _c.classList.add('hidden');
          if (_g) _g.classList.remove('hidden');

          listenToGame(gameId);
          showGameScreen(gameId);   // this also forces the game screen and calls renderAll
          showToast('Invite accepted — thread joined', 'invite');

        } catch (e) {
          console.error(e);
          showToast('Unable to join. Please try again.', 'info');
          acceptBtn.disabled = false;
          if (declineBtn) declineBtn.disabled = false;
        }
      };

      // DECLINE handler
      declineBtn.onclick = async () => {
        declineBtn.disabled = true;
        if (acceptBtn) acceptBtn.disabled = true;

        try {
          await setDoc(doc(db, 'invites', inv.id), { ...inv, status: 'declined' }, { merge: true });
          showToast('Invite declined', 'info');
          // The list will update via the snapshot listener (we only show 'pending')
        } catch (e) {
          console.error(e);
          showToast('Unable to decline. Please try again.', 'info');
          declineBtn.disabled = false;
          if (acceptBtn) acceptBtn.disabled = false;
        }

        // Auto refresh the invites list / post-auth screen
        showPostAuthScreen();
      };

      listEl.appendChild(row);
    });
  });
}

function updateContinueLastBtn() {
  const btn = document.getElementById('continue-last-btn');
  if (!btn) return;

  if (lastAcceptedThread && lastAcceptedThread.gameId) {
    btn.classList.remove('hidden');
    btn.onclick = () => {
      listenToGame(lastAcceptedThread.gameId);
      showGameScreen(lastAcceptedThread.gameId);
    };
  } else {
    btn.classList.add('hidden');
    btn.onclick = null;
  }
}

// ==================== INIT ====================
function init() {
  createFloatingHearts();

  // Main landing buttons (use direct assignment for reliability)
  const createBtn = document.getElementById('create-game-btn');
  if (createBtn) createBtn.onclick = createNewGame;

  const joinBtn = document.getElementById('join-game-btn');
  if (joinBtn) joinBtn.onclick = joinGame;

  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.onclick = showHelp;

  // Footer help icon (visible on all screens)
  const footerHelp = document.getElementById('footer-help-btn');
  if (footerHelp) footerHelp.onclick = showHelp;

  // Other buttons
  document.getElementById('add-story-btn')?.addEventListener('click', addStoryEntry);
  document.getElementById('submit-answer-btn')?.addEventListener('click', submitMyAnswer);
  document.getElementById('send-note-btn')?.addEventListener('click', addLoveNote);
  document.getElementById('submit-guess-btn')?.addEventListener('click', addGuess);
  document.getElementById('new-prompt-btn')?.addEventListener('click', getNewPrompt);

  // Bridge the Gap buttons (attached reliably)
  const bp = document.getElementById('bridge-prev-btn');
  const bn = document.getElementById('bridge-next-btn');
  const bs = document.getElementById('bridge-save-btn');
  const br = document.getElementById('bridge-random-btn');
  const brst = document.getElementById('bridge-reset-btn');
  if (bp) bp.onclick = () => changeBridgeIndex(-1);
  if (bn) bn.onclick = () => changeBridgeIndex(1);
  if (bs) bs.onclick = saveBridgeAnswer;
  if (br) br.onclick = randomBridge;
  if (brst) brst.onclick = resetBridge;

  const bta = document.getElementById('bridge-my-answer');
  if (bta) bta.onblur = saveBridgeAnswer;

  // Bridge category filter - custom dropdown
  const catBtn = document.getElementById('bridge-category-btn');
  const catMenu = document.getElementById('bridge-category-menu');
  const catVal = document.getElementById('bridge-category-value');
  const catHidden = document.getElementById('bridge-category');

  if (catBtn && catMenu && catVal && catHidden) {
    // Populate menu
    catMenu.innerHTML = '';

    const allOpt = document.createElement('div');
    allOpt.className = 'bridge-cat-option px-4 py-2 hover:bg-white/10 cursor-pointer text-sm';
    allOpt.textContent = 'All questions';
    allOpt.onclick = () => {
      currentBridgeCategory = 'all';
      catHidden.value = 'all';
      catVal.textContent = 'All questions';
      catMenu.classList.add('hidden');
      gameState.bridgeIndex = 0;
      saveToFirebase();
      renderBridge();
    };
    catMenu.appendChild(allOpt);

    if (bridgeCategories && bridgeCategories.length) {
      bridgeCategories.forEach((c, i) => {
        const opt = document.createElement('div');
        opt.className = 'bridge-cat-option px-4 py-2 hover:bg-white/10 cursor-pointer text-sm';
        opt.textContent = `${c.title} (${c.questions.length})`;
        opt.onclick = () => {
          currentBridgeCategory = String(i);
          catHidden.value = String(i);
          catVal.textContent = `${c.title} (${c.questions.length})`;
          catMenu.classList.add('hidden');
          gameState.bridgeIndex = 0;
          saveToFirebase();
          renderBridge();
        };
        catMenu.appendChild(opt);
      });
    }

    // Set initial display
    currentBridgeCategory = catHidden.value || 'all';
    if (currentBridgeCategory === 'all') {
      catVal.textContent = 'All questions';
    } else {
      const cIdx = parseInt(currentBridgeCategory);
      const c = (bridgeCategories || [])[cIdx];
      if (c) catVal.textContent = `${c.title} (${c.questions.length})`;
    }

    catBtn.onclick = () => {
      catMenu.classList.toggle('hidden');
    };

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!catBtn.contains(e.target) && !catMenu.contains(e.target)) {
        catMenu.classList.add('hidden');
      }
    });
  }

  // Story Tone - custom dropdown wiring
  const toneBtn = document.getElementById('story-tone-btn');
  const toneMenu = document.getElementById('story-tone-menu');
  const toneVal = document.getElementById('story-tone-value');
  const toneHidden = document.getElementById('story-tone');

  if (toneBtn && toneMenu && toneVal && toneHidden) {
    // Set initial display from hidden or default
    const initVal = toneHidden.value || 'romantic';
    const initOpt = toneMenu.querySelector(`[data-value="${initVal}"]`);
    if (initOpt) toneVal.innerHTML = initOpt.innerHTML;

    toneBtn.onclick = () => {
      toneMenu.classList.toggle('hidden');
    };

    toneMenu.querySelectorAll('.tone-option').forEach(opt => {
      opt.onclick = () => {
        const val = opt.getAttribute('data-value');
        toneHidden.value = val;
        toneVal.innerHTML = opt.innerHTML;
        toneMenu.classList.add('hidden');
      };
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!toneBtn.contains(e.target) && !toneMenu.contains(e.target)) {
        toneMenu.classList.add('hidden');
      }
    });
  }

  // Help modal close buttons
  document.getElementById('close-help-btn')?.addEventListener('click', hideHelp);
  document.getElementById('close-help-btn2')?.addEventListener('click', hideHelp);

  // Close modal when clicking the backdrop
  const helpModal = document.getElementById('help-modal');
  helpModal?.addEventListener('click', (e) => {
    if (e.target === helpModal) hideHelp();
  });

  setupConnectionStatus();

  // Auth wiring (Google)
  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) googleBtn.onclick = signInWithGoogle;

  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) signoutBtn.onclick = async () => {
    try { await signOut(auth); } catch (_) {}
    showAuthChoiceScreen();
  };

  // Auth choice screen buttons
  const authSign = document.getElementById('auth-signin-btn');
  const authAnon = document.getElementById('auth-anon-btn');
  if (authSign) authSign.onclick = signInWithGoogle;
  if (authAnon) authAnon.onclick = () => {
    document.getElementById('auth-choice-screen').classList.add('hidden');
    document.getElementById('landing-screen').classList.remove('hidden');
  };

  // Partner invite button
  const inviteBtn = document.getElementById('invite-partner-btn');
  if (inviteBtn) inviteBtn.onclick = invitePartnerByEmail;

  // Quick "Continue last thread" button (from last accepted invite)
  const continueLast = document.getElementById('continue-last-btn');
  if (continueLast) {
    continueLast.onclick = () => {
      if (lastAcceptedThread && lastAcceptedThread.gameId) {
        listenToGame(lastAcceptedThread.gameId);
        showGameScreen(lastAcceptedThread.gameId);
      } else {
        // Fallback: open the most recent from the visible threads list
        const first = document.querySelector('#connections-list button');
        if (first) first.click();
      }
    };
  }

  // "New Game" button inside an active game (bottom of game screen) — show verification first
  const newGameBottom = document.getElementById('new-game-bottom-btn');
  if (newGameBottom) {
    newGameBottom.onclick = () => {
      showConfirmToast(
        'Create a new game thread with this partner? Your current thread will stay as-is.',
        () => forceNewGame(),
        null
      );
    };
  }

  // "End Game" button — shows confirmation toast before clearing local state + marking thread removed
  const endGameBtn = document.getElementById('end-game-btn');
  if (endGameBtn) {
    endGameBtn.onclick = () => {
      if (!gameState || !gameState.id) return;
      showConfirmToast(
        'End this game thread? This removes it from your list only (partner keeps theirs).',
        async () => {
          try {
            const myEmail = (currentUser?.email || '').toLowerCase();
            if (myEmail) {
              await removeThread(gameState.id, myEmail);
            }
          } catch (_) {}
          showToast('Game ended', 'info');
          // Clear current game view and go back to landing
          if (currentGameUnsubscribe) { currentGameUnsubscribe(); currentGameUnsubscribe = null; }
          gameState = {};
          document.getElementById('game-screen').classList.add('hidden');
          document.getElementById('landing-screen').classList.remove('hidden');
        }
      );
    };
  }

  // Auto join from URL (classic Game ID path)
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('game');

  if (gameId) {
    getDoc(doc(db, 'games', gameId)).then(snapshot => {
      if (snapshot.exists()) {
        listenToGame(gameId);
        showGameScreen(gameId);
      }
    });
  }

  // Listen for auth state
  onAuthStateChanged(auth, handleAuthChange);

  // Footer year (standardized)
  const fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();
}

window.switchTab = switchTab;
window.answerGuess = answerGuess;

// ===== Waiting Screen helpers (full-screen video + live wait for acceptance) =====
let waitingInviteUnsub = null;
let waitingPollTimer = null;

function showWaitingScreen(partnerEmail) {
  const wait = document.getElementById('waiting-screen');
  const video = document.getElementById('waiting-video');
  const cancelBtn = document.getElementById('cancel-wait-btn');
  if (!wait) return;

  // hide other screens
  const landing = document.getElementById('landing-screen');
  const game = document.getElementById('game-screen');
  const choice = document.getElementById('auth-choice-screen');
  if (landing) landing.classList.add('hidden');
  if (game) game.classList.add('hidden');
  if (choice) choice.classList.add('hidden');

  wait.classList.remove('hidden');

  // try to play video (best effort)
  if (video) {
    try { video.play().catch(() => {}); } catch (_) {}
  }

  // clean previous listeners
  if (waitingInviteUnsub) { waitingInviteUnsub(); waitingInviteUnsub = null; }
  if (waitingPollTimer) { clearInterval(waitingPollTimer); waitingPollTimer = null; }

  const myUid = currentUser?.uid || null;
  const myEmail = (currentUser?.email || '').toLowerCase();
  const target = (partnerEmail || '').toLowerCase();

  // Live listener for the pending invite we just sent
  const q = query(
    collection(db, 'invites'),
    where('fromUid', '==', myUid),
    where('toEmail', '==', target),
    where('status', '==', 'pending')
  );

  waitingInviteUnsub = onSnapshot(q, (snap) => {
    let found = null;
    snap.forEach(d => { if (!found) found = { id: d.id, ...d.data() }; });

    if (!found) {
      // maybe it was accepted/declined very fast — check accepted too
      const qa = query(
        collection(db, 'invites'),
        where('fromUid', '==', myUid),
        where('toEmail', '==', target),
        where('status', '==', 'accepted')
      );
      getDocs(qa).then(s => {
        let acc = null;
        s.forEach(d => { if (!acc) acc = { id: d.id, ...d.data() }; });
        if (acc && acc.gameId) {
          hideWaitingScreen();
          listenToGame(acc.gameId);
          showGameScreen(acc.gameId);
        }
      }).catch(() => {});
      return;
    }

    // if this pending invite suddenly gained a gameId, poll lightly until it's accepted
    if (found.gameId) {
      // fall through to the interval poller below
    }
  });

  // Poller: check for acceptance (and that a gameId exists)
  waitingPollTimer = setInterval(async () => {
    try {
      const qa = query(
        collection(db, 'invites'),
        where('fromUid', '==', myUid),
        where('toEmail', '==', target),
        where('status', '==', 'accepted')
      );
      const s = await getDocs(qa);
      let acc = null;
      s.forEach(d => { if (!acc) acc = { id: d.id, ...d.data() }; });

      if (acc && acc.gameId) {
        hideWaitingScreen();
        listenToGame(acc.gameId);
        showGameScreen(acc.gameId);
      }
    } catch (_) {}
  }, 1500);

  // Cancel: mark latest pending invite as removed for me (or declined if we want to be strict)
  if (cancelBtn) {
    cancelBtn.onclick = async () => {
      hideWaitingScreen();
      try {
        const qp = query(
          collection(db, 'invites'),
          where('fromUid', '==', myUid),
          where('toEmail', '==', target),
          where('status', '==', 'pending')
        );
        const sp = await getDocs(qp);
        const ups = [];
        sp.forEach(d => {
          const data = d.data();
          const removed = Array.isArray(data.removedFor) ? [...data.removedFor] : [];
          if (!removed.includes(myEmail)) removed.push(myEmail);
          ups.push(setDoc(doc(db, 'invites', d.id), { removedFor: removed }, { merge: true }));
        });
        await Promise.all(ups);
      } catch (_) {}
      showToast('Invite canceled', 'info');

      // Auto refresh to the correct screen (landing for signed-in users)
      showPostAuthScreen();
    };
  }
}

function hideWaitingScreen() {
  const wait = document.getElementById('waiting-screen');
  if (wait) wait.classList.add('hidden');

  if (waitingInviteUnsub) { waitingInviteUnsub(); waitingInviteUnsub = null; }
  if (waitingPollTimer) { clearInterval(waitingPollTimer); waitingPollTimer = null; }

  // Auto refresh to the correct post-auth view so the app doesn't go blank
  // (this is also called from the waiting poller when the game loads)
  showPostAuthScreen();
}

// Centralized screen refresher used after auth changes and invite cancel/decline events
function showPostAuthScreen() {
  const choice = document.getElementById('auth-choice-screen');
  const landing = document.getElementById('landing-screen');
  const game = document.getElementById('game-screen');
  const wait = document.getElementById('waiting-screen');

  if (wait) wait.classList.add('hidden');

  if (currentUser) {
    // Signed in: prefer active game if one is loaded, otherwise landing
    if (choice) choice.classList.add('hidden');
    if (game && gameState && gameState.id) {
      // keep game visible
      if (landing) landing.classList.add('hidden');
    } else {
      if (game) game.classList.add('hidden');
      if (landing) landing.classList.remove('hidden');
    }
  } else {
    // Signed out: show the Gmail auth choice screen
    if (landing) landing.classList.add('hidden');
    if (game) game.classList.add('hidden');
    if (choice) choice.classList.remove('hidden');
  }
}

// Run init reliably
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}