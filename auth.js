// --- CONFIGURATION ---
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Check
    if (localStorage.getItem('urja-theme') === 'dark' || (!localStorage.getItem('urja-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    // 2. Check Session (Only if on login page to prevent loops)
    if (window.location.pathname.includes('login.html')) {
        checkSession();
    }
});

// --- 1. SESSION CHECK & REDIRECT ---
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        // User is already logged in, fetch role and redirect
        await redirectUserBasedOnRole(session.user.id);
    }
}

async function redirectUserBasedOnRole(userId) {
    toggleLoading(true);
    
    const { data: user, error } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (error || !user) {
        // Error fetching role, maybe force logout?
        console.error("Role fetch error:", error);
        toggleLoading(false);
        return;
    }

    // SMART REDIRECT LOGIC
    switch (user.role) {
        case 'admin':
            window.location.href = 'admin.html';
            break;
        case 'volunteer':
            window.location.href = 'volunteer.html';
            break;
        case 'student':
        default:
            window.location.href = 'student.html'; // Renamed from index.html
            break;
    }
}

// --- 2. LOGIN LOGIC ---
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;

    toggleLoading(true);

    // 1. Authenticate
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        toggleLoading(false);
        showToast(error.message, 'error');
        return;
    }

    // 2. Fetch Role & Redirect
    if (data.session) {
        await redirectUserBasedOnRole(data.session.user.id);
    }
}

// --- 3. SIGNUP LOGIC (Students Only) ---
async function handleSignup(e) {
    e.preventDefault();

    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-pass').value;
    const mobile = document.getElementById('reg-mobile').value;

    // Basic Validation
    if(mobile.length < 10) {
        showToast("Please enter a valid 10-digit mobile number", 'error');
        return;
    }

    const metaData = {
        first_name: document.getElementById('reg-fname').value,
        last_name: document.getElementById('reg-lname').value,
        student_id: document.getElementById('reg-sid').value,
        course: document.getElementById('reg-course').value, 
        class_name: document.getElementById('reg-class').value,
        gender: document.getElementById('reg-gender').value,
        mobile: mobile,
        role: 'student' // Force role to student for public signups
    };

    toggleLoading(true);

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { data: metaData }
    });

    toggleLoading(false);

    if (error) {
        showToast(error.message, 'error');
    } else {
        // Supabase usually logs them in automatically after signup if email confirm is off
        // Or waits for email confirmation.
        if (data.session) {
            showToast("Registration Successful! Redirecting...", 'success');
            setTimeout(() => {
                window.location.href = 'student.html';
            }, 1500);
        } else {
            // Email confirmation required
            showToast("Registration Successful! Please check your email.", 'success');
            switchAuthView('login');
        }
    }
}

// --- 4. FORGOT PASSWORD ---
async function handleForgotPass(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;

    toggleLoading(true);

    // Redirect back to login page after password reset email click
    const redirectTo = window.location.origin + '/login.html';

    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo
    });

    toggleLoading(false);

    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast("Reset link sent! Check your inbox.", 'success');
        switchAuthView('login');
    }
}

// --- UTILITIES ---

function switchAuthView(viewId) {
    document.querySelectorAll('.auth-view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-' + viewId);
    target.classList.remove('hidden');
    
    // Add animation class
    target.classList.remove('animate-fade-in'); // Reset to replay
    void target.offsetWidth; // Trigger reflow
    target.classList.add('animate-fade-in');
}

function togglePass(id) {
    const input = document.getElementById(id);
    const btn = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        btn.classList.add('text-brand-primary');
    } else {
        input.type = 'password';
        btn.classList.remove('text-brand-primary');
    }
}

function toggleLoading(show) {
    const loader = document.getElementById('auth-loading');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const content = document.getElementById('toast-content');
    const iconSpan = document.getElementById('toast-icon');
    const textSpan = document.getElementById('toast-text');

    // Reset Classes
    content.className = 'px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 backdrop-blur-md border';

    // Set Type Styles
    if (type === 'success') {
        content.classList.add('bg-green-500/90', 'text-white', 'border-green-400/30');
        iconSpan.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5"></i>`;
    } else if (type === 'error') {
        content.classList.add('bg-red-500/90', 'text-white', 'border-red-400/30');
        iconSpan.innerHTML = `<i data-lucide="alert-circle" class="w-5 h-5"></i>`;
    } else {
        content.classList.add('bg-gray-800/90', 'text-white', 'border-gray-700/30');
        iconSpan.innerHTML = `<i data-lucide="info" class="w-5 h-5"></i>`;
    }

    textSpan.innerText = message;
    
    if(window.lucide) lucide.createIcons();

    // Show animation
    container.classList.remove('opacity-0', 'pointer-events-none');
    
    // Hide automatically after 3.5 seconds
    setTimeout(() => {
        container.classList.add('opacity-0', 'pointer-events-none');
    }, 3500);
}
