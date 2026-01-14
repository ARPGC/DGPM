// ==========================================
// URJA 2026 - ADMIN CONTROL CENTER
// ==========================================

// --- 1. CONFIGURATION & CLIENTS ---

if (typeof CONFIG === 'undefined' || typeof CONFIG_REALTIME === 'undefined') {
    console.error("CRITICAL ERROR: Configuration files missing.");
    alert("System Error: Config missing. Check console.");
}

const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
const realtimeClient = window.supabase.createClient(CONFIG_REALTIME.url, CONFIG_REALTIME.serviceKey);

// --- 2. STATE MANAGEMENT ---
let currentUser = null;
let currentView = 'dashboard';
let tempSchedule = []; 
let currentMatchViewFilter = 'Scheduled'; 

// Data Caches
let allTeamsCache = []; 
let dataCache = []; 
let allSportsCache = [];

// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    if(window.lucide) lucide.createIcons();
    injectToastContainer();
    injectScheduleModal();
    injectWinnerModal(); 

    await checkAdminAuth();
    
    // Default View
    window.switchView('dashboard');
});

// --- 4. AUTHENTICATION ---
async function checkAdminAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const { data: user } = await supabaseClient
        .from('users').select('role, email').eq('id', session.user.id).single();

    if (!user || user.role !== 'admin') {
        alert("Access Denied: Admins Only");
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = { ...session.user, email: user.email };
    loadDashboardStats();
}

