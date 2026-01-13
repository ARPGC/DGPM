// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
let currentUser = null;
let currentView = 'dashboard';
let tempSchedule = []; 
let currentMatchViewFilter = 'Scheduled'; 
let allTeamsCache = []; // For search
let dataCache = []; // For export
const DEFAULT_AVATAR = "https://t4.ftcdn.net/jpg/05/89/93/27/360_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg";

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    injectToastContainer();
    await checkAdminAuth();
    switchView('dashboard');
});

// --- 1. AUTH & LOGGING ---
async function checkAdminAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const { data: user } = await supabaseClient.from('users').select('role, email').eq('id', session.user.id).single();

    if (!user || user.role !== 'admin') {
        showToast("Access Denied: Admins Only", "error");
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    currentUser = { ...session.user, email: user.email };
    loadDashboardStats();
}

// Logs actions silently to the database
async function logAdminAction(action, details) {
    try {
        await supabaseClient.from('admin_logs').insert({
            admin_email: currentUser.email,
            action: action,
            details: details
        });
    } catch (err) {
        console.error("Logging failed:", err);
    }
}

function adminLogout() {
    supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- 2. VIEW NAVIGATION ---
window.switchView = function(viewId) {
    currentView = viewId;
    
    // UI Toggles
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-' + viewId);
    if(target) {
        target.classList.remove('hidden');
        target.classList.remove('animate-fade-in');
        void target.offsetWidth; // Trigger reflow
        target.classList.add('animate-fade-in');
    }

    // Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navBtn = document.getElementById('nav-' + viewId);
    if(navBtn) navBtn.classList.add('active');

    // Update Title
    const title = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    const titleEl = document.getElementById('page-title');
    if(titleEl) titleEl.innerText = title;

    // Show/Hide Export Buttons
    const globalActions = document.getElementById('global-actions');
    if(globalActions) {
        if (['users', 'teams', 'matches'].includes(viewId)) {
            globalActions.classList.remove('hidden');
        } else {
            globalActions.classList.add('hidden');
        }
    }

    // Load Specific Data
    dataCache = []; // Clear export cache
    if(viewId === 'users') loadUsersList();
    if(viewId === 'sports') loadSportsList();
    if(viewId === 'matches') loadMatches('Scheduled');
    if(viewId === 'teams') loadTeamsList();
}

// --- 3. EXPORT LOGIC ---
window.exportCurrentPage = function(type) {
    if (!dataCache || dataCache.length === 0) return showToast("No data to export", "error");
    
    const filename = `urja_${currentView}_${new Date().toISOString().split('T')[0]}`;

    if (type === 'excel') {
        const ws = XLSX.utils.json_to_sheet(dataCache);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, `${filename}.xlsx`);
        logAdminAction('EXPORT_EXCEL', `Exported ${currentView}`);
    } 
    else if (type === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l'); // Landscape for better table fit
        
        // Extract headers from first object keys
        const headers = Object.keys(dataCache[0]).map(k => k.toUpperCase());
        const rows = dataCache.map(obj => Object.values(obj).map(v => String(v)));

        doc.setFontSize(18);
        doc.text(`URJA 2026 - ${currentView.toUpperCase()}`, 14, 22);
        
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 8 }
        });

        doc.save(`${filename}.pdf`);
        logAdminAction('EXPORT_PDF', `Exported ${currentView}`);
    }
}

// --- 4. DASHBOARD ---
async function loadDashboardStats() {
    const { count: userCount } = await supabaseClient.from('users').select('*', { count: 'exact', head: true });
    const { count: regCount } = await supabaseClient.from('registrations').select('*', { count: 'exact', head: true });
    const { count: teamCount } = await supabaseClient.from('teams').select('*', { count: 'exact', head: true });
    
    const uEl = document.getElementById('dash-total-users');
    const rEl = document.getElementById('dash-total-regs');
    const tEl = document.getElementById('dash-total-teams');

    if(uEl) uEl.innerText = userCount || 0;
    if(rEl) rEl.innerText = regCount || 0;
    if(tEl) tEl.innerText = teamCount || 0;
}

