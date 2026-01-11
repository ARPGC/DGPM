// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
let currentUser = null;
let myRegistrations = []; // Stores Sport IDs the user has registered for
let selectedSportForReg = null;
let currentScheduleView = 'upcoming'; // 'upcoming' or 'results'
let allSportsList = []; // Cache for search

// Default Constants
const DEFAULT_TEAM_SIZE = 5;
const DEFAULT_AVATAR = "https://t4.ftcdn.net/jpg/05/89/93/27/360_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg";

// Sports that have specific "Match Details" views
const TEAM_SPORTS_WITH_VIEW = [
    'Box cricket', 'Volleyball', 'Basketball', 'Football', 
    'Rugby', 'Kho-kho', 'Tug of war', 'Kabbaddi'
];

const RACE_SPORTS_WITH_VIEW = [
    '100m race', '200m race', 'Relay race (400m)', 'Shotput', 'Long Jump'
];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    initTheme();
    await checkAuth();
    
    // Setup UI Interactions
    setupTabSystem();
    setupConfirmModal(); 
    
    // Default Tab
    window.switchTab('home');
});

// --- 1. THEME LOGIC ---
function initTheme() {
    const savedTheme = localStorage.getItem('urja-theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        updateThemeIcon(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateThemeIcon(false);
    }
}

window.toggleTheme = function() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('urja-theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const btn = document.getElementById('btn-theme-toggle');
    if(btn) {
        btn.innerHTML = isDark 
            ? '<i data-lucide="sun" class="w-5 h-5 text-yellow-400"></i>' 
            : '<i data-lucide="moon" class="w-5 h-5 text-gray-600 dark:text-gray-300"></i>';
        lucide.createIcons();
    }
}

// --- 2. AUTHENTICATION & PROFILE ---
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    
    // Fetch Full Profile
    const { data: profile, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error || !profile) {
        // Force logout if profile is missing
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return;
    }

    currentUser = profile;
    updateProfileUI();
    await fetchMyRegistrations();
    loadUserStats(); // Load stats for Home Screen
}

function updateProfileUI() {
    const avatarUrl = currentUser.avatar_url || DEFAULT_AVATAR;
    
    // Update Header Avatar
    const headerImg = document.getElementById('header-avatar');
    if(headerImg) headerImg.src = avatarUrl;

    // Update Profile Tab Info
    const imgEl = document.getElementById('profile-img');
    const nameEl = document.getElementById('profile-name');
    const detailsEl = document.getElementById('profile-details');

    if(imgEl) imgEl.src = avatarUrl;
    if(nameEl) nameEl.innerText = `${currentUser.first_name} ${currentUser.last_name}`;
    if(detailsEl) detailsEl.innerText = `${currentUser.class_name || 'N/A'} • ${currentUser.student_id || 'N/A'}`;
    
    // Mobile Number Warning
    if(!currentUser.mobile) {
        showToast("⚠️ Add Mobile Number in Profile Settings", "error");
    }
}

async function fetchMyRegistrations() {
    const { data } = await supabaseClient.from('registrations').select('sport_id').eq('user_id', currentUser.id);
    if(data) {
        myRegistrations = data.map(r => r.sport_id);
    }
}

async function loadUserStats() {
    // Basic stats calculation (Mock logic for now, or fetch from real tables)
    // Real implementation would count rows in 'registrations' where status='Won'
    
    const { count: matches } = await supabaseClient
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .in('player_status', ['Playing', 'Played', 'Won']);

    const { count: wins } = await supabaseClient
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('player_status', 'Won');

    document.getElementById('stat-matches-played').innerText = matches || 0;
    document.getElementById('stat-wins').innerText = wins || 0;
}

window.logout = async function() {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html'; // Go back to Landing Page
}

// --- 3. NAVIGATION ---
function setupTabSystem() {
    window.switchTab = function(tabId) {
        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        
        // Show target view
        const targetView = document.getElementById('view-' + tabId);
        if(targetView) {
            targetView.classList.remove('hidden');
            // Re-trigger animation
            targetView.classList.remove('animate-fade-in');
            void targetView.offsetWidth; 
            targetView.classList.add('animate-fade-in');
        }
        
        // Update Bottom Nav
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active', 'text-brand-primary');
            el.classList.add('text-gray-400', 'dark:text-gray-500');
        });
        
        const activeNav = document.getElementById('nav-' + tabId);
        if(activeNav) {
            activeNav.classList.add('active', 'text-brand-primary');
            activeNav.classList.remove('text-gray-400', 'dark:text-gray-500');
        }

        // Specific Tab Logic
        if(tabId === 'register') window.toggleRegisterView('new');
        if(tabId === 'teams') window.toggleTeamView('marketplace');
        if(tabId === 'schedule') window.filterSchedule('upcoming');
        if(tabId === 'profile') window.loadProfileGames();
    }
}

