import { supabaseClient } from './supabase.js';
        const REDIRECT_AFTER_AUTH = "dashboard.html";

        /* ======================================================
           2) TAB SWITCHING
           ====================================================== */
        const tabLogin = document.getElementById('tab-login');
        const tabSignup = document.getElementById('tab-signup');
        const panelLogin = document.getElementById('panel-login');
        const panelSignup = document.getElementById('panel-signup');
        const indicator = document.querySelector('.auth-tabs__indicator');
        const switchLinks = document.querySelectorAll('[data-switch-to]');

        function activate(target) {
            const toSignup = target === 'signup';
            tabLogin.classList.toggle('is-active', !toSignup);
            tabSignup.classList.toggle('is-active', toSignup);
            tabLogin.setAttribute('aria-selected', String(!toSignup));
            tabSignup.setAttribute('aria-selected', String(toSignup));
            panelLogin.hidden = toSignup;
            panelSignup.hidden = !toSignup;
            panelLogin.classList.toggle('is-active', !toSignup);
            panelSignup.classList.toggle('is-active', toSignup);
            indicator.style.transform = toSignup ? 'translateX(100%)' : 'translateX(0%)';
            hideStatus();
        }

        tabLogin.addEventListener('click', () => activate('login'));
        tabSignup.addEventListener('click', () => activate('signup'));
        switchLinks.forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.switchTo)));

        /* ======================================================
           3) PASSWORD VISIBILITY + STRENGTH METER
           ====================================================== */
        document.querySelectorAll('.field__toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = btn.previousElementSibling;
                const showing = input.type === 'text';
                input.type = showing ? 'password' : 'text';
                btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
                btn.classList.toggle('is-visible', !showing);
            });
        });

        const pwInput = document.getElementById('signup-password');
        const meterBars = document.querySelectorAll('.strength-meter span');
        if (pwInput) {
            pwInput.addEventListener('input', () => {
                const val = pwInput.value;
                let score = 0;
                if (val.length >= 8) score++;
                if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
                if (/\d/.test(val)) score++;
                if (/[^A-Za-z0-9]/.test(val)) score++;
                meterBars.forEach((bar, i) => {
                    bar.classList.toggle('is-filled', i < score);
                    bar.dataset.level = score;
                });
            });
        }

        /* ======================================================
           4) STATUS BANNER HELPERS
           ====================================================== */
        const banner = document.getElementById('status-banner');

        function showStatus(message, type) {
            banner.textContent = message;
            banner.className = `status-banner status-banner--${type}`;
            banner.hidden = false;
        }
        function hideStatus() {
            banner.hidden = true;
        }

        function setLoading(button, isLoading) {
            const label = button.querySelector('.btn-primary__label');
            const spinner = button.querySelector('.btn-primary__spinner');
            button.disabled = isLoading;
            spinner.hidden = !isLoading;
            label.style.opacity = isLoading ? '0' : '1';
        }

        function goToApp() {
            
            window.location.href = REDIRECT_AFTER_AUTH;
        }

        
        document.getElementById('signup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            hideStatus();
            const form = e.target;
            const fullName = form.fullName.value.trim();
            const email = form.email.value.trim();
            const password = form.password.value;
            const submitBtn = document.getElementById('signup-submit-btn');

            if (password.length < 8) {
                showStatus('Password must be at least 8 characters.', 'error');
                return;
            }

            setLoading(submitBtn, true);
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName } }
            });
            setLoading(submitBtn, false);
    if (data.user && !error) {
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .insert({
                id: data.user.id,       // auth user ki id, profile ki id bhi yehi hogi
                name: fullName,
                role: 'user'            // default role
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
        }
    }
            if (error) {
                showStatus(error.message, 'error');
                return;
            }

            if (data.user && !data.session) {
            
                showStatus('Account created! Check your email to confirm before signing in.', 'success');
            } else {
                showStatus('Account created successfully. Redirecting…', 'success');
                setTimeout(goToApp, 900);
            }
        });

        
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            hideStatus();
            const form = e.target;
            const email = form.email.value.trim();
            const password = form.password.value;
            const submitBtn = document.getElementById('login-submit-btn');

            setLoading(submitBtn, true);
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            setLoading(submitBtn, false);

            if (error) {
                showStatus(error.message, 'error');
                return;
            }

            showStatus('Signed in successfully. Redirecting…', 'success');
            setTimeout(goToApp, 700);
        });

        async function signInWithGoogle() {
            hideStatus();
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + '/' + REDIRECT_AFTER_AUTH }
            });
            if (error) showStatus(error.message, 'error');
        }
        document.getElementById('google-login-btn').addEventListener('click', signInWithGoogle);
        document.getElementById('google-signup-btn').addEventListener('click', signInWithGoogle);

        
        document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            if (!email) {
                showStatus('Enter your email above first, then click "Forgot password?"', 'error');
                return;
            }
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
            if (error) {
                showStatus(error.message, 'error');
            } else {
                showStatus('Password reset link sent to ' + email, 'success');
            }
        });
    