// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
let currentUser = null;
let currentSportId = null;
let allMatchesCache = []; 

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    setupConfirmModal();
    await checkAuth();
});

// --- AUTHENTICATION ---
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const { data: user } = await supabaseClient
        .from('users')
        .select('*, assigned_sport:sports!assigned_sport_id(id, name, type)')
        .eq('id', session.user.id)
        .single();

    if (!user || user.role !== 'volunteer') {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    
    // SAFETY CHECK: Ensure elements exist before setting text
    const sportNameEl = document.getElementById('assigned-sport-name');
    const welcomeEl = document.getElementById('welcome-msg');

    if (user.assigned_sport) {
        currentSportId = user.assigned_sport.id;
        if (sportNameEl) sportNameEl.innerText = user.assigned_sport.name;
        if (welcomeEl) welcomeEl.innerText = `Welcome, ${user.first_name}`;
        loadAssignedMatches();
    } else {
        if (sportNameEl) sportNameEl.innerText = "No Sport Assigned";
        showToast("Contact Admin to assign a sport.", "error");
    }
}

function logout() {
    supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- MATCH MANAGEMENT ---
async function loadAssignedMatches() {
    const container = document.getElementById('matches-container');
    if (container) container.innerHTML = '<div class="text-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto"></div></div>';

    const { data: matches, error } = await supabaseClient
        .from('matches')
        .select('*')
        .eq('sport_id', currentSportId)
        .neq('status', 'Completed') 
        .order('start_time', { ascending: true });

    if (error) return showToast(error.message, "error");

    allMatchesCache = matches || [];
    renderMatches(allMatchesCache);
}

// --- FILTER / SEARCH ---
window.filterMatches = function() {
    const query = document.getElementById('match-search').value.toLowerCase();
    const filtered = allMatchesCache.filter(m => 
        (m.team1_name && m.team1_name.toLowerCase().includes(query)) ||
        (m.team2_name && m.team2_name.toLowerCase().includes(query))
    );
    renderMatches(filtered);
}

// --- RENDER LOGIC ---
function renderMatches(matches) {
    const container = document.getElementById('matches-container');
    if (!container) return;

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="text-center p-8 bg-white rounded-2xl border border-dashed border-gray-300">
                <i data-lucide="clipboard-x" class="w-8 h-8 text-gray-300 mx-auto mb-2"></i>
                <p class="text-gray-400 font-bold text-sm">No active matches found.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = matches.map(m => {
        const isLive = m.status === 'Live';
        const startTime = new Date(m.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        // 1. SCHEDULED STATE
        if (!isLive) {
            return `
            <div class="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm relative transition-all hover:shadow-md">
                <div class="flex justify-between items-start mb-4">
                    <span class="bg-gray-100 text-gray-500 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide">Round ${m.round_number}</span>
                    <span class="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">${startTime}</span>
                </div>
                
                <div class="flex justify-between items-center mb-6 px-1">
                    <h4 class="font-bold text-lg text-gray-900 w-5/12 truncate" title="${m.team1_name}">${m.team1_name}</h4>
                    <span class="text-gray-300 font-black text-xs px-2">VS</span>
                    <h4 class="font-bold text-lg text-gray-900 w-5/12 text-right truncate" title="${m.team2_name}">${m.team2_name}</h4>
                </div>

                <button onclick="startMatch('${m.id}')" class="w-full py-3.5 bg-black text-white font-bold rounded-xl shadow-lg shadow-gray-200 active:scale-95 transition-all">
                    Start Match
                </button>
            </div>`;
        } 
        
        // 2. LIVE STATE
        else {
            return `
            <div class="bg-white p-5 rounded-[1.5rem] border-2 border-green-500 shadow-xl shadow-green-100 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full bg-green-500 text-white text-[10px] font-bold text-center py-1 uppercase tracking-widest animate-pulse">
                    Match Live
                </div>
                
                <div class="mt-8 flex justify-between items-center gap-2">
                    <div class="flex-1 flex flex-col items-center bg-gray-50 p-3 rounded-2xl border border-gray-100">
                        <h4 class="font-bold text-sm text-center mb-3 truncate w-full px-1" title="${m.team1_name}">${m.team1_name}</h4>
                        <div class="flex items-center gap-3">
                            <button onclick="updateScore('${m.id}', 'score1', -1, ${m.score1})" class="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center font-bold text-xl active:scale-90 transition-transform">-</button>
                            <span class="text-3xl font-black text-brand-primary tabular-nums">${m.score1 || 0}</span>
                            <button onclick="updateScore('${m.id}', 'score1', 1, ${m.score1})" class="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-xl shadow-lg active:scale-90 transition-transform">+</button>
                        </div>
                    </div>

                    <span class="text-gray-300 font-black text-sm">VS</span>

                    <div class="flex-1 flex flex-col items-center bg-gray-50 p-3 rounded-2xl border border-gray-100">
                        <h4 class="font-bold text-sm text-center mb-3 truncate w-full px-1" title="${m.team2_name}">${m.team2_name}</h4>
                        <div class="flex items-center gap-3">
                            <button onclick="updateScore('${m.id}', 'score2', -1, ${m.score2})" class="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center font-bold text-xl active:scale-90 transition-transform">-</button>
                            <span class="text-3xl font-black text-brand-primary tabular-nums">${m.score2 || 0}</span>
                            <button onclick="updateScore('${m.id}', 'score2', 1, ${m.score2})" class="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-xl shadow-lg active:scale-90 transition-transform">+</button>
                        </div>
                    </div>
                </div>

                <div class="mt-6 space-y-3">
                    <button onclick="declareWalkover('${m.id}')" class="w-full py-2.5 border border-red-100 bg-red-50 text-red-500 font-bold rounded-xl text-xs hover:bg-red-100 transition-colors">
                        Opponent Absent? Declare Walkover
                    </button>

                    <div class="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <label class="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block tracking-wide ml-1">Declare Official Winner</label>
                        <select id="winner-select-${m.id}" onchange="enableEndBtn('${m.id}')" class="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-brand-primary transition-colors cursor-pointer">
                            <option value="">-- Select Winner --</option>
                            <option value="${m.team1_id}">${m.team1_name}</option>
                            <option value="${m.team2_id}">${m.team2_name}</option>
                        </select>
                    </div>

                    <button id="btn-end-${m.id}" onclick="endMatch('${m.id}')" disabled class="w-full py-3.5 bg-gray-200 text-gray-400 font-bold rounded-xl cursor-not-allowed transition-all">
                        End Match & Save
                    </button>
                </div>
            </div>`;
        }
    }).join('');
    
    lucide.createIcons();
}

// --- ACTIONS ---

window.startMatch = function(matchId) {
    showConfirmDialog("Start Match?", "It will be visible on Live Boards immediately.", async () => {
        const { error } = await supabaseClient
            .from('matches')
            .update({ status: 'Live', is_live: true, score1: 0, score2: 0 })
            .eq('id', matchId);

        if (error) showToast("Error starting match", "error");
        else {
            showToast("Match Started!", "success");
            closeModal('modal-confirm');
            loadAssignedMatches();
        }
    });
}

window.updateScore = async function(matchId, scoreField, delta, currentVal) {
    const newVal = Math.max(0, (currentVal || 0) + delta);
    
    const { error } = await supabaseClient
        .from('matches')
        .update({ [scoreField]: newVal })
        .eq('id', matchId);

    if (error) showToast("Sync Error", "error");
    else loadAssignedMatches();
}

window.enableEndBtn = function(matchId) {
    const select = document.getElementById(`winner-select-${matchId}`);
    const btn = document.getElementById(`btn-end-${matchId}`);
    
    if (select.value) {
        btn.disabled = false;
        btn.classList.remove('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
        btn.classList.add('bg-black', 'text-white', 'shadow-xl', 'active:scale-95', 'hover:opacity-90');
    } else {
        btn.disabled = true;
        btn.classList.add('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
        btn.classList.remove('bg-black', 'text-white', 'shadow-xl', 'active:scale-95', 'hover:opacity-90');
    }
}

window.endMatch = function(matchId) {
    const select = document.getElementById(`winner-select-${matchId}`);
    const winnerId = select.value;
    const winnerName = select.options[select.selectedIndex].text;

    if (!winnerId) return showToast("Please select a winner first", "error");

    showConfirmDialog("Confirm Result?", `Winner: ${winnerName}\nThis will end the match permanently.`, async () => {
        const { error } = await supabaseClient
            .from('matches')
            .update({ 
                status: 'Completed', 
                is_live: false, 
                winner_id: winnerId,
                winner_text: `Winner: ${winnerName}`
            })
            .eq('id', matchId);

        if (error) showToast("Error ending match", "error");
        else {
            showToast("Match Completed!", "success");
            closeModal('modal-confirm');
            loadAssignedMatches();
        }
    });
}

window.declareWalkover = function(matchId) {
    showConfirmDialog("Declare Walkover?", "Is the opponent absent? You will need to select the PRESENT team as the winner.", () => {
        closeModal('modal-confirm');
        alert("Instructions:\n1. Select the PRESENT team in the 'Declare Official Winner' dropdown.\n2. Click 'End Match'.\n\nThe system will record them as the winner.");
    });
}

// --- UTILS ---

let confirmCallback = null;

function setupConfirmModal() {
    const btnYes = document.getElementById('btn-confirm-yes');
    const btnCancel = document.getElementById('btn-confirm-cancel');
    
    if(btnYes) btnYes.onclick = () => confirmCallback && confirmCallback();
    if(btnCancel) btnCancel.onclick = () => { closeModal('modal-confirm'); confirmCallback = null; };
}

function showConfirmDialog(title, msg, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = msg;
    confirmCallback = onConfirm;
    
    const modal = document.getElementById('modal-confirm');
    if(modal) modal.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if(el) el.classList.add('hidden');
}

function showToast(msg, type) {
    const t = document.getElementById('toast-container');
    const txt = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    const content = document.getElementById('toast-content');
    
    if(!t || !txt) return; // Safety check

    txt.innerText = msg;
    
    // Reset classes
    content.className = 'bg-gray-900 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-md border border-gray-700/50';
    
    if (type === 'error') {
        icon.innerHTML = '<i data-lucide="alert-triangle" class="w-5 h-5 text-red-400"></i>';
        content.classList.add('border-red-500/30'); 
    } else {
        icon.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>';
        content.classList.add('border-green-500/30');
    }
    
    lucide.createIcons();
    t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
    
    setTimeout(() => {
        t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    }, 3000);
}
