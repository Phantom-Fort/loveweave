import './style.css';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
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

let myBridgeRole = 'a'; // 'a' for first/creator, 'b' for joiner. Persisted per game in localStorage.

// ==================== 100 PROMPTS ====================
const promptsPool = [
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
      <span class="text-emerald-400 text-xs">Synced</span>
    </span>
  `;

  const gameDoc = doc(db, 'games', gameId);
  currentGameUnsubscribe = onSnapshot(gameDoc, (snapshot) => {
    if (snapshot.exists()) {
      gameState = snapshot.data();
      renderAll();
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
      <span class="text-emerald-400 text-xs">Synced</span>
    </span>
  `;
}

// ==================== GAME FUNCTIONS ====================
function createNewGame() {
  const gameId = generateGameId();
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
    loveMeter: 45,
    createdAt: Date.now(),
    bridgeIndex: 0,
    bridgeAnswers: {}
  };

  ensureBridgeRole(gameId, true);
  setDoc(doc(db, 'games', gameId), gameState)
    .then(() => {
      listenToGame(gameId);
      showGameScreen(gameId);
    })
    .catch((e) => {
      console.error('Create game failed:', e);
      if (e && e.code === 'permission-denied') {
        const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      allow read, write: if true;
    }
  }
}`;
        console.log('%c[LoveWeave] Paste these Firestore rules:', 'color:#f99', rules);
        alert('Permission denied (Firestore rules).\n\n1. Go to Firebase Console → Firestore Database → Rules\n2. Replace the rules with this and click Publish:\n\n' + rules);
      } else {
        alert('Could not create game. See console for the error.');
      }
    });
}

function joinGame() {
  const gameId = document.getElementById('join-game-id').value.trim().toUpperCase();
  if (!gameId) return alert("Please enter a Game ID");

  getDoc(doc(db, 'games', gameId))
    .then(snapshot => {
      if (snapshot.exists()) {
        ensureBridgeRole(gameId, false); // joiner is role 'b'
        listenToGame(gameId);
        showGameScreen(gameId);
      } else {
        alert("Game not found");
      }
    })
    .catch((e) => {
      console.error(e);
      alert('Could not join game. Check your connection or Firestore rules.');
    });
}

function showGameScreen(gameId) {
  document.getElementById('landing-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('game-id-display').textContent = gameId;
  renderAll();
}

// ==================== RENDER FUNCTIONS ====================
function renderAll() {
  document.getElementById('love-meter-value').textContent = gameState.loveMeter || 45;
  renderStory();
  renderPrompt();
  renderNotes();
  renderGuesses();
  renderBridge();
}

function renderStory() {
  const container = document.getElementById('story-container');
  container.innerHTML = '';

  if (!gameState.story || gameState.story.length === 0) {
    container.innerHTML = `<p class="text-center text-white/50 py-4">No entries yet. Start writing your story.</p>`;
    return;
  }

  gameState.story.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'p-4 rounded-2xl bg-white/5 border border-white/10';
    
    let icon = '';
    if (entry.tone === 'romantic') icon = '❤️';
    else if (entry.tone === 'silly') icon = '😄';
    else if (entry.tone === 'future') icon = '🌟';
    else if (entry.tone === 'spicy') icon = '🔥';

    const time = new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    div.innerHTML = `
      <div class="flex justify-between items-center mb-1.5">
        <span class="font-semibold text-sm">${entry.author} ${icon}</span>
        <span class="text-xs text-white/50">${time}</span>
      </div>
      <p class="text-[15px]">${entry.text}</p>
    `;
    container.appendChild(div);
  });
}

function renderPrompt() {
  const promptEl = document.getElementById('current-prompt');
  promptEl.innerHTML = `"${gameState.currentPrompt || 'No prompt yet'}"`;
  document.getElementById('my-answer').value = gameState.myAnswer || '';

  const partnerEl = document.getElementById('partner-answer-text');
  if (gameState.partnerAnswer) {
    partnerEl.textContent = gameState.partnerAnswer;
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

  gameState.notes.slice().reverse().forEach(note => {
    const div = document.createElement('div');
    div.className = 'p-4 rounded-2xl bg-white/5 border border-white/10';
    const time = new Date(note.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    div.innerHTML = `
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium text-pink-300">${note.author}</span>
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

  gameState.guesses.forEach(guess => {
    const div = document.createElement('div');
    div.className = 'p-4 rounded-2xl bg-white/5 border border-white/10';

    let statusHTML = '';
    if (guess.status === "pending") {
      statusHTML = `
        <div class="flex gap-2 mt-3">
          <button onclick="answerGuess(${guess.id}, true)" class="flex-1 py-2 bg-emerald-600/80 active:bg-emerald-600 rounded-2xl text-sm">True</button>
          <button onclick="answerGuess(${guess.id}, false)" class="flex-1 py-2 bg-red-600/80 active:bg-red-600 rounded-2xl text-sm">False</button>
        </div>
      `;
    } else {
      const isCorrect = guess.status === "true";
      statusHTML = `<div class="mt-3 text-sm ${isCorrect ? 'text-emerald-400' : 'text-red-400'} font-medium">${isCorrect ? '✓ You were right!' : '✗ Not quite'}</div>`;
    }

    div.innerHTML = `
      <p class="text-[15px]">${guess.text}</p>
      <div class="text-xs text-white/50 mt-1">By ${guess.submittedBy}</div>
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

  gameState.story.push({
    id: Date.now(),
    author: "You",
    text: text,
    tone: document.getElementById('story-tone').value,
    timestamp: new Date().toISOString()
  });

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 5);
  document.getElementById('story-input').value = '';
  saveToFirebase();
  renderAll();
}

function submitMyAnswer() {
  const answer = document.getElementById('my-answer').value.trim();
  if (!answer) return;

  gameState.myAnswer = answer;
  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 8);
  saveToFirebase();
  renderPrompt();
}

function addLoveNote() {
  const text = document.getElementById('note-input').value.trim();
  if (!text) return;

  if (!gameState.notes) gameState.notes = [];

  gameState.notes.push({
    id: Date.now(),
    author: "You",
    text: text,
    timestamp: new Date().toISOString()
  });

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 4);
  document.getElementById('note-input').value = '';
  saveToFirebase();
  renderNotes();
}

function addGuess() {
  const input = document.getElementById('guess-input');
  const text = input.value.trim();
  if (!text) return;

  if (!gameState.guesses) gameState.guesses = [];

  gameState.guesses.push({
    id: Date.now(),
    text: text,
    submittedBy: "You",
    status: "pending"
  });

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 3);
  input.value = '';
  saveToFirebase();
  renderGuesses();
}

function answerGuess(guessId, isTrue) {
  const guess = gameState.guesses.find(g => g.id === guessId);
  if (!guess || guess.status !== "pending") return;

  guess.status = isTrue ? "true" : "false";
  guess.answeredBy = "You";

  gameState.totalAnswered = (gameState.totalAnswered || 0) + 1;
  if (isTrue) {
    gameState.correctGuesses = (gameState.correctGuesses || 0) + 1;
    gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 6);
  } else {
    gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 2);
  }

  saveToFirebase();
  renderGuesses();
}

function getNewPrompt() {
  gameState.currentPrompt = promptsPool[Math.floor(Math.random() * promptsPool.length)];
  gameState.myAnswer = '';
  gameState.partnerAnswer = '';
  saveToFirebase();
  renderPrompt();
}

// ==================== BRIDGE THE GAP ====================
function getBridgeRoleForGame(gid) {
  if (!gid) return 'a';
  const key = `bridgeRole_${gid}`;
  return localStorage.getItem(key) || 'a';
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
  let idx = (gameState.bridgeIndex || 0) + delta;
  idx = Math.max(0, Math.min(bridgeQuestions.length - 1, idx));
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
  gameState.bridgeAnswers[role][idx] = text;

  gameState.loveMeter = Math.min(100, (gameState.loveMeter || 45) + 2);
  saveToFirebase();
  renderBridge();
}

function randomBridge() {
  if (!gameState.id) return;
  const idx = Math.floor(Math.random() * bridgeQuestions.length);
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
  // compute absolute offset of this category
  let offset = 0;
  for (let i = 0; i < catIdx; i++) offset += bridgeCategories[i].questions.length;
  return { list: bridgeCategories[catIdx].questions, offset };
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

  progEl.textContent = `Q ${localIdx + 1} / ${activeList.length}`;

  const answers = gameState.bridgeAnswers || { a: {}, b: {} };
  const myRole = getBridgeRoleForGame(gameState.id);
  const partnerRole = myRole === 'a' ? 'b' : 'a';

  const myAns = (answers[myRole] && answers[myRole][idx]) || '';
  if (myTa) myTa.value = myAns;

  const partnerAns = (answers[partnerRole] && answers[partnerRole][idx]) || "Waiting for partner...";
  paEl.textContent = partnerAns;
  paEl.classList.toggle('italic', !answers[partnerRole] || !answers[partnerRole][idx]);

  // completed count (any side answered in current active list)
  let completed = 0;
  const aAns = answers.a || {};
  const bAns = answers.b || {};
  for (let i = offset; i < offset + activeList.length; i++) {
    if (aAns[i] || bAns[i]) completed++;
  }
  compEl.textContent = `${completed} answered`;
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

// ==================== AUTH (Gmail only) ====================
async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.error(e);
    alert('Google sign in failed. ' + (e?.message || ''));
  }
}

function handleAuthChange(user) {
  currentUser = user;

  const authArea = document.getElementById('auth-area');
  const userInfo = document.getElementById('user-info');
  const partnerTools = document.getElementById('partner-tools');
  const emailEl = document.getElementById('user-email');

  const choice = document.getElementById('auth-choice-screen');
  const landing = document.getElementById('landing-screen');

  if (user) {
    if (emailEl) emailEl.textContent = user.email || '';
    if (userInfo) userInfo.classList.remove('hidden');
    if (partnerTools) partnerTools.classList.remove('hidden');
    if (authArea) authArea.classList.remove('hidden'); // keep visible for sign out button

    ensureUserDoc(user);
    loadPendingInvites(user);

    // switch from choice to main landing
    if (choice) choice.classList.add('hidden');
    if (landing) landing.classList.remove('hidden');
  } else {
    if (userInfo) userInfo.classList.add('hidden');
    if (partnerTools) partnerTools.classList.add('hidden');
    if (authArea) authArea.classList.remove('hidden');
  }
}

async function ensureUserDoc(user) {
  if (!user) return;
  const uref = doc(db, 'users', user.uid);
  const snap = await getDoc(uref);
  if (!snap.exists()) {
    await setDoc(uref, {
      uid: user.uid,
      email: user.email || '',
      createdAt: Date.now()
    });
  }
}

async function invitePartnerByEmail() {
  if (!currentUser) return alert('Please sign in first to invite by email.');
  const input = document.getElementById('partner-email');
  if (!input) return;
  const email = (input.value || '').trim().toLowerCase();
  if (!email) return alert('Enter a Gmail address.');

  // Create a fresh game for the thread
  const gameId = generateGameId();
  const newState = {
    id: gameId,
    story: [],
    currentPrompt: promptsPool[Math.floor(Math.random() * promptsPool.length)],
    myAnswer: '',
    partnerAnswer: '',
    notes: [],
    guesses: [],
    correctGuesses: 0,
    totalAnswered: 0,
    loveMeter: 45,
    createdAt: Date.now(),
    bridgeIndex: 0,
    bridgeAnswers: {},
    members: [currentUser.email || '', email]
  };

  await setDoc(doc(db, 'games', gameId), newState);

  // Create pending invite
  await setDoc(doc(collection(db, 'invites')), {
    fromUid: currentUser.uid,
    fromEmail: currentUser.email || '',
    toEmail: email,
    gameId,
    status: 'pending',
    createdAt: Date.now()
  });

  alert('Invitation sent to ' + email + '. They will see it when they sign in.');
  input.value = '';

  // Inviter jumps straight in
  listenToGame(gameId);
  showGameScreen(gameId);
}

async function loadPendingInvites(user) {
  const section = document.getElementById('pending-section');
  const list = document.getElementById('pending-list');
  if (!section || !list || !user || !user.email) return;

  list.innerHTML = '';
  section.classList.add('hidden');

  const q = query(
    collection(db, 'invites'),
    where('toEmail', '==', user.email.toLowerCase()),
    where('status', '==', 'pending')
  );

  const snap = await getDocs(q);
  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));

  if (items.length === 0) return;

  section.classList.remove('hidden');

  items.forEach(inv => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between bg-white/5 px-3 py-2 rounded-2xl';
    row.innerHTML = `
      <div class="min-w-0">
        <div class="text-[10px] text-white/60">From</div>
        <div class="font-mono text-sm truncate">${inv.fromEmail}</div>
      </div>
      <button class="px-3 py-1 text-xs bg-emerald-600/80 active:bg-emerald-600 rounded-xl">Accept</button>
    `;
    const btn = row.querySelector('button');
    btn.onclick = async () => {
      btn.disabled = true;
      await setDoc(doc(db, 'invites', inv.id), { ...inv, status: 'accepted' }, { merge: true });
      listenToGame(inv.gameId);
      showGameScreen(inv.gameId);
      loadPendingInvites(user);
    };
    list.appendChild(row);
  });
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

  // Bridge category filter
  const catSel = document.getElementById('bridge-category');
  if (catSel) {
    catSel.innerHTML = `<option value="all">All questions</option>` +
      bridgeCategories.map((c, i) => `<option value="${i}">${c.title} (${c.questions.length})</option>`).join('');
    catSel.onchange = () => {
      currentBridgeCategory = catSel.value;
      // reset to first question of selected category
      gameState.bridgeIndex = 0;
      saveToFirebase();
      renderBridge();
    };
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
  if (signoutBtn) signoutBtn.onclick = () => signOut(auth);

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
}

window.switchTab = switchTab;
window.answerGuess = answerGuess;

// Run init reliably
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}