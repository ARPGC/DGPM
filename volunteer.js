// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
let currentUser = null;
let currentSport = null;
let currentMatchId = null;
let currentRaceData = []; // Stores local state for race results before saving

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await checkVolunteerAuth();
    loadVolunteerDashboard();
});

// --- 1. AUTHENTICATION ---
async function checkVolunteerAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // Fetch Role & Assigned Sport
    const { data: user, error } = await supabaseClient
        .from('users')
        .select('*, sports:assigned_sport_id(*)')
        .eq('id', session.user.id)
        .single();

    if (error || !user || user.role !== 'volunteer') {
        alert("ACCESS DENIED: Volunteer privileges required.");
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return;
    }

    if (!user.assigned_sport_id) {
        alert("No sport assigned to your account. Contact Admin.");
        return;
    }

    currentUser = user;
    currentSport = user.sports;

    // UI Updates
    document.getElementById('vol-name-display').innerText = `Hello, ${user.first_name}`;
    document.getElementById('vol-sport-name').innerText = currentSport.name;
    document.getElementById('vol-sport-type').innerText = currentSport.type;
    document.getElementById('vol-sport-cat').innerText = currentSport.category.replace('_', ' ');
}

async function volunteerLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- 2. MATCH LIST ---
async function loadVolunteerMatches() {
    const container = document.getElementById('vol-match-list');
    container.innerHTML = '<div class="flex justify-center py-6"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>';

    // Fetch matches for this sport only
    const { data: matches, error } = await supabaseClient
        .from('matches')
        .select('*')
        .eq('sport_id', currentSport.id)
        .neq('status', 'Completed') // Optionally hide completed, or keep them
        .order('start_time', { ascending: true });

    if (error) {
        container.innerHTML = `<p class="text-center text-red-500 text-sm">Error: ${error.message}</p>`;
        return;
    }

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 bg-white rounded-2xl shadow-sm border border-gray-100">
                <i data-lucide="check-circle-2" class="w-10 h-10 text-green-500 mx-auto mb-3"></i>
                <h3 class="font-bold text-gray-800">All Caught Up!</h3>
                <p class="text-xs text-gray-400">No active matches to manage.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = matches.map(m => {
        const isLive = m.status === 'Live';
        const isRace = currentSport.category.includes('race');
        
        let cardContent = '';

        if (isRace) {
            // RACE UI CARD
            const participantCount = m.race_details ? m.race_details.length : 0;
            cardContent = `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-bold text-gray-400 uppercase">${m.round_name}</span>
                    <span class="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100">${participantCount} Runners</span>
                </div>
                <h4 class="font-black text-xl text-gray-800 mb-4">${currentSport.name}</h4>
                <button onclick="openRaceModal('${m.id}')" class="w-full py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 flex items-center justify-center gap-2">
                    <i data-lucide="stopwatch" class="w-4 h-4"></i> Enter Results
                </button>
            `;
        } else {
            // KNOCKOUT UI CARD
            cardContent = `
                <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-bold text-gray-400 uppercase">${m.round_name}</span>
                    ${isLive 
                        ? `<span class="flex items-center gap-1 text-[10px] font-bold text-red-500 animate-pulse"><span class="w-2 h-2 bg-red-500 rounded-full"></span> LIVE</span>` 
                        : `<span class="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">${m.status}</span>`
                    }
                </div>
                <div class="flex items-center justify-between gap-2 mb-4">
                    <div class="flex-1 text-center bg-gray-50 p-2 rounded-lg">
                        <h4 class="font-bold text-sm leading-tight text-gray-900 truncate">${m.participant1_name || 'TBA'}</h4>
                        <p class="text-2xl font-black text-brand-primary mt-1">${m.score1 || 0}</p>
                    </div>
                    <span class="text-xs font-bold text-gray-300">VS</span>
                    <div class="flex-1 text-center bg-gray-50 p-2 rounded-lg">
                        <h4 class="font-bold text-sm leading-tight text-gray-900 truncate">${m.participant2_name || 'TBA'}</h4>
                        <p class="text-2xl font-black text-brand-primary mt-1">${m.score2 || 0}</p>
                    </div>
                </div>
                <button onclick="openScoreModal('${m.id}')" class="w-full py-3 bg-white border-2 border-brand-primary text-brand-primary font-bold rounded-xl hover:bg-brand-primary hover:text-white transition-colors flex items-center justify-center gap-2">
                    <i data-lucide="edit-3" class="w-4 h-4"></i> Update Score
                </button>
            `;
        }

        return `<div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">${cardContent}</div>`;
    }).join('');
    
    lucide.createIcons();
}

