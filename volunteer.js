// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
let currentUser = null;
let currentMatchId = null; // ID of the match currently being edited

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await checkVolunteerAuth();
});

// --- 1. AUTH CHECK ---
async function checkVolunteerAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // Verify Volunteer Role
    const { data: user } = await supabaseClient
        .from('users')
        .select('role, first_name, last_name')
        .eq('id', session.user.id)
        .single();

    if (!user || (user.role !== 'volunteer' && user.role !== 'admin')) {
        alert("Access Denied: Volunteers Only");
        window.location.href = 'student.html';
        return;
    }
    
    currentUser = user;
    document.getElementById('vol-name-display').innerText = `Welcome, ${user.first_name}`;
    
    loadVolunteerMatches();
}

function volunteerLogout() {
    supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- 2. MATCH LISTING ---
async function loadVolunteerMatches() {
    const container = document.getElementById('vol-match-list');
    container.innerHTML = '<div class="flex flex-col items-center justify-center py-10 text-gray-400"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mb-2"></div><p class="text-sm">Fetching assignments...</p></div>';

    // Fetch matches that are NOT completed yet
    const { data: matches } = await supabaseClient
        .from('matches')
        .select('*, sports(name, type, is_performance, unit)')
        .neq('status', 'Completed') 
        .order('start_time', { ascending: true });

    if (!matches || matches.length === 0) {
        container.innerHTML = '<div class="text-center py-10"><p class="text-gray-400 font-bold">No active matches assigned.</p></div>';
        return;
    }

    // Update Header Card with first match info (just for UI flair)
    if(matches.length > 0) {
        document.getElementById('vol-sport-name').innerText = matches[0].sports.name;
        document.getElementById('vol-sport-type').innerText = matches[0].sports.type;
        document.getElementById('vol-sport-cat').innerText = matches[0].sports.is_performance ? 'Event' : 'Match';
        document.getElementById('sport-card').classList.remove('hidden');
    }

    container.innerHTML = matches.map(m => {
        const isPerf = m.sports.is_performance;
        
        return `
        <div onclick="openMatchInterface('${m.id}')" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-transform cursor-pointer">
            <div class="absolute top-0 left-0 w-1 h-full ${m.status === 'Live' ? 'bg-green-500' : 'bg-indigo-500'}"></div>
            
            <div class="flex justify-between items-start mb-3 pl-3">
                <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">${m.sports.name}</span>
                <span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${m.status === 'Live' ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-gray-500'}">${m.status}</span>
            </div>

            <div class="pl-3">
                ${isPerf ? 
                    `<h4 class="font-black text-gray-900 text-lg leading-tight">PERFORMANCE ENTRY</h4>
                     <p class="text-xs text-gray-500 mt-1 font-medium">Click to enter results for all participants</p>`
                : 
                    `<div class="flex justify-between items-center text-center">
                        <h4 class="font-black text-gray-900 text-base leading-tight w-1/3 text-left">${m.team1_name}</h4>
                        <div class="text-xs font-bold text-gray-300">VS</div>
                        <h4 class="font-black text-gray-900 text-base leading-tight w-1/3 text-right">${m.team2_name}</h4>
                    </div>
                    <div class="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs font-bold text-brand-primary">
                        <span>Score: ${m.score1 || 0}</span>
                        <span>Score: ${m.score2 || 0}</span>
                    </div>`
                }
            </div>
        </div>
    `}).join('');
}

// --- 3. INTERFACE ROUTER ---
window.openMatchInterface = async function(matchId) {
    currentMatchId = matchId;
    
    // Fetch fresh details
    const { data: match } = await supabaseClient
        .from('matches')
        .select('*, sports(is_performance, unit)')
        .eq('id', matchId)
        .single();

    if (match.sports.is_performance) {
        // OPEN RACE INTERFACE
        renderRaceTable(match);
    } else {
        // OPEN SCOREBOARD INTERFACE
        renderScoreboard(match);
    }
}

// --- 4. RACE / PERFORMANCE LOGIC ---

function renderRaceTable(match) {
    const list = match.performance_data || []; // Array of {name, result, id}
    const container = document.getElementById('race-rows-container');
    const unit = match.sports.unit || 'Points';

    if(list.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-10">No participants found.</p>';
    } else {
        container.innerHTML = list.map((p, idx) => `
            <div class="flex items-center gap-3 mb-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span class="font-bold text-gray-400 w-6 text-center">${idx + 1}</span>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm text-gray-800 truncate">${p.name}</p>
                </div>
                <div class="relative">
                    <input type="text" placeholder="0.00" 
                        class="w-24 p-2 bg-white border border-gray-200 rounded-lg text-right font-mono font-bold text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                        value="${p.result || ''}" 
                        onchange="updateRaceData('${match.id}', ${idx}, this.value)">
                    <span class="absolute right-8 top-2.5 text-[10px] text-gray-400 font-bold pointer-events-none hidden">${unit}</span>
                </div>
            </div>
        `).join('');
    }

    // Bind Finalize Button
    const btn = document.getElementById('btn-finalize-race');
    btn.onclick = () => finalizeRace(match.id, match.sports.unit); // Pass unit for sorting logic

    document.getElementById('modal-race-entry').classList.remove('hidden');
}

async function updateRaceData(matchId, index, value) {
    // 1. Fetch current array state to avoid race conditions (simplified)
    const { data } = await supabaseClient.from('matches').select('performance_data').eq('id', matchId).single();
    let dataArr = data.performance_data;
    
    // 2. Update specific index
    dataArr[index].result = value;
    
    // 3. Save back
    await supabaseClient.from('matches').update({ performance_data: dataArr }).eq('id', matchId);
}

async function finalizeRace(matchId, unit) {
    if (!confirm("⚠️ Are you sure? This will RANK everyone and LOCK the event.")) return;

    const { data } = await supabaseClient.from('matches').select('performance_data').eq('id', matchId).single();
    let arr = data.performance_data;

    // Filter out empty results
    let validEntries = arr.filter(p => p.result && p.result.trim() !== '');
    let emptyEntries = arr.filter(p => !p.result || p.result.trim() === '');

    // Sort Logic
    // Time (Seconds) -> Lower is better
    // Distance (Meters) -> Higher is better
    const isDistance = unit === 'Meters' || unit === 'Points';
    
    validEntries.sort((a, b) => {
        const valA = parseFloat(a.result) || 0;
        const valB = parseFloat(b.result) || 0;
        return isDistance ? (valB - valA) : (valA - valB);
    });

    // Assign Ranks
    validEntries.forEach((p, i) => p.rank = i + 1);
    
    // Combine back
    const finalArr = [...validEntries, ...emptyEntries];

    // Winner Text
    const winnerText = validEntries.length > 0 ? `1st: ${validEntries[0].name} (${validEntries[0].result})` : 'No Results';

    await supabaseClient.from('matches').update({ 
        performance_data: finalArr, 
        status: 'Completed',
        winner_text: winnerText,
        is_live: false // Turn off live badge
    }).eq('id', matchId);

    showToast("Results Published!", "success");
    closeModal('modal-race-entry');
    loadVolunteerMatches(); // Refresh list
}

// --- 5. SCOREBOARD LOGIC (MATCHES) ---

function renderScoreboard(match) {
    document.getElementById('score-modal-round').innerText = match.sports.name;
    
    document.getElementById('score-p1-name').innerText = match.team1_name;
    document.getElementById('score-p2-name').innerText = match.team2_name;
    
    document.getElementById('score-input-p1').value = match.score1 || 0;
    document.getElementById('score-input-p2').value = match.score2 || 0;

    // Populate Winner Dropdown
    const select = document.getElementById('winner-select');
    select.innerHTML = `
        <option value="">Select Winner (Optional)</option>
        <option value="${match.team1_id}">${match.team1_name}</option>
        <option value="${match.team2_id}">${match.team2_name}</option>
    `;

    document.getElementById('modal-score').classList.remove('hidden');
}

window.adjustScore = function(team, delta) {
    const input = document.getElementById(`score-input-${team}`);
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta); // Prevent negative scores
    input.value = val;
}