window.adminLogout = function() {
    supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- 5. REALTIME SYNC ---
async function syncToRealtime(matchId) {
    const { data: match } = await supabaseClient.from('matches').select('*, sports(name)').eq('id', matchId).single();
    if (!match) return;

    let s1 = match.score1, s2 = match.score2;
    if (match.score_details) {
        s1 = match.score_details.team1_display || s1;
        s2 = match.score_details.team2_display || s2;
    }

    const payload = {
        id: match.id,
        sport_name: match.sports?.name || 'Unknown',
        team1_name: match.team1_name,
        team2_name: match.team2_name,
        score1: s1,
        score2: s2,
        round_number: match.round_number,
        match_type: match.match_type,
        status: match.status,
        is_live: match.is_live,
        location: match.location,
        start_time: match.start_time,
        winner_text: match.winner_text,
        winners_data: match.winners_data,
        performance_data: match.performance_data,
        updated_at: new Date()
    };

    await realtimeClient.from('live_matches').upsert(payload);
}

// --- 6. VIEW NAVIGATION ---
window.switchView = function(viewId) {
    currentView = viewId;
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-' + viewId);
    if(target) {
        target.classList.remove('hidden');
        target.classList.remove('animate-fade-in');
        void target.offsetWidth; 
        target.classList.add('animate-fade-in');
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navBtn = document.getElementById('nav-' + viewId);
    if(navBtn) navBtn.classList.add('active');

    const titleEl = document.getElementById('page-title');
    if(titleEl) titleEl.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);

    if(viewId === 'sports') window.loadSportsList();
    if(viewId === 'matches') { setupMatchFilters(); window.loadMatches('Scheduled'); }
}

// --- 7. DASHBOARD STATS ---
async function loadDashboardStats() {
    const { count: userCount } = await supabaseClient.from('users').select('*', { count: 'exact', head: true });
    const { count: regCount } = await supabaseClient.from('registrations').select('*', { count: 'exact', head: true });
    const { count: teamCount } = await supabaseClient.from('teams').select('*', { count: 'exact', head: true });
    
    document.getElementById('dash-total-users').innerText = userCount || 0;
    document.getElementById('dash-total-regs').innerText = regCount || 0;
    document.getElementById('dash-total-teams').innerText = teamCount || 0;
}

// --- 8. SPORTS MANAGEMENT ---
window.loadSportsList = async function() {
    const tablePerf = document.getElementById('sports-table-performance');
    const tableTourn = document.getElementById('sports-table-tournament');
    
    if(tablePerf) tablePerf.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Loading...</td></tr>';
    if(tableTourn) tableTourn.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Loading...</td></tr>';

    const { data: sports } = await supabaseClient.from('sports').select('*').order('name');
    const { data: activeMatches } = await supabaseClient.from('matches').select('sport_id, match_type, status').neq('status', 'Completed');

    const isActive = (id, type) => activeMatches?.some(m => m.sport_id === id && m.match_type?.includes(type));

    if(!sports || sports.length === 0) return;

    let perfHtml = '';
    let tourHtml = '';

    sports.forEach(s => {
        let actionBtn = '';
        const isESport = s.name.toLowerCase().includes('bgmi') || s.name.toLowerCase().includes('free fire');

        if (s.is_performance) {
            const jrActive = isActive(s.id, 'Junior');
            const srActive = isActive(s.id, 'Senior');

            actionBtn = `
                <div class="flex items-center gap-2 justify-end">
                    ${jrActive ? '<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Jr Active</span>' : `<button onclick="window.handleScheduleClick('${s.id}', '${s.name}', true, '${s.type}', 'Junior')" class="px-3 py-1.5 bg-blue-600 text-white rounded text-[10px] font-bold shadow-sm">Start Jr</button>`}
                    ${srActive ? '<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Sr Active</span>' : `<button onclick="window.handleScheduleClick('${s.id}', '${s.name}', true, '${s.type}', 'Senior')" class="px-3 py-1.5 bg-black text-white rounded text-[10px] font-bold shadow-sm">Start Sr</button>`}
                </div>`;
        } else {
            const jrActive = isActive(s.id, 'Junior');
            const srActive = isActive(s.id, 'Senior');
            const globalActive = isActive(s.id, 'Global');

            if (isESport) {
                actionBtn = `
                    <div class="flex items-center gap-2 justify-end">
                        ${globalActive ? '<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Active</span>' : `<button onclick="window.handleScheduleClick('${s.id}', '${s.name}', false, '${s.type}', 'Global')" class="px-3 py-1.5 bg-indigo-600 text-white rounded text-[10px] font-bold shadow-sm">Start Event</button>`}
                        <button onclick="window.openForceWinnerModal('${s.id}', '${s.name}', true)" class="p-1.5 bg-yellow-50 text-yellow-600 rounded border border-yellow-200"><i data-lucide="crown" class="w-3.5 h-3.5"></i></button>
                    </div>`;
            } else {
                actionBtn = `
                    <div class="flex items-center gap-2 justify-end">
                        ${jrActive ? '<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Jr Live</span>' : `<button onclick="window.handleScheduleClick('${s.id}', '${s.name}', false, '${s.type}', 'Junior')" class="px-3 py-1.5 bg-blue-600 text-white rounded text-[10px] font-bold shadow-sm">Sched Jr</button>`}
                        ${srActive ? '<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Sr Live</span>' : `<button onclick="window.handleScheduleClick('${s.id}', '${s.name}', false, '${s.type}', 'Senior')" class="px-3 py-1.5 bg-black text-white rounded text-[10px] font-bold shadow-sm">Sched Sr</button>`}
                        <button onclick="window.openForceWinnerModal('${s.id}', '${s.name}', false)" class="p-1.5 bg-yellow-50 text-yellow-600 rounded border border-yellow-200"><i data-lucide="crown" class="w-3.5 h-3.5"></i></button>
                    </div>`;
            }
        }

        const rowHtml = `
        <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <td class="p-4 font-bold text-gray-800">${s.name}</td>
            <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${s.status === 'Open' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}">${s.status}</span></td>
            <td class="p-4 text-right flex items-center justify-end gap-2">${actionBtn}</td>
        </tr>`;

        if (s.is_performance) perfHtml += rowHtml;
        else tourHtml += rowHtml;
    });

    if(tablePerf) tablePerf.innerHTML = perfHtml;
    if(tableTourn) tableTourn.innerHTML = tourHtml;
    lucide.createIcons();
}

window.handleAddSport = async function(e) {
    e.preventDefault();
    const name = document.getElementById('new-sport-name').value;
    const type = document.getElementById('new-sport-type').value;
    const size = document.getElementById('new-sport-size').value;
    const isPerformance = name.toLowerCase().includes('race') || name.toLowerCase().includes('jump') || name.toLowerCase().includes('throw');
    const unit = isPerformance ? (name.toLowerCase().includes('race') ? 'Seconds' : 'Meters') : 'Points';

    const { error } = await supabaseClient.from('sports').insert({ name, type, team_size: size, is_performance: isPerformance, unit: unit });
    if(error) showToast(error.message, "error");
    else { showToast("Sport Added!", "success"); window.closeModal('modal-add-sport'); window.loadSportsList(); }
}

// --- 9. SCHEDULER ---
window.handleScheduleClick = async function(sportId, sportName, isPerformance, sportType, category) {
    if (isPerformance) {
        if (confirm(`Start ${sportName} (${category})?`)) await initPerformanceEvent(sportId, sportName, category);
    } else {
        await initTournamentRound(sportId, sportName, sportType, category);
    }
}

async function initTournamentRound(sportId, sportName, sportType, category) {
    showToast(`Analyzing ${category} Bracket...`, "info");
    const intSportId = parseInt(sportId); 
    const isESport = sportName.toLowerCase().includes('bgmi') || sportName.toLowerCase().includes('free fire');

    const { data: catMatches } = await supabaseClient.from('matches')
        .select('round_number, status, match_type')
        .eq('sport_id', intSportId)
        .ilike('match_type', `%${category}%`)
        .order('round_number', { ascending: false });

    if (catMatches?.some(m => m.status !== 'Completed')) return showToast(`Finish active ${category} matches first!`, "error");

    let nextRound = 1, candidates = [];

    if (!catMatches || catMatches.length === 0) {
        if (sportType === 'Individual') await supabaseClient.rpc('prepare_individual_teams', { sport_id_input: intSportId });
        await supabaseClient.rpc('auto_lock_tournament_teams', { sport_id_input: intSportId });
        const { data: allTeams } = await supabaseClient.rpc('get_tournament_teams', { sport_id_input: intSportId });
        
        if (allTeams) {
            candidates = isESport ? allTeams.map(t => ({ id: t.team_id, name: t.team_name })) : allTeams.filter(t => t.category === category).map(t => ({ id: t.team_id, name: t.team_name }));
        }
        if (candidates.length < 2) return showToast(`Need at least 2 teams.`, "error");
    } else {
        const lastRound = catMatches[0].round_number;
        nextRound = lastRound + 1;
        const { data: winners } = await supabaseClient.from('matches').select('winner_id').eq('sport_id', intSportId).eq('round_number', lastRound).ilike('match_type', `%${category}%`).not('winner_id', 'is', null);
        if (!winners || winners.length < 2) return showToast(`${category} Completed!`, "success");
        const { data: teamDetails } = await supabaseClient.from('teams').select('id, name').in('id', winners.map(w => w.winner_id));
        candidates = teamDetails.map(t => ({ id: t.id, name: t.name }));
    }

    tempSchedule = [];
    let matchType = candidates.length === 2 ? 'Final' : candidates.length <= 4 ? 'Semi-Final' : 'Regular';
    matchType += ` (${category})`;
    candidates.sort(() => Math.random() - 0.5);

    if (candidates.length % 2 !== 0) {
        const lucky = candidates.pop();
        tempSchedule.push({ t1: lucky, t2: { id: null, name: "BYE" }, time: "10:00", location: "N/A", round: nextRound, type: 'Bye' });
    }
    for (let i = 0; i < candidates.length; i += 2) {
        tempSchedule.push({ t1: candidates[i], t2: candidates[i+1], time: "10:00", location: "College Ground", round: nextRound, type: matchType });
    }
    openSchedulePreviewModal(sportName, `${nextRound} (${category})`, tempSchedule, intSportId);
}

async function confirmSchedule(sportId) {
    const inserts = tempSchedule.map(m => ({
        sport_id: sportId, team1_id: m.t1.id, team2_id: m.t2.id, team1_name: m.t1.name, team2_name: m.t2.name,
        start_time: new Date().toISOString().split('T')[0] + 'T' + m.time, location: m.location, round_number: m.round,
        status: m.t2.id ? 'Scheduled' : 'Completed', winner_id: m.t2.id ? null : m.t1.id, winner_text: m.t2.id ? null : `${m.t1.name} (Bye)`, match_type: m.type
    }));
    const { error } = await supabaseClient.from('matches').insert(inserts);
    if(error) showToast(error.message, "error");
    else { showToast("Published!", "success"); window.closeModal('modal-schedule-preview'); window.loadMatches('Scheduled'); }
}

// --- 10. WINNER DECLARATION ---
window.openForceWinnerModal = async function(sportId, sportName, isESport) {
    const { data: teams } = await supabaseClient.from('teams').select('id, name').eq('sport_id', sportId);
    const opts = `<option value="">-- Select Winner --</option>` + (teams||[]).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    ['fw-gold','fw-silver','fw-bronze'].forEach(id => document.getElementById(id).innerHTML = opts);
    
    // Toggle Category Visibility for E-Sports
    const catContainer = document.getElementById('fw-category-container');
    if (catContainer) catContainer.style.display = isESport ? 'none' : 'block';
    
    document.getElementById('btn-confirm-winner').onclick = () => confirmForceWinner(sportId, sportName, isESport);
    document.getElementById('modal-force-winner').classList.remove('hidden');
}

async function confirmForceWinner(sportId, sportName, isESport) {
    const gId = document.getElementById('fw-gold').value;
    const sId = document.getElementById('fw-silver').value;
    const bId = document.getElementById('fw-bronze').value;
    const cat = isESport ? 'Global' : document.querySelector('input[name="fw-cat"]:checked').value;

    if(!gId) return showToast("Select Gold winner.", "error");

    const getTxt = (id) => { const el = document.getElementById(id); return el.selectedIndex > 0 ? el.options[el.selectedIndex].text : '-'; };
    const winnersData = { gold: getTxt('fw-gold'), silver: getTxt('fw-silver'), bronze: getTxt('fw-bronze') };
    const winnerText = `Gold: ${winnersData.gold}, Silver: ${winnersData.silver}, Bronze: ${winnersData.bronze}`;
    const resultName = isESport ? `E-Sports Result` : `Tournament Result (${cat})`;

    const { data: existing } = await supabaseClient.from('matches').select('id').eq('sport_id', sportId).eq('team1_name', resultName).single();

    let mId;
    const payload = { winner_id: gId, winner_text: winnerText, winners_data: winnersData, status: 'Completed', match_type: `Final (${cat})`, is_live: false };

    if (existing) {
        await supabaseClient.from('matches').update(payload).eq('id', existing.id);
        mId = existing.id;
    } else {
        const { data: nm } = await supabaseClient.from('matches').insert({
            sport_id: sportId, team1_name: resultName, team2_name: "Official Result",
            start_time: new Date().toISOString(), location: "Admin Panel", round_number: 100, ...payload
        }).select().single();
        mId = nm.id;
    }

    syncToRealtime(mId);
    showToast(`Result Declared!`, "success");
    window.closeModal('modal-force-winner');
    window.loadSportsList();
}

// --- 11. MATCH LIST ---
window.loadMatches = async function(statusFilter) {
    currentMatchViewFilter = statusFilter;
    const container = document.getElementById('matches-grid');
    if(!container) return;
    container.innerHTML = '<p class="col-span-3 text-center py-10">Loading...</p>';

    const { data: matches } = await supabaseClient.from('matches').select('*, sports(name, is_performance)').eq('status', statusFilter).order('start_time', { ascending: true });

    if (!matches || matches.length === 0) {
        container.innerHTML = `<p class="col-span-3 text-center py-10">No matches.</p>`;
        return;
    }

    container.innerHTML = matches.map(m => `
        <div class="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <span class="text-[10px] font-bold bg-gray-100 px-2 py-1 rounded text-gray-500 uppercase">${m.sports.name}</span>
            <div class="py-4 text-center">
                <h4 class="font-bold">${m.team1_name}</h4>
                <div class="text-[10px] text-gray-300 font-bold my-1">VS</div>
                <h4 class="font-bold">${m.team2_name}</h4>
            </div>
            <div class="border-t pt-3 flex justify-between items-center text-xs">
                 <span class="text-gray-400">${m.match_type || '-'}</span>
                 ${m.status === 'Scheduled' ? `<button onclick="window.startMatch('${m.id}')" class="text-brand-primary font-bold">Start</button>` : ''}
            </div>
        </div>`).join('');
}

window.startMatch = async function(matchId) {
    await supabaseClient.from('matches').update({ status: 'Live', is_live: true }).eq('id', matchId);
    showToast("Live!", "success");
    syncToRealtime(matchId);
    window.loadMatches('Live');
}

// --- 12. UTILS ---
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

function setupMatchFilters() {
    if(document.getElementById('match-filter-tabs')) return;
    const div = document.createElement('div');
    div.id = 'match-filter-tabs';
    div.className = "flex gap-2 mb-6 border-b pb-2 col-span-3";
    div.innerHTML = `<button onclick="loadMatches('Scheduled')" class="px-4 py-2 font-bold text-sm">Scheduled</button><button onclick="loadMatches('Live')" class="px-4 py-2 font-bold text-sm">Live</button><button onclick="loadMatches('Completed')" class="px-4 py-2 font-bold text-sm">Completed</button>`;
    document.getElementById('view-matches').prepend(div);
}

function injectScheduleModal() {
    if(document.getElementById('modal-schedule-preview')) return;
    const div = document.createElement('div');
    div.id = 'modal-schedule-preview';
    div.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
    div.innerHTML = `<div class="bg-white p-6 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto m-4"><div class="flex justify-between items-center mb-6"><div><h3 class="font-bold text-xl">Schedule Preview</h3><p id="preview-subtitle" class="text-sm text-gray-500"></p></div><button onclick="closeModal('modal-schedule-preview')"><i data-lucide="x" class="w-5 h-5"></i></button></div><div id="schedule-preview-list" class="space-y-3 mb-6"></div><button id="btn-confirm-schedule" onclick="confirmSchedule()" class="w-full py-3 bg-black text-white font-bold rounded-xl">Publish</button></div>`;
    document.body.appendChild(div);
}

function injectWinnerModal() {
    if(document.getElementById('modal-force-winner')) return;
    const div = document.createElement('div');
    div.id = 'modal-force-winner';
    div.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
    div.innerHTML = `
        <div class="bg-white p-6 rounded-2xl w-96">
            <h3 class="font-bold text-lg mb-4">Declare Winners</h3>
            <div id="fw-category-container" class="mb-4">
                <label class="text-xs font-bold text-gray-400 uppercase">Category</label>
                <div class="flex gap-4 mt-2">
                    <label class="text-sm font-bold"><input type="radio" name="fw-cat" value="Junior" checked> Junior</label>
                    <label class="text-sm font-bold"><input type="radio" name="fw-cat" value="Senior"> Senior</label>
                </div>
            </div>
            <div class="space-y-3">
                <select id="fw-gold" class="w-full p-2 border rounded-lg text-sm"></select>
                <select id="fw-silver" class="w-full p-2 border rounded-lg text-sm"></select>
                <select id="fw-bronze" class="w-full p-2 border rounded-lg text-sm"></select>
            </div>
            <div class="flex gap-2 mt-6">
                <button onclick="closeModal('modal-force-winner')" class="flex-1 py-2 bg-gray-100 rounded-lg font-bold text-sm">Cancel</button>
                <button id="btn-confirm-winner" class="flex-1 py-2 bg-black text-white rounded-lg font-bold text-sm">Confirm</button>
            </div>
        </div>`;
    document.body.appendChild(div);
}

function injectToastContainer() {
    if(document.getElementById('toast-container')) return;
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[70] transition-all duration-300 opacity-0 pointer-events-none translate-y-10 w-11/12 max-w-sm';
    div.innerHTML = `<div id=\"toast-content\" class=\"bg-gray-900 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-4\"><div id=\"toast-icon\"></div><p id=\"toast-msg\" class=\"text-sm font-bold flex-1\"></p></div>`;
    document.body.appendChild(div);
}

function showToast(msg, type) {
    const t = document.getElementById('toast-container');
    const txt = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    if(txt) txt.innerText = msg;
    if(icon) icon.innerHTML = type === 'error' ? '<i data-lucide=\"alert-circle\" class=\"w-5 h-5 text-red-400\"></i>' : '<i data-lucide=\"check-circle\" class=\"w-5 h-5 text-green-400\"></i>';
    lucide.createIcons();
    t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
    setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10'), 3000);
}