// Wrapper to load dashboard on init
function loadVolunteerDashboard() {
    loadVolunteerMatches();
}

// --- 3. LOGIC: KNOCKOUT SCORING ---

async function openScoreModal(matchId) {
    currentMatchId = matchId;
    
    // Fetch latest data for this match
    const { data: match } = await supabaseClient.from('matches').select('*').eq('id', matchId).single();
    
    document.getElementById('score-modal-round').innerText = match.round_name;
    document.getElementById('score-p1-name').innerText = match.participant1_name;
    document.getElementById('score-p2-name').innerText = match.participant2_name;
    document.getElementById('score-input-p1').value = match.score1 || 0;
    document.getElementById('score-input-p2').value = match.score2 || 0;
    
    // Populate Winner Dropdown
    const select = document.getElementById('winner-select');
    select.innerHTML = '<option value="">Select Winner...</option>';
    
    if(match.participant1_id) {
        const opt1 = document.createElement('option');
        opt1.value = match.participant1_id; // Using ID for logic
        opt1.text = match.participant1_name;
        select.add(opt1);
    }
    if(match.participant2_id) {
        const opt2 = document.createElement('option');
        opt2.value = match.participant2_id;
        opt2.text = match.participant2_name;
        select.add(opt2);
    }

    // Live Toggle State
    document.getElementById('match-live-toggle').checked = (match.status === 'Live');

    document.getElementById('modal-score').classList.remove('hidden');
}

window.adjustScore = function(team, delta) {
    const input = document.getElementById(`score-input-${team}`);
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta); // Prevent negative
    input.value = val;
}

window.updateMatchScore = async function(isFinal) {
    const s1 = document.getElementById('score-input-p1').value;
    const s2 = document.getElementById('score-input-p2').value;
    const isLive = document.getElementById('match-live-toggle').checked;
    const winnerId = document.getElementById('winner-select').value;

    let updates = {
        score1: s1,
        score2: s2,
        status: isLive ? 'Live' : 'Scheduled' // Default to Live or keep Scheduled
    };

    if (isFinal) {
        if (!winnerId) return showToast("⚠️ Please declare a winner first!", "error");
        
        const confirmEnd = confirm("Are you sure you want to END this match? This cannot be undone.");
        if (!confirmEnd) return;

        updates.status = 'Completed';
        updates.winner_id = winnerId;
        updates.is_live = false;
    } else {
        updates.is_live = isLive;
    }

    const { error } = await supabaseClient.from('matches').update(updates).eq('id', currentMatchId);

    if (error) {
        showToast("Error updating match", "error");
    } else {
        showToast(isFinal ? "Match Completed!" : "Score Updated", "success");
        window.closeModal('modal-score');
        loadVolunteerMatches();
    }
}


// --- 4. LOGIC: RACE RESULTS ---

async function openRaceModal(matchId) {
    currentMatchId = matchId;
    
    const { data: match } = await supabaseClient.from('matches').select('*').eq('id', matchId).single();
    
    // Parse existing details or empty array
    currentRaceData = match.race_details || [];
    
    // Sort slightly to show those with results first? Or by name? Let's sort by name for easy finding
    // But if results exist, sort by Rank
    currentRaceData.sort((a, b) => {
        if (a.rank && b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name);
    });

    renderRaceRows();

    const isDist = currentSport.category === 'race_distance';
    document.getElementById('race-metric-label').innerText = isDist ? "Dist (m)" : "Time (s)";
    
    document.getElementById('modal-race').classList.remove('hidden');
}