window.updateMatchScore = async function(isFinal) {
    const s1 = document.getElementById('score-input-p1').value;
    const s2 = document.getElementById('score-input-p2').value;
    const winnerId = document.getElementById('winner-select').value;

    const updates = {
        score1: s1,
        score2: s2,
        status: isFinal ? 'Completed' : 'Live',
        is_live: !isFinal // If final, turn off live
    };

    if (isFinal) {
        if (!winnerId) return alert("Please select a Winner before ending the match.");
        updates.winner_id = winnerId;
    }

    const { error } = await supabaseClient.from('matches').update(updates).eq('id', currentMatchId);

    if(error) showToast(error.message, "error");
    else {
        showToast(isFinal ? "Match Ended!" : "Score Updated!", "success");
        closeModal('modal-score');
        loadVolunteerMatches();
    }
}

// --- UTILS ---
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

function showToast(msg, type) {
    const t = document.getElementById('toast-container');
    const txt = document.getElementById('toast-text');
    const icon = document.getElementById('toast-icon');

    // Style updates
    const content = document.getElementById('toast-content');
    if (type === 'success') {
        content.classList.remove('bg-gray-900');
        content.classList.add('bg-green-600');
        icon.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i>';
    } else {
        content.classList.remove('bg-green-600');
        content.classList.add('bg-gray-900');
        icon.innerHTML = '<i data-lucide="info" class="w-5 h-5"></i>';
    }

    txt.innerText = msg;
    lucide.createIcons();

    t.classList.remove('opacity-0', 'translate-y-20');
    setTimeout(() => t.classList.add('opacity-0', 'translate-y-20'), 3000);
}
