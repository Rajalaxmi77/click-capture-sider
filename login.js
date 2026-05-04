document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email'); // Changed from userId
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    const togglePassword = document.getElementById('togglePassword');

    // API URL - change this to your deployed URL in production
    const API_URL = 'http://localhost:3000'; // Using port 3000 (Next.js app)

    // Check if already authenticated
    checkExistingAuth();

    async function getSession() {
        try {
            const response = await fetch(`${API_URL}/api/auth/session`, {
                method: 'GET',
                credentials: 'include'
            });
            if (!response.ok) return null;
            const data = await response.json().catch(() => null);
            if (!data || !data.user) return null;
            return data;
        } catch (error) {
            return null;
        }
    }

    
    // Toggle password visibility
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });

    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            showError('Please enter both email and password');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError('Please enter a valid email address');
            return;
        }

        setLoading(true);
        
        try {
            const signInOk = await signInWithCredentials(email, password);
            if (!signInOk) {
                throw new Error('Authentication failed');
            }

            const session = await getSession();
            if (!session?.user) {
                throw new Error('Login failed. Please check your credentials.');
            }

            const rawUser = session.user || {};
            const normalizedUser = {
                ...rawUser,
                firstName: rawUser.firstName || (rawUser.name ? rawUser.name.split(' ')[0] : ''),
                lastName: rawUser.lastName || (rawUser.name ? rawUser.name.split(' ').slice(1).join(' ') : '')
            };

            const expiry = session.expires ? Date.parse(session.expires) : Date.now() + (24 * 60 * 60 * 1000);

            await chrome.storage.local.set({
                user: normalizedUser,
                isAuthenticated: true,
                authExpiry: expiry
            });

            console.log('Login successful, redirecting...');
            window.location.href = 'popup.html';

        } catch (error) {
            console.error('Login error:', error);
            showError(error.message || 'Login failed');
            setLoading(false);
        }
    });
    

    async function signInWithCredentials(email, password) {
        const csrfRes = await fetch(`${API_URL}/api/auth/csrf`, {
            method: 'GET',
            credentials: 'include'
        });
        const csrfData = await csrfRes.json().catch(() => null);
        const csrfToken = csrfData?.csrfToken;
        if (!csrfToken) {
            throw new Error('Unable to start sign-in. Please refresh and try again.');
        }

        const body = new URLSearchParams({
            csrfToken,
            email,
            password,
            callbackUrl: `${API_URL}/`
        });

        const response = await fetch(`${API_URL}/api/auth/callback/credentials`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        return response.ok || response.status === 302;
    }

    async function checkExistingAuth() {
        try {
            const session = await getSession();
            if (!session?.user) {
                return;
            }

            const rawUser = session.user || {};
            const normalizedUser = {
                ...rawUser,
                firstName: rawUser.firstName || (rawUser.name ? rawUser.name.split(' ')[0] : ''),
                lastName: rawUser.lastName || (rawUser.name ? rawUser.name.split(' ').slice(1).join(' ') : '')
            };
            const expiry = session.expires ? Date.parse(session.expires) : Date.now() + (24 * 60 * 60 * 1000);

            await chrome.storage.local.set({
                user: normalizedUser,
                isAuthenticated: true,
                authExpiry: expiry
            });

            console.log('Already authenticated, redirecting...');
            
            window.location.href = 'popup.html'; //redirect to popup if already authenticated
        } catch (error) {
            console.log('Auth verification failed:', error);
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 5000);
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loginBtn.disabled = true;
            loading.classList.add('show');
        } else {
            loginBtn.disabled = false;
            loading.classList.remove('show');
        }
    }
});