// --- 5. SPORTS MANAGEMENT ---
async function loadSportsList() {
    const tablePerf = document.getElementById('sports-table-performance');
    const tableTourn = document.getElementById('sports-table-tournament');
    
    const loadingHtml = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Loading...</td></tr>';
    if(tablePerf) tablePerf.innerHTML = loadingHtml;
    if(tableTourn) tableTourn.innerHTML = loadingHtml;

    const { data: sports } = await supabaseClient.from('sports').select('*').order('name');
    const { data: activeMatches } = await supabaseClient.from('matches').select('sport_id').neq('status', 'Completed');
    const activeSportIds = activeMatches ? activeMatches.map(m => m.sport_id) : [];

    if(!sports || sports.length === 0) {
        return; // Empty state handled by default
    }

    let perfHtml = '';
    let tourHtml = '';

    sports.forEach(s => {
        const isStarted = activeSportIds.includes(s.id);
        
        let actionBtn = '';
        if (isStarted) {
             actionBtn = `<span class="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-lg border border-green-100 flex items-center gap-1 w-max ml-auto"><i data-lucide="activity" class="w-3 h-3"></i> Active</span>`;
        } else {
             actionBtn = `
                <button onclick="window.handleScheduleClick('${s.id}', '${s.name}', ${s.is_performance}, '${s.type}')" class="px-4 py-1.5 bg-black text-white rounded-lg text-xs font-bold hover:bg-gray-800 shadow-sm transition-transform active:scale-95 ml-auto block">
                    ${s.is_performance ? 'Start Event' : 'Schedule Round'}
                </button>`;
        }
        
        const closeBtn = `<button onclick="toggleSportStatus('${s.id}', '${s.status}')" class="text-xs font-bold underline text-gray-400 hover:text-gray-600 transition-colors">${s.status === 'Open' ? 'Close Reg' : 'Open Reg'}</button>`;

        const rowHtml = `
        <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <td class="p-4 font-bold text-gray-800">${s.name}</td>
            <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${s.status === 'Open' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}">${s.status}</span></td>
            <td class="p-4 text-right flex items-center justify-end gap-4">
                ${actionBtn}
                ${closeBtn}
            </td>
        </tr>`;

        if (s.is_performance) perfHtml += rowHtml;
        else tourHtml += rowHtml;
    });

    if(tablePerf) tablePerf.innerHTML = perfHtml || '<tr><td colspan="3" class="p-4 text-center text-gray-400 italic">No events found.</td></tr>';
    if(tableTourn) tableTourn.innerHTML = tourHtml || '<tr><td colspan="3" class="p-4 text-center text-gray-400 italic">No tournaments found.</td></tr>';
    
    lucide.createIcons();
}

window.openAddSportModal = () => document.getElementById('modal-add-sport').classList.remove('hidden');

window.handleAddSport = async function(e) {
    e.preventDefault();
    const name = document.getElementById('new-sport-name').value;
    const type = document.getElementById('new-sport-type').value;
    const size = document.getElementById('new-sport-size').value;

    const isPerformance = name.toLowerCase().includes('race') || 
                          name.toLowerCase().includes('jump') || 
                          name.toLowerCase().includes('throw');

    const unit = isPerformance ? (name.toLowerCase().includes('race') ? 'Seconds' : 'Meters') : 'Points';

    const { error } = await supabaseClient.from('sports').insert({
        name, type, team_size: size, icon: 'trophy', 
        is_performance: isPerformance, 
        unit: unit
    });

    if(error) showToast(error.message, "error");
    else {
        showToast("Sport Added!", "success");
        logAdminAction('ADD_SPORT', `Added ${name}`);
        closeModal('modal-add-sport');
        loadSportsList();
    }
}

window.toggleSportStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
    await supabaseClient.from('sports').update({ status: newStatus }).eq('id', id);
    loadSportsList();
}

// --- 6. SCHEDULER (FIXED) ---

window.handleScheduleClick = async function(sportId, sportName, isPerformance, sportType) {
    if (isPerformance) {
        if (confirm(`Start ${sportName}? This will initiate the event for volunteers.`)) {
            await initPerformanceEvent(sportId, sportName);
        }
    } else {
        await initTournamentRound(sportId, sportName, sportType);
    }
}

