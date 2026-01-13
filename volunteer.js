// ==========================================
// URJA 2026 - VOLUNTEER SCORING DASHBOARD
// ==========================================

// --- 1. CONFIGURATION & CLIENTS ---

// A. MAIN PROJECT (Project A) - Auth, Assignments, Official Match Records
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// B. REALTIME PROJECT (Project B) - Live Score Relay
// We use the SERVICE KEY here because Volunteers need to WRITE data to the live stream.
const realtimeClient = window.supabase.createClient(CONFIG_REALTIME.url, CONFIG_REALTIME.serviceKey);

// --- 2. STATE MANAGEMENT ---
let currentUser = null;
let assignedSportId = null;
let currentMatchId = null;
let currentScores = { s1: 0, s2: 0 };

// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI Libraries
    if(window.lucide) lucide.createIcons();
    injectToastContainer();
    injectScoringModal();
    
    // Authenticate & Load
    await checkVolunteerAuth();
});

// --- 4. AUTHENTICATION & ASSIGNMENT CHECK ---
async function checkVolunteerAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    // Verify Role & Fetch Assigned Sport
    const { data: user } = await supabaseClient
        .from('users')
        .select('role, assigned_sport_id, sports(name)')
        .eq('id', session.user.id)
        .single();

    if (!user || user.role !== 'volunteer') {
        showToast("Access Denied: Volunteers Only", "error");
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }

    if (!user.assigned_sport_id) {
        document.getElementById('volunteer-content').innerHTML = `
            <div class="text-center py-20">
                <div class="bg-yellow-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <i data-lucide="alert-triangle" class="w-8 h-8 text-yellow-500"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-900">No Sport Assigned</h2>
                <p class="text-gray-500 mt-2 px-6">You have access, but no sport is linked to your account. Please ask an Admin to assign you.</p>
                <button onclick="location.reload()" class="mt-6 px-6 py-2 bg-black text-white rounded-lg text-sm font-bold">Check Again</button>
            </div>`;
        if(window.lucide) lucide.createIcons();
        return;
    }

    currentUser = session.user;
    assignedSportId = user.assigned_sport_id;
    
    // Update Header
    const sportNameEl = document.getElementById('vol-sport-name');
    if(sportNameEl) sportNameEl.innerText = user.sports.name;
    
    loadMyMatches();
}

