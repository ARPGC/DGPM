// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
let currentUser = null;
let currentDataList = [];
let currentUserList = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await checkAdminAuth();
    
    // Initial Loads
    loadDashboardStats();
    loadSportsForFilter();
    loadSportsForVolunteers();
    loadSportsForScheduler();
});

// --- 1. SECURITY & AUTH ---
async function checkAdminAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.href = 'admin-login.html';
        return;
    }

    const { data: user, error } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (error || !user || user.role !== 'admin') {
        alert("ACCESS DENIED: Admin privileges required.");
        await supabaseClient.auth.signOut();
        window.location.href = 'admin-login.html';
        return;
    }

    currentUser = session.user;
}

async function adminLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'admin-login.html';
}

// --- 2. NAVIGATION ---
window.switchSection = function(sectionId) {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('section-' + sectionId).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'bg-indigo-50', 'text-brand-primary');
        el.classList.add('text-gray-500');
    });
    
    const navBtn = document.getElementById('nav-' + sectionId);
    if(navBtn) {
        navBtn.classList.add('active', 'bg-indigo-50', 'text-brand-primary');
        navBtn.classList.remove('text-gray-500');
    }

    if (sectionId === 'sports') loadSportsManager();
    if (sectionId === 'volunteers') loadVolunteerList();
    if (sectionId === 'matches') fetchAdminMatches();
}

window.toggleMobileMenu = function() {
    const menu = document.getElementById('mobile-menu');
    const sidebar = document.getElementById('mobile-sidebar');
    
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        sidebar.classList.remove('translate-x-full');
    } else {
        menu.classList.add('hidden');
        sidebar.classList.add('translate-x-full');
    }
}

// --- 3. DASHBOARD ---
async function loadDashboardStats() {
    document.getElementById('dashboard-alerts').innerHTML = '<p class="text-green-600 font-bold">● System Online</p>';

    const [users, teams, regs, live] = await Promise.all([
        supabaseClient.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabaseClient.from('teams').select('id', { count: 'exact', head: true }),
        supabaseClient.from('registrations').select('id', { count: 'exact', head: true }),
        supabaseClient.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'Live')
    ]);

    document.getElementById('stat-users').innerText = users.count || 0;
    document.getElementById('stat-teams').innerText = teams.count || 0;
    document.getElementById('stat-regs').innerText = regs.count || 0;
    document.getElementById('stat-live').innerText = live.count || 0;
}

// --- 4. SPORTS MANAGER ---
async function loadSportsManager() {
    const container = document.getElementById('admin-sports-grid');
    container.innerHTML = '<p>Loading...</p>';

    const { data: sports } = await supabaseClient.from('sports').select('*').order('name');

    container.innerHTML = sports.map(s => `
        <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-gray-100 rounded-lg"><i data-lucide="${s.icon || 'trophy'}" class="w-5 h-5"></i></div>
                <div>
                    <h4 class="font-bold text-sm">${s.name}</h4>
                    <span class="text-[10px] text-gray-400 uppercase font-bold">${s.category} • ${s.type}</span>
                </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer" ${s.status === 'Open' ? 'checked' : ''} onchange="toggleSport('${s.id}', this.checked)">
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
            </label>
        </div>
    `).join('');
    lucide.createIcons();
}

window.toggleSport = async function(id, isOpen) {
    const newStatus = isOpen ? 'Open' : 'Closed';
    await supabaseClient.from('sports').update({ status: newStatus }).eq('id', id);
    showToast(`Sport ${newStatus}`, "success");
}