// PERFORMANCE
async function initPerformanceEvent(sportId, sportName) {
    const { data: existing } = await supabaseClient.from('matches').select('id').eq('sport_id', sportId).neq('status', 'Completed');
    if (existing && existing.length > 0) return showToast("Event is already active!", "info");

    const { data: regs } = await supabaseClient.from('registrations')
        .select('user_id, users(first_name, last_name, student_id)')
        .eq('sport_id', sportId);

    if (!regs || regs.length === 0) return showToast("No registrations found.", "error");

    const participants = regs.map(r => ({
        id: r.user_id,
        name: `${r.users.first_name} ${r.users.last_name} (${r.users.student_id})`,
        result: '',
        rank: 0
    }));

    const { error } = await supabaseClient.from('matches').insert({
        sport_id: sportId,
        team1_name: sportName,
        team2_name: 'All Participants',
        status: 'Live',
        is_live: true,
        performance_data: participants
    });

    if (error) showToast(error.message, "error");
    else {
        showToast(`${sportName} started!`, "success");
        logAdminAction('START_EVENT', sportName);
        loadSportsList();
    }
}

// TOURNAMENT (NEXT ROUND FIX)
async function initTournamentRound(sportId, sportName, sportType) {
    showToast("Analyzing Bracket...", "info");
    const intSportId = parseInt(sportId); 

    // Get Latest Round Info
    const { data: latestMatches } = await supabaseClient.from('matches')
        .select('round_number, status')
        .eq('sport_id', intSportId)
        .order('round_number', { ascending: false })
        .limit(1);

    let round = 1;
    let candidates = [];

    // ROUND 1 LOGIC
    if (!latestMatches || latestMatches.length === 0) {
        if (sportType === 'Individual') {
            await supabaseClient.rpc('prepare_individual_teams', { sport_id_input: intSportId });
        }
        await supabaseClient.rpc('auto_lock_tournament_teams', { sport_id_input: intSportId });

        const { data: validTeams } = await supabaseClient.rpc('get_tournament_teams', { sport_id_input: intSportId });
        if (!validTeams || validTeams.length < 2) return showToast("Need at least 2 VALID TEAMS to start.", "error");

        candidates = validTeams.map(t => ({ 
            id: t.team_id, 
            name: t.team_name,
            category: t.category 
        }));

    } 
    // NEXT ROUND LOGIC
    else {
        const lastRound = latestMatches[0].round_number;
        
        // Check Pending Matches
        const { count: pendingCount } = await supabaseClient
            .from('matches')
            .select('*', { count: 'exact', head: true })
            .eq('sport_id', intSportId)
            .eq('round_number', lastRound)
            .neq('status', 'Completed');

        if (pendingCount > 0) return showToast(`Round ${lastRound} unfinished! (${pendingCount} matches left)`, "error");

        round = lastRound + 1;

        // Fetch Winners
        const { data: winners } = await supabaseClient
            .from('matches')
            .select('winner_id')
            .eq('sport_id', intSportId)
            .eq('round_number', lastRound)
            .not('winner_id', 'is', null);

        if (!winners || winners.length < 2) return showToast("Tournament Completed! (Winner Declared)", "success");

        const winnerIds = winners.map(w => w.winner_id);
        
        const { data: teamDetails } = await supabaseClient
            .from('teams')
            .select(`id, name, captain:users!captain_id(class_name)`)
            .in('id', winnerIds);

        candidates = teamDetails.map(t => ({
            id: t.id,
            name: t.name,
            category: (['FYJC', 'SYJC'].includes(t.captain?.class_name)) ? 'Junior' : 'Senior'
        }));
    }

    // PAIRING LOGIC (With Bye)
    tempSchedule = [];
    
    let matchType = 'Regular';
    if (candidates.length === 2) matchType = 'Final';
    else if (candidates.length <= 4) matchType = 'Semi-Final';

    if (candidates.length <= 4) {
        // Merge Pools for Semi/Finals
        candidates.sort(() => Math.random() - 0.5); 
        generatePairsFromList(candidates, round, matchType);
    } else {
        // Split Pools
        const juniors = candidates.filter(c => c.category === 'Junior').sort(() => Math.random() - 0.5);
        const seniors = candidates.filter(c => c.category === 'Senior').sort(() => Math.random() - 0.5);
        generatePairsFromList(juniors, round, matchType);
        generatePairsFromList(seniors, round, matchType);
    }

    openSchedulePreviewModal(sportName, round, tempSchedule, intSportId);
}