function volunteerLogout() {
    supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- 5. REALTIME SYNC ENGINE (THE BRIDGE) ---
// This ensures that when a volunteer updates a score, it goes to the Student View instantly.
async function syncToRealtime(matchId) {
    console.log(`[SYNC] Pushing Match ${matchId} to Realtime Relay...`);

    // 1. Fetch Latest State from MAIN DB
    const { data: match, error } = await supabaseClient
        .from('matches')
        .select('*, sports(name)')
        .eq('id', matchId)
        .single();

    if(error || !match) {
        console.error("Sync Error: Could not fetch from Main DB", error);
        return;
    }

    // 2. Prepare Payload for REALTIME DB
    const payload = {
        id: match.id, // Keeps ID consistent across DBs
        sport_name: match.sports?.name || 'Unknown',
        team1_name: match.team1_name,
        team2_name: match.team2_name,
        score1: match.score1 || 0,
        score2: match.score2 || 0,
        status: match.status,
        is_live: match.is_live,
        round_number: match.round_number,
        match_type: match.match_type,
        winner_text: match.winner_text,
        updated_at: new Date()
    };

    // 3. Push to Project B (Realtime)
    const { error: rtError } = await realtimeClient
        .from('live_matches')
        .upsert(payload);

    if (rtError) console.error("Sync Failed:", rtError);
    else console.log("[SYNC] Update Pushed Successfully!");
}

// --- 6. MATCH DASHBOARD ---
async function loadMyMatches() {
    const container = document.getElementById('matches-list');
    if(!container) return;
    
    container.innerHTML = '<div class="text-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-2"></div><p class="text-gray-400 text-sm">Loading schedule...</p></div>';

    // Fetch matches for the assigned sport
    const { data: matches, error } = await supabaseClient
        .from('matches')
        .select('*')
        .eq('sport_id', assignedSportId)
        .neq('status', 'Completed') // Only show active/pending
        .order('start_time', { ascending: true });

    if (error) return showToast("Error loading matches", "error");

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div class="bg-green-50 rounded-full p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                    <i data-lucide="check-circle" class="w-8 h-8 text-green-500"></i>
                </div>
                <h3 class="font-bold text-gray-900 text-lg">All Caught Up!</h3>
                <p class="text-sm text-gray-500 mt-1">No active matches found for your sport.</p>
                <button onclick="loadMyMatches()" class="mt-4 text-brand-primary font-bold text-xs hover:underline">Refresh</button>
            </div>`;
        if(window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = matches.map(m => `
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
            ${m.status === 'Live' ? 
                `<div class="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl animate-pulse flex items-center gap-1"><span class="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE</div>` 
            : ''}
            
            <div class="flex justify-between items-end mb-4">
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded">Round ${m.round_number} • ${m.match_type}</div>
                <div class="text-xs font-mono font-bold text-gray-500">${new Date(m.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </div>

            <div class="flex items-center justify-between gap-2 mb-6">
                <div class="text-left w-1/3">
                    <h3 class="font-black text-lg text-gray-900 leading-tight break-words">${m.team1_name}</h3>
                    ${m.status === 'Live' ? `<p class="text-3xl font-black text-brand-primary mt-1">${m.score1 || 0}</p>` : ''}
                </div>
                
                <div class="text-center w-1/3 flex flex-col items-center">
                    <span class="text-[10px] font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded-full mb-1">VS</span>
                </div>
                
                <div class="text-right w-1/3">
                    <h3 class="font-black text-lg text-gray-900 leading-tight break-words">${m.team2_name}</h3>
                    ${m.status === 'Live' ? `<p class="text-3xl font-black text-brand-primary mt-1">${m.score2 || 0}</p>` : ''}
                </div>
            </div>

            ${m.status === 'Live' ? 
                `<button onclick="openScoring('${m.id}')" class="w-full py-3 bg-brand-primary text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="edit-3" class="w-4 h-4"></i> Update Score
                </button>`
            : 
                `<button onclick="startMatch('${m.id}')" class="w-full py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="play" class="w-4 h-4"></i> Start Match
                </button>`
            }
        </div>
    `).join('');
    
    if(window.lucide) lucide.createIcons();
}

// --- 7. MATCH ACTIONS ---

// A. START MATCH
window.startMatch = async function(matchId) {
    if(!confirm("Start this match? It will immediately go LIVE on the Student Portal.")) return;

    // 1. Update Main DB
    const { error } = await supabaseClient
        .from('matches')
        .update({ 
            status: 'Live', 
            is_live: true, 
            score1: 0, 
            score2: 0 
        })
        .eq('id', matchId);

    if (error) return showToast("Error starting match", "error");

    showToast("Match Started! Live Relay Active.", "success");
    
    // 2. Sync to Realtime DB
    await syncToRealtime(matchId);
    
    loadMyMatches();
}

// B. SCORING INTERFACE
window.openScoring = async function(matchId) {
    currentMatchId = matchId;
    
    // Fetch latest scores from Main DB to ensure sync
    const { data: match } = await supabaseClient
        .from('matches')
        .select('team1_name, team2_name, score1, score2')
        .eq('id', matchId)
        .single();

    if(!match) return;

    currentScores.s1 = match.score1 || 0;
    currentScores.s2 = match.score2 || 0;

    document.getElementById('score-t1-name').innerText = match.team1_name;
    document.getElementById('score-t2-name').innerText = match.team2_name;
    updateScoreDisplay();

    document.getElementById('modal-scoring').classList.remove('hidden');
}

function updateScoreDisplay() {
    document.getElementById('score-val-1').innerText = currentScores.s1;
    document.getElementById('score-val-2').innerText = currentScores.s2;
}

window.adjustScore = function(team, delta) {
    if(team === 1) currentScores.s1 = Math.max(0, currentScores.s1 + delta);
    else currentScores.s2 = Math.max(0, currentScores.s2 + delta);
    updateScoreDisplay();
}

// C. SAVE SCORES (Update & Sync)
window.saveScores = async function() {
    const btn = document.getElementById('btn-save-score');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Saving...`;
    btn.disabled = true;
    if(window.lucide) lucide.createIcons();

    // 1. Update Main DB
    const { error } = await supabaseClient
        .from('matches')
        .update({ 
            score1: currentScores.s1, 
            score2: currentScores.s2 
        })
        .eq('id', currentMatchId);

    if (error) {
        showToast("Failed to save to Main DB", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    // 2. Sync to Realtime DB
    await syncToRealtime(currentMatchId);

    showToast("Score Updated & Synced!", "success");
    btn.innerHTML = originalText;
    btn.disabled = false;
    closeModal('modal-scoring');
    loadMyMatches();
}

// D. END MATCH
window.endMatch = async function() {
    if(!confirm("End this match? This action cannot be undone.")) return;

    let winnerText = '';
    const t1Name = document.getElementById('score-t1-name').innerText;
    const t2Name = document.getElementById('score-t2-name').innerText;

    if(currentScores.s1 > currentScores.s2) winnerText = `${t1Name} Won`;
    else if(currentScores.s2 > currentScores.s1) winnerText = `${t2Name} Won`;
    else winnerText = "Draw";

    // 1. Update Main DB
    const { error } = await supabaseClient
        .from('matches')
        .update({ 
            status: 'Completed', 
            is_live: false, 
            score1: currentScores.s1, 
            score2: currentScores.s2,
            winner_text: winnerText
        })
        .eq('id', currentMatchId);

    if (error) return showToast("Error ending match", "error");

    // 2. Sync to Realtime DB (Final Push)
    await syncToRealtime(currentMatchId);

    showToast("Match Ended Successfully", "success");
    closeModal('modal-scoring');
    loadMyMatches();
}

// --- 8. UI COMPONENTS (MODAL & TOAST) ---

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

function injectScoringModal() {
    if(document.getElementById('modal-scoring')) return;
    const div = document.createElement('div');
    div.id = 'modal-scoring';
    div.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in';
    div.innerHTML = `
        <div class="bg-white p-6 rounded-3xl w-full max-w-md shadow-2xl relative">
            <div class="text-center mb-6">
                <h3 class="font-black text-2xl text-gray-900">Update Score</h3>
                <p class="text-xs text-brand-primary font-bold uppercase tracking-wide mt-1 flex items-center justify-center gap-1">
                    <span class="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></span> Live Sync Active
                </p>
            </div>

            <div class="flex items-center justify-between bg-gray-50 p-4 rounded-2xl mb-4 border border-gray-100 shadow-sm">
                <span id="score-t1-name" class="font-bold text-lg text-gray-800 w-1/2 truncate pr-2">Team A</span>
                <div class="flex items-center gap-3">
                    <button onclick="adjustScore(1, -1)" class="w-10 h-10 bg-white border border-gray-200 rounded-full text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors font-bold shadow-sm active:scale-95">-</button>
                    <span id="score-val-1" class="text-4xl font-black text-brand-primary w-14 text-center">0</span>
                    <button onclick="adjustScore(1, 1)" class="w-10 h-10 bg-black text-white rounded-full hover:bg-gray-800 transition-colors font-bold shadow-lg shadow-gray-400/50 active:scale-95">+</button>
                </div>
            </div>

            <div class="flex items-center justify-between bg-gray-50 p-4 rounded-2xl mb-8 border border-gray-100 shadow-sm">
                <span id="score-t2-name" class="font-bold text-lg text-gray-800 w-1/2 truncate pr-2">Team B</span>
                <div class="flex items-center gap-3">
                    <button onclick="adjustScore(2, -1)" class="w-10 h-10 bg-white border border-gray-200 rounded-full text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors font-bold shadow-sm active:scale-95">-</button>
                    <span id="score-val-2" class="text-4xl font-black text-brand-primary w-14 text-center">0</span>
                    <button onclick="adjustScore(2, 1)" class="w-10 h-10 bg-black text-white rounded-full hover:bg-gray-800 transition-colors font-bold shadow-lg shadow-gray-400/50 active:scale-95">+</button>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mb-4">
                <button onclick="endMatch()" class="py-3.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
                    End Match
                </button>
                <button id="btn-save-score" onclick="saveScores()" class="py-3.5 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                    Save & Sync
                </button>
            </div>
            
            <button onclick="closeModal('modal-scoring')" class="w-full py-3 text-gray-400 font-bold text-xs hover:text-gray-600 uppercase tracking-widest">Cancel Update</button>
        </div>
    `;
    document.body.appendChild(div);
}

function injectToastContainer() {
    if(!document.getElementById('toast-container')) {
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.className = 'fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[70] transition-all duration-300 opacity-0 pointer-events-none translate-y-10 w-11/12 max-w-sm';
        div.innerHTML = `<div id="toast-content" class="bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border border-gray-700/50"><div id="toast-icon"></div><p id="toast-msg" class="text-sm font-bold tracking-wide"></p></div>`;
        document.body.appendChild(div);
    }
}

function showToast(msg, type) {
    const t = document.getElementById('toast-container');
    const txt = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    
    if(txt) txt.innerText = msg;
    if(icon) icon.innerHTML = type === 'error' ? '<i data-lucide="alert-circle" class="w-5 h-5 text-red-400"></i>' : '<i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>';
    
    if(window.lucide) lucide.createIcons();
    if(t) {
        t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
        setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10'), 3000);
    }
}
