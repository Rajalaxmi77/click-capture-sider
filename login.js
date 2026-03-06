document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email'); // Changed from userId
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    const togglePassword = document.getElementById('togglePassword');

    // API URL - change this to your deployed URL in production
    const API_URL = 'http://localhost:3001'; // Using port 3001

    // Toggle password visibility
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });

    // Check if already authenticated
    checkExistingAuth();

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
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            // Store auth data
            await chrome.storage.local.set({
                authToken: data.token,
                user: data.user,
                isAuthenticated: true,
                authExpiry: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
            });

            console.log('Login successful, redirecting...');
            
            window.location.href = 'popup.html';

        } catch (error) {
            console.error('Login error:', error);
            showError(error.message);
            setLoading(false);
        }
    });

    async function checkExistingAuth() {
        try {
            const result = await chrome.storage.local.get(['authToken', 'authExpiry', 'isAuthenticated']);
            
            if (result.isAuthenticated && result.authToken && result.authExpiry > Date.now()) {
                // Verify token with backend
                const response = await fetch(`${API_URL}/api/auth/verify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ token: result.authToken })
                });

                const data = await response.json();
                
                if (data.valid) {
                    console.log('Already authenticated, redirecting...');
                    window.location.href = 'popup.html';
                } else {
                    // Token invalid, clear storage
                    await chrome.storage.local.remove(['authToken', 'user', 'isAuthenticated', 'authExpiry']);
                }
            }
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