function renderRaceRows() {
    const container = document.getElementById('race-list-container');
    const isDist = currentSport.category === 'race_distance';

    if (currentRaceData.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-gray-400 py-4">No participants found. Admin must schedule/add players.</p>';
        return;
    }

    container.innerHTML = currentRaceData.map((p, index) => `
        <div class="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-xl mb-1 border border-gray-100">
            <div class="col-span-1 text-center font-bold text-gray-400 text-xs">
                ${p.rank ? `<span class="bg-brand-primary text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">${p.rank}</span>` : '-'}
            </div>
            <div class="col-span-6">
                <p class="font-bold text-sm text-gray-800 truncate">${p.name}</p>
                <p class="text-[9px] text-gray-400 uppercase tracking-wide">${p.id.substring(0,6)}...</p>
            </div>
            <div class="col-span-5 relative">
                <input type="number" step="0.01" 
                    placeholder="${isDist ? 'Meters' : 'Seconds'}" 
                    value="${p.metric || ''}" 
                    onchange="updateLocalRaceData(${index}, this.value)"
                    class="w-full bg-white border border-gray-200 rounded-lg p-2 text-right font-bold text-brand-primary outline-none focus:border-brand-primary text-sm">
            </div>
        </div>
    `).join('');
}

window.updateLocalRaceData = function(index, value) {
    currentRaceData[index].metric = value; // Store raw value
}

window.saveRaceResults = async function() {
    // 1. Calculate Ranks based on Metric
    // Filter out those with no metric
    let activeParticipants = currentRaceData.filter(p => p.metric && p.metric > 0);
    
    // Sort logic
    if (currentSport.category === 'race_distance') {
        // Higher is better (Shotput, Jump)
        activeParticipants.sort((a, b) => parseFloat(b.metric) - parseFloat(a.metric));
    } else {
        // Lower is better (Running)
        activeParticipants.sort((a, b) => parseFloat(a.metric) - parseFloat(b.metric));
    }

    // Assign Ranks
    activeParticipants.forEach((p, i) => {
        p.rank = i + 1;
    });

    // Merge back into main list (keep non-participants with no rank)
    // We update the original objects in `currentRaceData` because objects are passed by reference in filter? 
    // Wait, filter creates a shallow copy array, but objects inside are refs. So modifying `p.rank` works.
    
    // Update DB
    const { error } = await supabaseClient.from('matches').update({
        race_details: currentRaceData, // This now contains ranks
        status: 'Completed', // Auto-complete if results submitted? Or add a separate 'Finalize' button? Let's assume Publish = Done.
        is_live: false
    }).eq('id', currentMatchId);

    if (error) {
        showToast("Error saving results", "error");
    } else {
        showToast("Results Published!", "success");
        window.closeModal('modal-race');
        loadVolunteerMatches();
    }
}

// --- UTILITIES ---
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

window.showToast = function(msg, type='info') {
    const t = document.getElementById('toast-container');
    const content = document.getElementById('toast-content');
    const icon = document.getElementById('toast-icon');
    const text = document.getElementById('toast-text');

    text.innerText = msg;
    
    if (type === 'error') {
        content.classList.replace('bg-gray-900', 'bg-red-600');
        icon.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    } else {
        content.classList.replace('bg-red-600', 'bg-gray-900');
        icon.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-400"></i>';
    }

    t.classList.remove('opacity-0', 'pointer-events-none');
    t.classList.add('opacity-100');
    lucide.createIcons();

    setTimeout(() => {
        t.classList.remove('opacity-100');
        t.classList.add('opacity-0', 'pointer-events-none');
    }, 3000);
}