// --- 4. SCHEDULE MODULE ---

window.filterSchedule = function(view) {
    currentScheduleView = view;
    
    const btnUpcoming = document.getElementById('btn-schedule-upcoming');
    const btnResults = document.getElementById('btn-schedule-results');
    
    const activeClass = "bg-white dark:bg-gray-700 rounded shadow-sm text-brand-primary dark:text-white font-bold";
    const inactiveClass = "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200";

    if(view === 'upcoming') {
        btnUpcoming.className = `px-4 py-1.5 transition-all ${activeClass}`;
        btnResults.className = `px-4 py-1.5 transition-all ${inactiveClass}`;
    } else {
        btnUpcoming.className = `px-4 py-1.5 transition-all ${inactiveClass}`;
        btnResults.className = `px-4 py-1.5 transition-all ${activeClass}`;
    }

    loadSchedule();
}

async function loadSchedule() {
    const container = document.getElementById('schedule-list');
    
    container.className = 'flex flex-col items-center justify-center py-20 text-center';
    container.innerHTML = '<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>';

    const { data: matches } = await supabaseClient
        .from('matches')
        .select('*, sports(name, icon, type)')
        .order('start_time', { ascending: true });

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <i data-lucide="calendar-off" class="w-8 h-8 text-gray-400"></i>
            </div>
            <p class="text-gray-400 font-medium">No matches found.</p>`;
        lucide.createIcons();
        return;
    }

    let filteredMatches = [];
    if(currentScheduleView === 'upcoming') {
        filteredMatches = matches.filter(m => 
            m.status === 'Upcoming' || 
            m.status === 'Scheduled' || 
            m.status === 'Live' || 
            m.is_live === true
        );
    } else {
        filteredMatches = matches.filter(m => m.status === 'Completed' || m.status === 'Finished');
    }

    if (filteredMatches.length === 0) {
        container.innerHTML = `<p class="text-gray-400 font-medium">No ${currentScheduleView} matches.</p>`;
        return;
    }

    container.className = 'space-y-4 pb-24'; 

    container.innerHTML = filteredMatches.map(m => {
        const isLive = m.is_live === true || m.status === 'Live';
        const sportName = m.sports.name;
        
        // --- VIEWABLE CHECK ---
        const isViewable = TEAM_SPORTS_WITH_VIEW.includes(sportName) || RACE_SPORTS_WITH_VIEW.includes(sportName);

        // --- TIME FORMATTING ---
        const dateObj = new Date(m.start_time);
        const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dateStr = dateObj.toLocaleDateString([], {month: 'short', day: 'numeric'});

        let badgeHtml = isLive 
            ? `<span class="bg-indigo-50 dark:bg-indigo-900/40 text-brand-primary dark:text-indigo-300 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider animate-pulse">LIVE NOW</span>`
            : `<span class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">${dateStr} • ${timeStr}</span>`;

        const scoreDisplay = `${m.score1 || 0} - ${m.score2 || 0}`;

        return `
        <div 
            onclick="${isViewable ? `window.openMatchDetails('${m.id}')` : ''}"
            class="w-full bg-white dark:bg-gray-800 rounded-3xl border-2 border-brand-primary/60 dark:border-indigo-500/50 p-5 shadow-sm relative overflow-hidden ${isViewable ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}"
        >
            <div class="flex justify-between items-start mb-6">
                ${badgeHtml}
                <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">${m.location || 'Main Ground'}</span>
            </div>
            <div class="flex items-center justify-between w-full mb-6">
                <div class="flex-1 text-center">
                    <h4 class="font-black text-lg text-gray-800 dark:text-white leading-tight break-words">${m.participant1_name || 'TBA'}</h4>
                </div>
                <div class="shrink-0 flex flex-col items-center px-2">
                    <span class="text-[10px] font-bold text-gray-300 mb-1">VS</span>
                    <span class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-[10px] font-bold px-4 py-1 rounded-full uppercase truncate max-w-[100px]">${sportName}</span>
                </div>
                <div class="flex-1 text-center">
                    <h4 class="font-black text-lg text-gray-800 dark:text-white leading-tight break-words">${m.participant2_name || 'TBA'}</h4>
                </div>
            </div>
            <div class="border-t border-gray-100 dark:border-gray-700 pt-3 flex justify-between items-center">
                <span class="font-mono text-sm text-brand-primary dark:text-indigo-400 font-bold tracking-widest">Score: ${scoreDisplay}</span>
                ${isViewable ? '<span class="text-[10px] font-bold text-gray-400 flex items-center gap-1">Details <i data-lucide="chevron-right" class="w-3 h-3"></i></span>' : ''}
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

// --- 5. MATCH DETAILS MODAL ---
window.openMatchDetails = async function(matchId) {
    const { data: match } = await supabaseClient.from('matches').select('*, sports(name)').eq('id', matchId).single();
    if(!match) return;

    const sportName = match.sports.name;
    const isTeamSport = TEAM_SPORTS_WITH_VIEW.includes(sportName);
    const isRaceSport = RACE_SPORTS_WITH_VIEW.includes(sportName);

    // Populate Header
    document.getElementById('md-sport-name').innerText = sportName;
    document.getElementById('md-match-status').innerText = match.status;

    // Reset Views
    document.getElementById('md-layout-team').classList.add('hidden');
    document.getElementById('md-layout-race').classList.add('hidden');

    if (isTeamSport) {
        document.getElementById('md-layout-team').classList.remove('hidden');
        
        document.getElementById('md-t1-name').innerText = match.participant1_name;
        document.getElementById('md-t2-name').innerText = match.participant2_name;
        document.getElementById('md-t1-score').innerText = match.score1 || '0';
        document.getElementById('md-t2-score').innerText = match.score2 || '0';
        
        document.getElementById('md-list-t1-title').innerText = match.participant1_name;
        document.getElementById('md-list-t2-title').innerText = match.participant2_name;

        // Try to fetch squads if names correspond to Team IDs or Names
        // This is complex if names are just text. Assuming team names match DB.
        loadSquadList(match.participant1_name, match.sport_id, 'md-list-t1');
        loadSquadList(match.participant2_name, match.sport_id, 'md-list-t2');

    } else if (isRaceSport) {
        document.getElementById('md-layout-race').classList.remove('hidden');
        
        const isThrow = sportName.includes('Shotput') || sportName.includes('Jump');
        document.getElementById('md-race-metric-header').innerText = isThrow ? 'Distance' : 'Time';

        const tbody = document.getElementById('md-race-tbody');
        tbody.innerHTML = '';
        
        let results = match.race_details || [];
        
        if (!results || results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400 italic">No results data available yet.</td></tr>';
        } else {
            // Sort by Rank
            results.sort((a, b) => (a.rank || 999) - (b.rank || 999));

            tbody.innerHTML = results.map(r => `
                <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                    <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        ${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : (r.rank || '-')}
                    </td>
                    <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                        ${r.name || 'Unknown'}
                    </td>
                    <td class="px-4 py-3 text-right font-mono font-bold text-brand-primary">
                        ${r.metric || '-'}
                    </td>
                </tr>
            `).join('');
        }
    }

    document.getElementById('modal-match-details').classList.remove('hidden');
}

// Helper: Load Squad List by Team Name
async function loadSquadList(teamName, sportId, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<p class="text-xs text-gray-400 italic">Loading...</p>';

    const { data: teamData } = await supabaseClient
        .from('teams')
        .select('id')
        .eq('name', teamName)
        .eq('sport_id', sportId)
        .single();

    if (!teamData) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic">Squad details unavailable.</p>';
        return;
    }

    const { data: members } = await supabaseClient
        .from('team_members')
        .select('users(first_name, last_name, class_name)')
        .eq('team_id', teamData.id)
        .eq('status', 'Accepted'); 

    if (!members || members.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic">No members found.</p>';
        return;
    }

    container.innerHTML = members.map(m => `
        <div class="flex justify-between items-center text-xs border-b border-gray-100 dark:border-gray-600 pb-1 last:border-0">
            <span class="text-gray-700 dark:text-gray-300 font-medium">${m.users.first_name} ${m.users.last_name}</span>
            <span class="text-gray-400 text-[10px]">${m.users.class_name || ''}</span>
        </div>
    `).join('');
}

// --- 6. TEAMS MODULE ---
window.toggleTeamView = function(view) {
    document.getElementById('team-marketplace').classList.add('hidden');
    document.getElementById('team-locker').classList.add('hidden');
    
    const btnMarket = document.getElementById('btn-team-market');
    const btnLocker = document.getElementById('btn-team-locker');
    
    btnMarket.className = "flex-1 py-2 text-gray-500 dark:text-gray-400 transition-all";
    btnLocker.className = "flex-1 py-2 text-gray-500 dark:text-gray-400 transition-all";

    if(view === 'marketplace') {
        document.getElementById('team-marketplace').classList.remove('hidden');
        btnMarket.className = "flex-1 py-2 rounded shadow-sm bg-white dark:bg-gray-700 text-brand-primary dark:text-white transition-all font-bold";
        loadTeamSportsFilter().then(() => window.loadTeamMarketplace());
    } else {
        document.getElementById('team-locker').classList.remove('hidden');
        btnLocker.className = "flex-1 py-2 rounded shadow-sm bg-white dark:bg-gray-700 text-brand-primary dark:text-white transition-all font-bold";
        window.loadTeamLocker();
    }
}

async function loadTeamSportsFilter() {
    const select = document.getElementById('team-sport-filter');
    if (!select || select.children.length > 1) return;

    const { data: sports } = await supabaseClient.from('sports').select('id, name').eq('type', 'Team').eq('status', 'Open');
    if (sports && sports.length > 0) {
        select.innerHTML = `<option value="all">All Sports</option>`;
        sports.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = s.name;
            select.appendChild(opt);
        });
    }
}

window.loadTeamMarketplace = async function() {
    const container = document.getElementById('marketplace-list');
    container.innerHTML = '<p class="text-center text-gray-400 py-10">Scanning available squads...</p>';

    const filterVal = document.getElementById('team-sport-filter').value;

    let query = supabaseClient
        .from('teams')
        .select(`*, sports(name, team_size), captain:users!captain_id(first_name, gender)`)
        .eq('status', 'Open')
        .order('created_at', { ascending: false });

    if(filterVal !== 'all') query = query.eq('sport_id', filterVal);

    const { data: teams } = await query;

    if (!teams) {
         container.innerHTML = '<p class="text-center text-gray-400 py-10">Error loading teams.</p>';
         return;
    }

    // Filter by Gender (Teams are usually single gender)
    const validTeams = teams.filter(t => t.captain?.gender === currentUser.gender);

    if(!validTeams.length) {
        container.innerHTML = '<p class="text-center text-gray-400 py-10">No open teams available for your category.</p>';
        return;
    }

    const teamPromises = validTeams.map(async (t) => {
        const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id).eq('status', 'Accepted');
        const max = t.sports.team_size || DEFAULT_TEAM_SIZE;
        const seatsLeft = max - (count || 0);
        return { ...t, seatsLeft };
    });

    const teamsWithCounts = await Promise.all(teamPromises);

    container.innerHTML = teamsWithCounts.map(t => `
        <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-3">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="text-[10px] font-bold bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-300 uppercase">${t.sports.name}</span>
                    <h4 class="font-bold text-lg text-gray-900 dark:text-white mt-1">${t.name}</h4>
                    <p class="text-xs text-gray-400">Capt: ${t.captain.first_name}</p>
                </div>
                <div class="text-center">
                    <span class="block text-xl font-black ${t.seatsLeft > 0 ? 'text-brand-primary' : 'text-red-500'}">${t.seatsLeft}</span>
                    <span class="text-[9px] text-gray-400 uppercase font-bold">Seats Left</span>
                </div>
            </div>
            <button onclick="window.viewSquadAndJoin('${t.id}', '${t.sports.name}')" class="w-full py-3 bg-black dark:bg-white dark:text-black text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-transform hover:opacity-90">
                View Squad & Join
            </button>
        </div>
    `).join('');
}

window.viewSquadAndJoin = async function(teamId, sportName) {
    const sportId = await getSportIdByName(sportName);
    
    // Check if Registered for Sport First
    if(!myRegistrations.includes(sportId)) return showToast(`⚠️ You must Register for ${sportName} first!`, "error");

    // Check if Already in a team for this sport
    const { data: existingTeam } = await supabaseClient.from('team_members')
        .select('team_id, teams!inner(sport_id)')
        .eq('user_id', currentUser.id)
        .eq('teams.sport_id', sportId);
    
    if(existingTeam && existingTeam.length > 0) return showToast(`❌ You already joined a ${sportName} team.`, "error");

    // Fetch Squad
    const { data: members } = await supabaseClient.from('team_members').select('status, users(first_name, last_name, class_name)').eq('team_id', teamId).eq('status', 'Accepted');

    const list = document.getElementById('view-squad-list');
    list.innerHTML = members.map(m => `
        <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <span class="text-sm font-bold text-gray-800 dark:text-white">${m.users.first_name} ${m.users.last_name}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">${m.users.class_name || 'N/A'}</span>
        </div>
    `).join('');

    document.getElementById('btn-confirm-join').onclick = () => sendJoinRequest(teamId);
    document.getElementById('modal-view-squad').classList.remove('hidden');
}

async function sendJoinRequest(teamId) {
    const { error } = await supabaseClient.from('team_members').insert({ team_id: teamId, user_id: currentUser.id, status: 'Pending' });
    if(error) showToast("Error: " + error.message, "error");
    else {
        showToast("Request Sent to Captain!", "success");
        window.closeModal('modal-view-squad');
    }
}

window.loadTeamLocker = async function() {
    const container = document.getElementById('locker-list');
    container.innerHTML = '<p class="text-center text-gray-400 py-10">Loading your teams...</p>';

    const { data: memberships } = await supabaseClient
        .from('team_members')
        .select(`status, teams (id, name, status, captain_id, sports(name))`)
        .eq('user_id', currentUser.id);

    if(!memberships || memberships.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-10">You are not in any teams.</p>';
        return;
    }

    container.innerHTML = memberships.map(m => {
        const t = m.teams;
        const isCaptain = t.captain_id === currentUser.id;
        const isLocked = t.status === 'Locked';
        
        return `
        <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-3 transition-colors">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h4 class="font-bold text-lg text-gray-900 dark:text-white">${t.name}</h4>
                    <p class="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">${t.sports.name} • ${t.status}</p>
                </div>
                ${isCaptain ? '<span class="text-[10px] bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-700 font-bold">CAPTAIN</span>' : ''}
            </div>
            
            <div class="flex gap-2 mt-4">
                ${isCaptain ? 
                    `<button onclick="window.openManageTeamModal('${t.id}', '${t.name}', ${isLocked})" class="flex-1 py-2 bg-brand-primary text-white text-xs font-bold rounded-lg shadow-md">Manage Team</button>
                     ${!isLocked ? `<button onclick="window.promptDeleteTeam('${t.id}')" class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}`
                : 
                    `<div class="w-full py-2 bg-gray-100 dark:bg-gray-700 text-center rounded-lg text-xs font-bold text-gray-500 dark:text-gray-400">Status: ${m.status}</div>`
                }
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

// --- 7. TEAM MANAGEMENT (FOR CAPTAINS) ---
window.openManageTeamModal = async function(teamId, teamName, isLocked) {
    document.getElementById('manage-team-title').innerText = "Manage: " + teamName;
    
    const { data: pending } = await supabaseClient.from('team_members').select('id, users(first_name, last_name)').eq('team_id', teamId).eq('status', 'Pending');
    const reqList = document.getElementById('manage-requests-list');
    reqList.innerHTML = (!pending || pending.length === 0) ? '<p class="text-xs text-gray-400 italic">No pending requests.</p>' : pending.map(p => `
        <div class="flex justify-between items-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800 mb-1">
            <span class="text-xs font-bold text-gray-800 dark:text-white">${p.users.first_name} ${p.users.last_name}</span>
            <div class="flex gap-1">
                <button onclick="window.handleRequest('${p.id}', 'Accepted', '${teamId}')" class="p-1 bg-green-500 text-white rounded"><i data-lucide="check" class="w-3 h-3"></i></button>
                <button onclick="window.handleRequest('${p.id}', 'Rejected', '${teamId}')" class="p-1 bg-red-500 text-white rounded"><i data-lucide="x" class="w-3 h-3"></i></button>
            </div>
        </div>`).join('');

    const { data: members } = await supabaseClient.from('team_members').select('id, user_id, users(first_name, last_name)').eq('team_id', teamId).eq('status', 'Accepted');
    const memList = document.getElementById('manage-members-list');
    memList.innerHTML = members.map(m => `
        <div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg mb-1">
            <span class="text-xs font-bold text-gray-800 dark:text-white ${m.user_id === currentUser.id ? 'text-brand-primary' : ''}">
                ${m.users.first_name} ${m.users.last_name} ${m.user_id === currentUser.id ? '(You)' : ''}
            </span>
            ${m.user_id !== currentUser.id && !isLocked ? `<button onclick="window.removeMember('${m.id}', '${teamId}')" class="text-red-500"><i data-lucide="trash" class="w-3 h-3"></i></button>` : ''}
        </div>`).join('');

    // Dynamic Lock Button
    const oldLock = document.getElementById('btn-lock-dynamic');
    if(oldLock) oldLock.remove();

    if (!isLocked) {
         const lockBtn = document.createElement('button');
         lockBtn.id = 'btn-lock-dynamic';
         lockBtn.className = "w-full py-3 mt-4 mb-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-xl text-xs border border-red-100 dark:border-red-900 flex items-center justify-center gap-2";
         lockBtn.innerHTML = '<i data-lucide="lock" class="w-3 h-3"></i> LOCK TEAM PERMANENTLY';
         lockBtn.onclick = () => window.promptLockTeam(teamId);
         memList.parentElement.parentElement.insertBefore(lockBtn, memList.parentElement.nextElementSibling);
    }
    lucide.createIcons();
    document.getElementById('modal-manage-team').classList.remove('hidden');
}

window.handleRequest = async function(memberId, status, teamId) {
    if(status === 'Rejected') await supabaseClient.from('team_members').delete().eq('id', memberId);
    else await supabaseClient.from('team_members').update({ status: 'Accepted' }).eq('id', memberId);
    
    const tName = document.getElementById('manage-team-title').innerText.replace("Manage: ", "");
    window.openManageTeamModal(teamId, tName, false);
}

window.promptLockTeam = async function(teamId) {
    const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'Accepted');
    const { data } = await supabaseClient.from('teams').select('sports(team_size, name)').eq('id', teamId).single();
    
    const required = data?.sports?.team_size || DEFAULT_TEAM_SIZE;
    
    if(count < required) return showToast(`⚠️ Squad incomplete! Need ${required} players.`, "error");

    showConfirmDialog("Lock Team?", "⚠️ This is FINAL. No members can be added/removed.", async () => {
        await supabaseClient.from('teams').update({ status: 'Locked' }).eq('id', teamId);
        showToast("Team Locked!", "success");
        window.closeModal('modal-manage-team');
        window.closeModal('modal-confirm');
        window.loadTeamLocker();
    });
}

window.promptDeleteTeam = function(teamId) {
    showConfirmDialog("Delete Team?", "Are you sure? This cannot be undone.", async () => {
        await supabaseClient.from('team_members').delete().eq('team_id', teamId);
        await supabaseClient.from('teams').delete().eq('id', teamId);
        showToast("Team Deleted", "success");
        window.closeModal('modal-confirm');
        window.loadTeamLocker();
    });
}

window.removeMember = function(memberId, teamId) {
    showConfirmDialog("Remove Player?", "Are you sure?", async () => {
        await supabaseClient.from('team_members').delete().eq('id', memberId);
        window.closeModal('modal-confirm');
        const tName = document.getElementById('manage-team-title').innerText.replace("Manage: ", "");
        window.openManageTeamModal(teamId, tName, false);
    });
}

window.openCreateTeamModal = async function() {
    const { data } = await supabaseClient.from('sports').select('*').eq('type', 'Team').eq('status', 'Open');
    document.getElementById('new-team-sport').innerHTML = data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    document.getElementById('modal-create-team').classList.remove('hidden');
}

window.createTeam = async function() {
    const name = document.getElementById('new-team-name').value;
    const sportId = document.getElementById('new-team-sport').value;
    
    if(!name) return showToast("Enter Team Name", "error");
    if(!myRegistrations.includes(parseInt(sportId)) && !myRegistrations.includes(sportId)) return showToast("⚠️ Register for this sport first!", "error");
    
    const { data: existing } = await supabaseClient.from('team_members').select('team_id, teams!inner(sport_id)').eq('user_id', currentUser.id).eq('teams.sport_id', sportId);
    if(existing && existing.length > 0) return showToast("❌ You already have a team for this sport.", "error");

    const { data: team, error } = await supabaseClient.from('teams').insert({ name: name, sport_id: sportId, captain_id: currentUser.id, status: 'Open' }).select().single();

    if(error) showToast(error.message, "error");
    else {
        await supabaseClient.from('team_members').insert({ team_id: team.id, user_id: currentUser.id, status: 'Accepted' });
        showToast("Team Created!", "success");
        window.closeModal('modal-create-team');
        window.toggleTeamView('locker');
    }
}

// --- 8. REGISTRATION MODULE ---

window.toggleRegisterView = function(view) {
    document.getElementById('reg-section-new').classList.add('hidden');
    document.getElementById('reg-section-history').classList.add('hidden');
    
    const btnNew = document.getElementById('btn-reg-new');
    const btnHist = document.getElementById('btn-reg-history');
    
    btnNew.className = "flex-1 py-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-all";
    btnHist.className = "flex-1 py-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-all";

    if(view === 'new') {
        document.getElementById('reg-section-new').classList.remove('hidden');
        btnNew.className = "flex-1 py-3 rounded-lg shadow-sm bg-white dark:bg-gray-700 text-brand-primary dark:text-white transition-all font-bold";
        window.loadSportsDirectory();
    } else {
        document.getElementById('reg-section-history').classList.remove('hidden');
        btnHist.className = "flex-1 py-3 rounded-lg shadow-sm bg-white dark:bg-gray-700 text-brand-primary dark:text-white transition-all font-bold";
        window.loadRegistrationHistory('history-list');
    }
}

window.loadSportsDirectory = async function() {
    const container = document.getElementById('sports-list');
    if(container.children.length > 0 && allSportsList.length > 0) return; // Cached

    container.innerHTML = '<div class="col-span-2 text-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto"></div></div>';

    const { data: sports } = await supabaseClient.from('sports').select('*').eq('status', 'Open').order('name');
    allSportsList = sports || [];
    renderSportsList(allSportsList);
}

function renderSportsList(list) {
    const container = document.getElementById('sports-list');
    
    if(!list || list.length === 0) {
        container.innerHTML = '<p class="col-span-2 text-center text-gray-400">No sports found.</p>';
        return;
    }

    container.innerHTML = list.map(s => {
        const isReg = myRegistrations.includes(s.id);
        const btnClass = isReg 
            ? "bg-green-100 dark:bg-green-900/30 text-green-600 border border-green-200 dark:border-green-800 cursor-not-allowed" 
            : "bg-black dark:bg-white text-white dark:text-black shadow-lg hover:opacity-90";
        
        return `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group">
            <div class="absolute -right-4 -top-4 w-20 h-20 bg-gray-50 dark:bg-gray-700 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            
            <div class="relative z-10">
                <div class="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-2 text-brand-primary dark:text-white">
                    <i data-lucide="${s.icon || 'trophy'}" class="w-4 h-4"></i>
                </div>
                <h4 class="font-bold text-md leading-tight text-gray-900 dark:text-white">${s.name}</h4>
                <p class="text-[10px] uppercase font-bold text-gray-400 mt-1">${s.type} Sport</p>
            </div>

            <button onclick="${isReg ? '' : `window.openRegistrationModal('${s.id}')`}" class="relative z-10 w-full py-2 rounded-lg text-xs font-bold transition-all ${btnClass}" ${isReg ? 'disabled' : ''}>
                ${isReg ? '<i data-lucide="check" class="w-3 h-3 inline mr-1"></i> Registered' : 'Register Now'}
            </button>
        </div>`;
    }).join('');
    lucide.createIcons();
}

window.filterSports = function() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const filtered = allSportsList.filter(s => s.name.toLowerCase().includes(query));
    renderSportsList(filtered);
}

window.loadRegistrationHistory = async function(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<p class="text-center text-gray-400 py-10">Loading history...</p>';

    // FETCH PLAYER_STATUS
    const { data: regs } = await supabaseClient
        .from('registrations')
        .select(`created_at, player_status, sports (name, icon, type)`)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if(!regs || regs.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-6">You haven\'t registered for any events yet.</p>';
        return;
    }

    container.innerHTML = regs.map(r => {
        // Status Logic
        const status = r.player_status || 'Registered';
        let statusColor = 'bg-gray-100 text-gray-500'; // Default
        if(status === 'Won') statusColor = 'bg-yellow-100 text-yellow-700 border-yellow-200';
        else if(status === 'Playing') statusColor = 'bg-blue-100 text-blue-700 border-blue-200';
        else if(status === 'Scheduled') statusColor = 'bg-purple-100 text-purple-700 border-purple-200';

        return `
        <div class="flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm mb-2">
            <div class="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-brand-primary dark:text-white shrink-0">
                <i data-lucide="${r.sports.icon || 'trophy'}" class="w-5 h-5"></i>
            </div>
            <div class="flex-1">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-sm text-gray-900 dark:text-white">${r.sports.name}</h4>
                    <span class="text-[9px] font-bold px-2 py-0.5 rounded border ${statusColor} uppercase">${status}</span>
                </div>
                <p class="text-xs text-gray-400 font-medium mt-0.5">${r.sports.type} • ${new Date(r.created_at).toLocaleDateString()}</p>
            </div>
        </div>
    `}).join('');
    lucide.createIcons();
}

// 9. SETTINGS/PROFILE EDIT
window.loadProfileGames = function() {
    window.loadRegistrationHistory('my-registrations-list');
}

window.openSettingsModal = function() {
    document.getElementById('edit-fname').value = currentUser.first_name || '';
    document.getElementById('edit-lname').value = currentUser.last_name || '';
    document.getElementById('edit-email').value = currentUser.email || '';
    document.getElementById('edit-mobile').value = currentUser.mobile || '';
    document.getElementById('edit-class').value = currentUser.class_name || 'FY';
    document.getElementById('edit-gender').value = currentUser.gender || 'Male';
    document.getElementById('edit-sid').value = currentUser.student_id || '';
    document.getElementById('modal-settings').classList.remove('hidden');
}

window.updateProfile = async function() {
    const updates = {
        first_name: document.getElementById('edit-fname').value,
        last_name: document.getElementById('edit-lname').value,
        mobile: document.getElementById('edit-mobile').value,
        class_name: document.getElementById('edit-class').value,
        student_id: document.getElementById('edit-sid').value,
        gender: document.getElementById('edit-gender').value
    };

    if(!updates.first_name || !updates.last_name) return showToast("Name is required", "error");

    const { error } = await supabaseClient.from('users').update(updates).eq('id', currentUser.id);

    if(error) showToast("Error updating profile", "error");
    else {
        Object.assign(currentUser, updates);
        updateProfileUI();
        window.closeModal('modal-settings');
        showToast("Profile Updated!", "success");
    }
}

// --- UTILS ---
async function getSportIdByName(name) {
    const { data } = await supabaseClient.from('sports').select('id').eq('name', name).single();
    return data?.id;
}

window.closeModal = id => document.getElementById(id).classList.add('hidden');

window.showToast = function(msg, type='info') {
    const t = document.getElementById('toast-container');
    const msgEl = document.getElementById('toast-msg');
    const iconEl = document.getElementById('toast-icon');
    
    msgEl.innerText = msg;
    
    if (type === 'error') iconEl.innerHTML = '<i data-lucide="alert-triangle" class="w-5 h-5 text-yellow-500"></i>';
    else iconEl.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i>';
    
    lucide.createIcons();
    t.classList.remove('opacity-0', 'pointer-events-none');
    t.classList.add('translate-y-0');
    t.classList.remove('translate-y-20');
    
    setTimeout(() => {
        t.classList.add('opacity-0', 'pointer-events-none');
        t.classList.remove('translate-y-0');
        t.classList.add('translate-y-20');
    }, 3000);
}

let confirmCallback = null;
function setupConfirmModal() {
    document.getElementById('btn-confirm-yes').onclick = () => confirmCallback && confirmCallback();
    document.getElementById('btn-confirm-cancel').onclick = () => { window.closeModal('modal-confirm'); confirmCallback = null; };
}

function showConfirmDialog(title, msg, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = msg;
    confirmCallback = onConfirm;
    document.getElementById('modal-confirm').classList.remove('hidden');
}

// --- REGISTRATION MODAL LOGIC ---
window.openRegistrationModal = async function(id) {
    const { data: sport } = await supabaseClient.from('sports').select('*').eq('id', id).single();
    selectedSportForReg = sport;
    
    document.getElementById('reg-modal-sport-name').innerText = sport.name;
    document.getElementById('reg-modal-sport-name-span').innerText = sport.name;
    document.getElementById('reg-modal-user-name').innerText = `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('reg-modal-user-details').innerText = `${currentUser.class_name || 'N/A'} • ${currentUser.student_id || 'N/A'}`;
    document.getElementById('reg-mobile').value = currentUser.mobile || ''; 
    document.getElementById('modal-register').classList.remove('hidden');
}

window.confirmRegistration = async function() {
    const btn = document.querySelector('#modal-register button[type="button"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Registering...";

    // Mobile Check
    if(!currentUser.mobile) {
        const phone = prompt("⚠️ Mobile number is required. Please enter yours:");
        if(!phone || phone.length < 10) {
            btn.disabled = false;
            btn.innerText = originalText;
            return showToast("Invalid Mobile Number", "error");
        }
        await supabaseClient.from('users').update({mobile: phone}).eq('id', currentUser.id);
        currentUser.mobile = phone; 
    }

    // DB Call
    const { error } = await supabaseClient.from('registrations').insert({
        user_id: currentUser.id,
        sport_id: selectedSportForReg.id
    });

    if(error) {
        btn.disabled = false;
        btn.innerText = originalText;
        showToast("Error: " + error.message, "error");
    }
    else {
        if (!myRegistrations.includes(selectedSportForReg.id)) {
            myRegistrations.push(selectedSportForReg.id);
        }

        showToast("Registration Successful!", "success");
        window.closeModal('modal-register');
        
        btn.disabled = false;
        btn.innerText = originalText;

        // Force UI Update
        renderSportsList(allSportsList);
    }
}