function generatePairsFromList(list, round, matchType) {
    // Bye Handling
    if (list.length % 2 !== 0) {
        const luckyTeam = list.pop(); 
        tempSchedule.push({
            t1: luckyTeam,
            t2: { id: null, name: "BYE (Auto-Advance)" },
            time: "10:00",
            location: "N/A",
            round: round,
            type: 'Bye Round'
        });
    }
    for (let i = 0; i < list.length; i += 2) {
        tempSchedule.push({
            t1: list[i],
            t2: list[i+1],
            time: "10:00",
            location: "College Ground",
            round: round,
            type: matchType
        });
    }
}

function openSchedulePreviewModal(sportName, round, schedule, sportId) {
    document.getElementById('preview-subtitle').innerText = `Generating Round ${round}`;
    const container = document.getElementById('schedule-preview-list');
    
    const venueOptions = `<option value="College Ground">College Ground</option><option value="Badminton Hall">Badminton Hall</option><option value="Old Gymkhana">Old Gymkhana</option>`;

    container.innerHTML = schedule.map((m, idx) => `
        <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
            <div class="flex-1 text-center md:text-left">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${m.type}</span>
                <div class="font-bold text-gray-900 text-lg">${m.t1.name} <span class="text-[10px] bg-gray-100 px-1 rounded">${m.t1.category || ''}</span></div>
                <div class="text-xs text-gray-400 font-bold my-1">VS</div>
                <div class="font-bold text-gray-900 text-lg ${m.t2.id ? '' : 'text-gray-400 italic'}">${m.t2.name} <span class="text-[10px] bg-gray-100 px-1 rounded">${m.t2.category || ''}</span></div>
            </div>
            ${m.t2.id ? `
            <div class="flex gap-2 w-full md:w-auto">
                <input type="time" class="input-field p-2 w-full md:w-24 bg-gray-50 border rounded-lg text-sm font-bold" value="${m.time}" onchange="updateTempSchedule(${idx}, 'time', this.value)">
                <select class="input-field p-2 w-full md:w-40 bg-gray-50 border rounded-lg text-sm font-bold" onchange="updateTempSchedule(${idx}, 'location', this.value)">${venueOptions}</select>
            </div>` : `<span class="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded">Walkover</span>`}
        </div>
    `).join('');

    document.getElementById('btn-confirm-schedule').onclick = () => confirmSchedule(sportId);
    document.getElementById('modal-schedule-preview').classList.remove('hidden');
}

window.updateTempSchedule = (idx, field, value) => tempSchedule[idx][field] = value;

async function confirmSchedule(sportId) {
    const btn = document.getElementById('btn-confirm-schedule');
    btn.innerText = "Publishing...";
    btn.disabled = true;

    const inserts = tempSchedule.map(m => ({
        sport_id: sportId,
        team1_id: m.t1.id,
        team2_id: m.t2.id,
        team1_name: m.t1.name,
        team2_name: m.t2.name,
        start_time: new Date().toISOString().split('T')[0] + 'T' + m.time,
        location: m.location,
        round_number: m.round,
        status: m.t2.id ? 'Scheduled' : 'Completed', 
        winner_id: m.t2.id ? null : m.t1.id,         
        winner_text: m.t2.id ? null : `${m.t1.name} (Bye)`,
        match_type: m.type
    }));

    const { error } = await supabaseClient.from('matches').insert(inserts);

    if(error) {
        showToast(error.message, "error");
        btn.innerText = "Confirm & Publish";
        btn.disabled = false;
    } else {
        showToast("Round Generated Successfully!", "success");
        logAdminAction('PUBLISH_ROUND', `Published round for Sport ID ${sportId}`);
        closeModal('modal-schedule-preview');
        loadSportsList();
        loadMatches('Scheduled');
    }
}