// --- 5. VOLUNTEER MANAGER ---
async function loadSportsForVolunteers() {
    const { data: sports } = await supabaseClient.from('sports').select('id, name');
    const select = document.getElementById('vol-sport-select');
    if(select) select.innerHTML = `<option value="">Select Assigned Sport...</option>` + sports.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

window.assignVolunteer = async function() {
    const email = document.getElementById('vol-email-input').value;
    const sportId = document.getElementById('vol-sport-select').value;

    if(!email || !sportId) return showToast("Enter email and select sport", "error");

    // 1. Find User
    const { data: user, error } = await supabaseClient.from('users').select('id').eq('email', email).single();
    
    if(error || !user) return showToast("User not found with this email", "error");

    // 2. Update Role
    const { error: updateErr } = await supabaseClient
        .from('users')
        .update({ role: 'volunteer', assigned_sport_id: sportId })
        .eq('id', user.id);

    if(updateErr) showToast("Error updating user role", "error");
    else {
        showToast("Volunteer Assigned!", "success");
        loadVolunteerList();
        document.getElementById('vol-email-input').value = '';
    }
}

async function loadVolunteerList() {
    const tbody = document.getElementById('volunteer-table-body');
    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center">Loading...</td></tr>';

    const { data: vols } = await supabaseClient
        .from('users')
        .select('*, sports:assigned_sport_id(name)')
        .eq('role', 'volunteer');

    if(!vols || vols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-400">No volunteers assigned.</td></tr>';
        return;
    }

    tbody.innerHTML = vols.map(v => `
        <tr class="border-b border-gray-100">
            <td class="px-4 py-3 font-bold">${v.first_name} ${v.last_name}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${v.email}</td>
            <td class="px-4 py-3"><span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">${v.sports?.name || 'Unknown'}</span></td>
            <td class="px-4 py-3">
                <button onclick="removeVolunteer('${v.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold">Remove</button>
            </td>
        </tr>
    `).join('');
}

window.removeVolunteer = async function(id) {
    if(!confirm("Revoke volunteer status?")) return;
    await supabaseClient.from('users').update({ role: 'student', assigned_sport_id: null }).eq('id', id);
    showToast("Volunteer Removed", "success");
    loadVolunteerList();
}

// --- 6. MATCH CENTER & AUTO-SCHEDULER ---

async function loadSportsForScheduler() {
    const { data: sports } = await supabaseClient.from('sports').select('id, name').order('name');
    const select = document.getElementById('auto-schedule-sport');
    if(select) select.innerHTML = `<option value="">Select Sport...</option>` + sports.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    // Also load manual select
    const manualSelect = document.getElementById('match-sport-select');
    if(manualSelect) manualSelect.innerHTML = `<option value="">Select Sport...</option>` + sports.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

// --- ALGORITHM 1: GENERATE ROUND 1 ---
window.generateRound1 = async function() {
    const sportId = document.getElementById('auto-schedule-sport').value;
    if(!sportId) return showToast("Select a sport first", "error");

    const btn = document.querySelector('button[onclick="generateRound1()"]');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const { data: sport } = await supabaseClient.from('sports').select('*').eq('id', sportId).single();

        // CHECK 1: RACE LOGIC
        if (sport.category.includes('race')) {
            await scheduleRaceEvent(sport);
        } 
        // CHECK 2: KNOCKOUT LOGIC
        else {
            await scheduleKnockoutRound1(sport);
        }
        
        showToast("Round 1 Generated Successfully!", "success");
        fetchAdminMatches();
    } catch (e) {
        showToast("Error: " + e.message, "error");
    } finally {
        btn.innerText = "Generate Round 1";
        btn.disabled = false;
    }
}

async function scheduleRaceEvent(sport) {
    // 1. Get ALL registered users
    const { data: regs } = await supabaseClient
        .from('registrations')
        .select('user_id, users(first_name, last_name, student_id)')
        .eq('sport_id', sport.id);

    if(!regs || regs.length === 0) throw new Error("No registrations found.");

    // 2. Format for JSON
    const participants = regs.map(r => ({
        id: r.user_id,
        name: `${r.users.first_name} ${r.users.last_name}`,
        metric: 0,
        rank: null
    }));

    // 3. Create ONE Match
    const { error } = await supabaseClient.from('matches').insert({
        sport_id: sport.id,
        round_name: 'Finals',
        race_details: participants,
        status: 'Scheduled',
        participant1_name: 'All Participants',
        participant2_name: '-'
    });

    if(error) throw error;
}

async function scheduleKnockoutRound1(sport) {
    let participants = [];

    // 1. Fetch Participants (Solo vs Team)
    if (sport.type === 'Solo') {
        const { data: regs } = await supabaseClient
            .from('registrations')
            .select('user_id, users(first_name, last_name)')
            .eq('sport_id', sport.id);
        participants = regs.map(r => ({ id: r.user_id, name: `${r.users.first_name} ${r.users.last_name}` }));
    } else {
        const { data: teams } = await supabaseClient
            .from('teams')
            .select('id, name')
            .eq('sport_id', sport.id)
            .neq('status', 'Open'); // Only take Locked/Ready teams? Let's take all for now or check logic
        participants = teams.map(t => ({ id: t.id.toString(), name: t.name }));
    }

    if(participants.length < 2) throw new Error("Not enough participants (Need 2+)");

    // 2. Shuffle
    participants = participants.sort(() => Math.random() - 0.5);

    // 3. Pair Up
    const matches = [];
    while (participants.length > 0) {
        const p1 = participants.pop();
        
        if (participants.length === 0) {
            // Odd one out -> BYE
            matches.push({
                sport_id: sport.id,
                round_name: 'Round 1',
                participant1_id: p1.id,
                participant1_name: p1.name,
                participant2_name: 'BYE',
                winner_id: p1.id, // Auto Win
                status: 'Completed',
                score1: '1',
                score2: '0'
            });
        } else {
            const p2 = participants.pop();
            matches.push({
                sport_id: sport.id,
                round_name: 'Round 1',
                participant1_id: p1.id,
                participant1_name: p1.name,
                participant2_id: p2.id,
                participant2_name: p2.name,
                status: 'Scheduled'
            });
        }
    }

    // 4. Bulk Insert
    const { error } = await supabaseClient.from('matches').insert(matches);
    if(error) throw error;
}

// --- ALGORITHM 2: GENERATE NEXT ROUND ---
window.generateNextRound = async function() {
    const sportId = document.getElementById('auto-schedule-sport').value;
    if(!sportId) return showToast("Select a sport first", "error");

    // 1. Get Winners from previous rounds who haven't played in a newer round?
    // Simplified Logic: Get all 'Completed' matches. 
    // We need to know what the "Current Round" is. 
    // This simple version assumes we just pair up ALL un-paired winners.
    
    // Better Logic:
    // Find the latest round name (e.g., "Round 1").
    // Get all winners from "Round 1".
    // Check if they are already in "Round 2".
    // If not, pair them.

    try {
        // Fetch all completed matches for this sport
        const { data: completed } = await supabaseClient
            .from('matches')
            .select('*')
            .eq('sport_id', sportId)
            .eq('status', 'Completed')
            .not('winner_id', 'is', null);

        if(!completed || completed.length === 0) throw new Error("No completed matches found to generate next round.");

        // Find the "Highest" round currently played
        // This is tricky with string names. Let's just grab ALL winners and filter those who are NOT in a scheduled/live match.
        
        const allWinners = completed.map(m => ({ id: m.winner_id, name: m.winner_id === m.participant1_id ? m.participant1_name : m.participant2_name }));
        
        // Find active matches to see who is busy
        const { data: active } = await supabaseClient
            .from('matches')
            .select('participant1_id, participant2_id')
            .eq('sport_id', sportId)
            .in('status', ['Scheduled', 'Live']);

        const busyIds = new Set();
        active.forEach(m => {
            if(m.participant1_id) busyIds.add(m.participant1_id);
            if(m.participant2_id) busyIds.add(m.participant2_id);
        });

        // Filter winners who are NOT busy
        // Unique them first (in case of duplicate data issues)
        const uniqueWinners = [...new Map(allWinners.map(item => [item.id, item])).values()];
        const eligibleCandidates = uniqueWinners.filter(w => !busyIds.has(w.id));

        if(eligibleCandidates.length < 2) throw new Error("Not enough winners ready for the next round (Need 2+). Wait for matches to finish.");

        // Determine Next Round Name (Simple Heuristic)
        const roundCount = completed.length; 
        // A better way is strictly naming rounds, but for now let's call it "Next Round"
        // Or "Round X"
        const nextRoundName = `Next Round`; 

        // PAIR THEM UP (Same logic as Round 1)
        const shuffled = eligibleCandidates.sort(() => Math.random() - 0.5);
        const newMatches = [];

        while (shuffled.length > 0) {
            const p1 = shuffled.pop();
            
            if (shuffled.length === 0) {
                // Bye
                newMatches.push({
                    sport_id: sportId,
                    round_name: nextRoundName,
                    participant1_id: p1.id,
                    participant1_name: p1.name,
                    participant2_name: 'BYE',
                    winner_id: p1.id,
                    status: 'Completed',
                    score1: '1',
                    score2: '0'
                });
            } else {
                const p2 = shuffled.pop();
                newMatches.push({
                    sport_id: sportId,
                    round_name: nextRoundName,
                    participant1_id: p1.id,
                    participant1_name: p1.name,
                    participant2_id: p2.id,
                    participant2_name: p2.name,
                    status: 'Scheduled'
                });
            }
        }

        const { error } = await supabaseClient.from('matches').insert(newMatches);
        if(error) throw error;
        
        showToast("Next Round Generated!", "success");
        fetchAdminMatches();

    } catch (e) {
        showToast(e.message, "error");
    }
}

// --- 7. MANUAL MATCH ENTRY & LISTING ---
window.toggleMatchTab = function(tab) {
    document.getElementById('view-match-schedule').classList.add('hidden');
    document.getElementById('view-match-live').classList.add('hidden');
    document.getElementById('tab-match-schedule').className = "flex-1 py-3 text-sm font-bold text-gray-400 hover:text-gray-600";
    document.getElementById('tab-match-live').className = "flex-1 py-3 text-sm font-bold text-gray-400 hover:text-gray-600";

    if (tab === 'schedule') {
        document.getElementById('view-match-schedule').classList.remove('hidden');
        document.getElementById('tab-match-schedule').className = "flex-1 py-3 text-sm font-bold text-brand-primary border-b-2 border-brand-primary bg-gray-50";
    } else {
        document.getElementById('view-match-live').classList.remove('hidden');
        document.getElementById('tab-match-live').className = "flex-1 py-3 text-sm font-bold text-brand-primary border-b-2 border-brand-primary bg-gray-50";
        fetchAdminMatches(); 
    }
}

async function fetchAdminMatches() {
    const container = document.getElementById('admin-live-matches');
    container.innerHTML = '<p class="text-center text-gray-400">Loading matches...</p>';

    const { data: matches } = await supabaseClient
        .from('matches')
        .select('*, sports(name, category)')
        .order('created_at', { ascending: false });

    if (!matches || matches.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4">No matches found.</p>';
        return;
    }

    container.innerHTML = matches.map(m => {
        const isRace = m.sports.category.includes('race');
        return `
        <div class="bg-white p-4 rounded-xl border-l-4 ${m.status === 'Live' ? 'border-red-500' : (m.status === 'Completed' ? 'border-gray-500' : 'border-blue-500')} shadow-sm mb-3">
            <div class="flex justify-between mb-2">
                <span class="text-xs font-bold uppercase text-gray-400">${m.sports.name} • ${m.round_name}</span>
                <span class="text-xs font-bold px-2 py-0.5 rounded ${m.status==='Live'?'bg-red-100 text-red-600':'bg-gray-100 text-gray-600'}">${m.status}</span>
            </div>
            
            ${isRace ? 
                `<h4 class="font-bold">Race Event (Finals)</h4><p class="text-xs text-gray-500">Managed via Volunteer Panel</p>` 
                : 
                `<div class="flex items-center justify-between gap-4">
                    <div class="flex-1"><h4 class="font-bold text-sm">${m.participant1_name}</h4></div>
                    <div class="text-brand-primary font-black">${m.score1} - ${m.score2}</div>
                    <div class="flex-1 text-right"><h4 class="font-bold text-sm">${m.participant2_name}</h4></div>
                </div>`
            }
            
            ${m.status === 'Upcoming' || m.status === 'Scheduled' ? 
                `<button onclick="deleteMatch('${m.id}')" class="mt-2 text-xs text-red-500 underline">Delete Match</button>` : ''}
        </div>
    `}).join('');
}

window.deleteMatch = async function(id) {
    if(!confirm("Delete this match?")) return;
    await supabaseClient.from('matches').delete().eq('id', id);
    fetchAdminMatches();
}

window.loadTeamsForMatch = async function(sportId) {
    if(!sportId) return;
    const { data: sport } = await supabaseClient.from('sports').select('type').eq('id', sportId).single();
    
    let options = `<option value="">Select Participant...</option>`;
    
    if (sport.type === 'Solo') {
        const { data: regs } = await supabaseClient.from('registrations').select(`user_id, users (first_name, last_name)`).eq('sport_id', sportId);
        if(regs) options += regs.map(r => `<option value="${r.user_id}|${r.users.first_name} ${r.users.last_name}">${r.users.first_name} ${r.users.last_name}</option>`).join('');
    } else {
        const { data: teams } = await supabaseClient.from('teams').select(`id, name`).eq('sport_id', sportId);
        if(teams) options += teams.map(t => `<option value="${t.id}|${t.name}">${t.name}</option>`).join('');
    }
    
    document.getElementById('match-team-a').innerHTML = options;
    document.getElementById('match-team-b').innerHTML = options;
}

window.createMatch = async function() {
    // Manual Creation Logic
    const sportId = document.getElementById('match-sport-select').value;
    const valA = document.getElementById('match-team-a').value; // ID|Name
    const valB = document.getElementById('match-team-b').value;
    const time = document.getElementById('match-time').value;
    const loc = document.getElementById('match-location').value;

    if(!sportId || !valA || !valB) return showToast("Select Sport and Participants", "error");

    const [idA, nameA] = valA.split('|');
    const [idB, nameB] = valB.split('|');

    const { error } = await supabaseClient.from('matches').insert({
        sport_id: sportId,
        participant1_id: idA,
        participant1_name: nameA,
        participant2_id: idB,
        participant2_name: nameB,
        start_time: time,
        location: loc,
        status: 'Scheduled'
    });

    if(error) showToast("Error: " + error.message, "error");
    else {
        showToast("Match Created", "success");
        document.getElementById('create-match-form').reset();
    }
}

// --- 8. USERS & DATA (EXPORTS) ---
// Kept largely same as before, just updated table references if needed.

window.fetchUsers = async function() {
    const queryText = document.getElementById('user-search').value.toLowerCase();
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading...</td></tr>';

    const { data: users } = await supabaseClient.from('users').select('*').limit(100);
    
    const filtered = users.filter(u => 
        (u.first_name + ' ' + u.last_name).toLowerCase().includes(queryText) || 
        (u.student_id || '').toLowerCase().includes(queryText)
    );
    currentUserList = filtered;

    tbody.innerHTML = filtered.map(u => `
        <tr class="border-b hover:bg-gray-50">
            <td class="px-4 py-3 font-bold">${u.first_name} ${u.last_name}<br><span class="text-xs text-gray-400">${u.email}</span></td>
            <td class="px-4 py-3">${u.student_id || '-'}</td>
            <td class="px-4 py-3">${u.class_name || '-'}</td>
            <td class="px-4 py-3">${u.mobile || '-'}</td>
            <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs font-bold ${u.role==='admin'?'bg-red-100 text-red-600':'bg-green-100 text-green-600'}">${u.role}</span></td>
        </tr>
    `).join('');
}

window.searchData = async function() {
    const query = document.getElementById('data-search').value.toLowerCase();
    const sportId = document.getElementById('filter-sport').value;
    const tbody = document.getElementById('data-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading...</td></tr>';

    let dbQuery = supabaseClient
        .from('registrations')
        .select(`*, users(first_name, last_name, student_id), sports(name, type)`)
        .limit(200);

    if (sportId) dbQuery = dbQuery.eq('sport_id', sportId);
    
    const { data: regs } = await dbQuery;
    
    const filtered = regs.filter(r => (r.users.first_name + ' ' + r.users.last_name).toLowerCase().includes(query));
    currentDataList = filtered;

    tbody.innerHTML = filtered.map(r => `
        <tr class="border-b hover:bg-gray-50">
            <td class="px-4 py-3 font-bold">${r.users.first_name} ${r.users.last_name}</td>
            <td class="px-4 py-3">${r.sports.name}</td>
            <td class="px-4 py-3 text-xs uppercase">${r.sports.type}</td>
            <td class="px-4 py-3"><span class="px-2 py-1 rounded bg-gray-100 text-xs">${r.player_status}</span></td>
            <td class="px-4 py-3 text-xs text-gray-400">View</td>
        </tr>
    `).join('');
}

window.loadSportsForFilter = async function() {
    const { data: sports } = await supabaseClient.from('sports').select('id, name');
    document.getElementById('filter-sport').innerHTML = `<option value="">All Sports</option>` + sports.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

// --- UTILS ---
function showToast(message, type) {
    const container = document.getElementById('toast-container');
    const text = document.getElementById('toast-text');
    text.innerText = message;
    container.classList.add('opacity-100', 'translate-y-0');
    container.classList.remove('opacity-0', 'translate-y-20');
    setTimeout(() => {
        container.classList.remove('opacity-100', 'translate-y-0');
        container.classList.add('opacity-0', 'translate-y-20');
    }, 3000);
}

// Export functions (PDF/Excel) remain generic wrappers around currentDataList/currentUserList using the libraries included in HTML.
window.exportUsers = function(type) {
    if(!currentUserList.length) return showToast("No data", "error");
    const data = currentUserList.map(u => ({ Name: u.first_name + ' ' + u.last_name, ID: u.student_id, Class: u.class_name, Mobile: u.mobile }));
    if(type==='excel') { const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Students"); XLSX.writeFile(wb, "Students.xlsx"); }
    else { const doc = new jspdf.jsPDF(); doc.autoTable({ head: [Object.keys(data[0])], body: data.map(Object.values) }); doc.save("Students.pdf"); }
}
window.exportData = function(type) {
    if(!currentDataList.length) return showToast("No data", "error");
    const data = currentDataList.map(r => ({ Name: r.users.first_name + ' ' + r.users.last_name, Sport: r.sports.name, Status: r.player_status }));
    if(type==='excel') { const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Regs"); XLSX.writeFile(wb, "Registrations.xlsx"); }
    else { const doc = new jspdf.jsPDF(); doc.autoTable({ head: [Object.keys(data[0])], body: data.map(Object.values) }); doc.save("Registrations.pdf"); }
}