// --- 7. USERS (With Reset & Export Cache) ---
async function loadUsersList() {
    const tbody = document.getElementById('users-table-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Loading...</td></tr>';
    
    const { data: users } = await supabaseClient.from('users').select('*').order('created_at', { ascending: false });

    // Populate Cache for Export
    dataCache = users.map(u => ({
        Name: `${u.first_name} ${u.last_name}`,
        Email: u.email,
        Role: u.role,
        Class: u.class_name,
        Mobile: u.mobile
    }));

    tbody.innerHTML = users.map(u => `
        <tr class="border-b border-gray-50 hover:bg-gray-50">
            <td class="p-4 flex items-center gap-3">
                <img src="${u.avatar_url || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full object-cover bg-gray-200">
                <div>
                    <div class="font-bold text-gray-900">${u.first_name} ${u.last_name}</div>
                    <div class="text-xs text-gray-500">${u.email}</div>
                </div>
            </td>
            <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${u.role==='admin'?'bg-purple-50 text-purple-600':'bg-gray-100 text-gray-600'} uppercase">${u.role}</span></td>
            <td class="p-4 text-gray-600">${u.class_name || '-'} <span class="text-xs text-gray-400">(${u.student_id})</span></td>
            <td class="p-4 text-gray-600">${u.mobile || '-'}</td>
            <td class="p-4 text-right">
                <button onclick="resetUserPassword('${u.id}', '${u.first_name}')" class="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg font-bold hover:bg-red-100 border border-red-100">Reset Pass</button>
            </td>
        </tr>
    `).join('');
}

window.resetUserPassword = async function(userId, name) {
    if(!confirm(`Reset password for ${name} to "student"?`)) return;
    const { error } = await supabaseClient.rpc('admin_reset_password', { target_user_id: userId });
    if(error) showToast("DB Error (Check pgcrypto)", "error");
    else {
        showToast("Password reset to 'student'", "success");
        logAdminAction('RESET_PASSWORD', `User: ${name}`);
    }
}

window.filterUsers = function() {
    const q = document.getElementById('user-search').value.toLowerCase();
    document.querySelectorAll('#users-table-body tr').forEach(r => {
        r.style.display = r.innerText.toLowerCase().includes(q) ? '' : 'none';
    });
}

// --- 8. TEAMS (With Export Cache) ---
async function loadTeamsList() {
    const grid = document.getElementById('teams-grid');
    if(!grid) return;
    grid.innerHTML = '<p class="col-span-3 text-center text-gray-400 py-10">Loading teams...</p>';

    // Add search bar if missing
    if(!document.getElementById('teams-search-container')) {
        const div = document.createElement('div');
        div.id = 'teams-search-container';
        div.className = "col-span-3 mb-4 flex gap-2";
        div.innerHTML = `<input type="text" id="team-search-input" onkeyup="filterTeamsList()" placeholder="Search Teams..." class="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-black">`;
        grid.parentElement.insertBefore(div, grid);
    }

    const { data: teams } = await supabaseClient
        .from('teams')
        .select('*, sports(name), captain:users!captain_id(first_name, last_name)')
        .order('created_at', { ascending: false });

    allTeamsCache = teams || [];

    // Populate Export Cache
    dataCache = teams.map(t => ({
        Team: t.name,
        Sport: t.sports.name,
        Captain: `${t.captain?.first_name} ${t.captain?.last_name}`,
        Status: t.status
    }));

    renderTeams(allTeamsCache);
}

window.filterTeamsList = function() {
    const q = document.getElementById('team-search-input').value.toLowerCase();
    renderTeams(allTeamsCache.filter(t => t.name.toLowerCase().includes(q)));
}

function renderTeams(teams) {
    const grid = document.getElementById('teams-grid');
    if(teams.length === 0) { grid.innerHTML = '<p class="col-span-3 text-center text-gray-400">No teams found.</p>'; return; }
    
    grid.innerHTML = teams.map(t => `
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <div class="flex justify-between items-start mb-3">
                <span class="text-[10px] font-bold uppercase bg-gray-100 px-2 py-1 rounded text-gray-500">${t.sports.name}</span>
                <span class="text-[10px] font-bold uppercase ${t.status === 'Locked' ? 'text-red-500' : 'text-green-500'}">${t.status}</span>
            </div>
            <h4 class="font-bold text-lg text-gray-900">${t.name}</h4>
            <p class="text-xs text-gray-500 mb-4">Capt: ${t.captain?.first_name || 'Unknown'}</p>
            <button onclick="viewTeamSquad('${t.id}', '${t.name}')" class="w-full py-2 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors">View Squad</button>
        </div>
    `).join('');
}

window.viewTeamSquad = async function(teamId, teamName) {
    const { data: members } = await supabaseClient.from('team_members').select('users(first_name, last_name)').eq('team_id', teamId).eq('status', 'Accepted');
    let msg = `Squad for ${teamName}:\n\n`;
    if(members) members.forEach((m, i) => msg += `${i+1}. ${m.users.first_name} ${m.users.last_name}\n`);
    alert(msg);
}

// --- 9. MATCHES (With Export Cache) ---
window.loadMatches = async function(statusFilter = 'Scheduled') {
    currentMatchViewFilter = statusFilter;
    
    // Update Tabs
    document.querySelectorAll('#view-matches button').forEach(b => { /* Assuming buttons exist in HTML structure provided previously */ });

    const container = document.getElementById('matches-grid');
    if(!container) return;
    container.innerHTML = '<p class="col-span-3 text-center text-gray-400 py-10">Loading matches...</p>';

    const { data: matches } = await supabaseClient
        .from('matches')
        .select('*, sports(name, is_performance)')
        .eq('status', statusFilter)
        .order('start_time', { ascending: true });

    // Populate Export Cache
    if(matches) {
        dataCache = matches.map(m => ({
            Round: m.round_number,
            Sport: m.sports.name,
            Team1: m.team1_name,
            Team2: m.team2_name,
            Time: new Date(m.start_time).toLocaleString(),
            Status: m.status
        }));
    }

    if (!matches || matches.length === 0) {
        container.innerHTML = `<p class="col-span-3 text-center text-gray-400 py-10">No ${statusFilter} matches found.</p>`;
        return;
    }

    container.innerHTML = matches.map(m => `
        <div class="w-full bg-white p-5 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-4">
                 <div class="flex items-center">
                    ${m.status==='Live' ? `<span class="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider animate-pulse">LIVE</span>` : `<span class="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">${new Date(m.start_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>`}
                 </div>
                 <span class="text-xs text-gray-500 font-bold uppercase tracking-wider">${m.sports.name}</span>
            </div>
            <div class="flex items-center justify-between w-full mb-4 px-2">
                <h4 class="font-bold text-lg text-gray-900 leading-tight text-left w-1/3 truncate">${m.team1_name}</h4>
                <span class="text-[10px] font-bold text-gray-300 px-2">VS</span>
                <h4 class="font-bold text-lg text-gray-900 leading-tight text-right w-1/3 truncate">${m.team2_name}</h4>
            </div>
        </div>
    `).join('');
}

// --- UTILS ---
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

function injectToastContainer() {
    if(!document.getElementById('toast-container')) {
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.className = 'fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[70] transition-all duration-300 opacity-0 pointer-events-none translate-y-10';
        div.innerHTML = `<div id="toast-content" class="bg-gray-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3"><div id="toast-icon"></div><p id="toast-msg" class="text-sm font-bold"></p></div>`;
        document.body.appendChild(div);
    }
}

function showToast(msg, type) {
    const t = document.getElementById('toast-container');
    const txt = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    
    txt.innerText = msg;
    icon.innerHTML = type === 'error' ? '<i data-lucide="alert-circle" class="w-5 h-5 text-red-400"></i>' : '<i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>';
    
    lucide.createIcons();
    t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
    setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10'), 3000);
}
