/**
 * Password Reset UI Components and Logic
 * Handles forgot password, reset password validation, and password update forms
 */

// ─────────────────────────────────────────────────────────────
// Forgot Password Modal
// ─────────────────────────────────────────────────────────────

function renderForgotPasswordModal() {
  const modal = document.createElement('div');
  modal.id = 'forgotPasswordModal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 10000;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  `;
  
  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 450px;
      width: 90%;
      padding: 40px;
      animation: slideUp 0.3s ease;
    ">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-size: 28px; margin: 0 0 10px 0; color: #333;">🔐 Reset Password</h1>
        <p style="color: #999; margin: 0;">Enter your email address and we'll send you a password reset link.</p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #333;">Email Address</label>
        <input 
          id="forgotPasswordEmail" 
          type="email" 
          placeholder="your.email@college.edu"
          style="
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s;
            box-sizing: border-box;
          "
        />
      </div>
      
      <div id="forgotPasswordError" style="
        display: none;
        background: #fee;
        color: #c33;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-size: 14px;
      "></div>
      
      <div id="forgotPasswordSuccess" style="
        display: none;
        background: #efe;
        color: #3c3;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-size: 14px;
      "></div>
      
      <button 
        onclick="sendPasswordResetEmail()"
        style="
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          margin-bottom: 12px;
        "
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102,126,234,0.6)'"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(102,126,234,0.4)'"
      >
        Send Reset Link
      </button>
      
      <button 
        onclick="closeForgotPasswordModal()"
        style="
          width: 100%;
          padding: 12px;
          background: transparent;
          color: #667eea;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        "
        onmouseover="this.style.borderColor='#667eea'; this.style.background='#f5f7ff'"
        onmouseout="this.style.borderColor='#e0e0e0'; this.style.background='transparent'"
      >
        Cancel
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
}

function openForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal') || (renderForgotPasswordModal(), document.getElementById('forgotPasswordModal'));
  modal.style.display = 'flex';
  document.getElementById('forgotPasswordEmail').focus();
  document.getElementById('forgotPasswordError').style.display = 'none';
  document.getElementById('forgotPasswordSuccess').style.display = 'none';
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) modal.style.display = 'none';
}

async function sendPasswordResetEmail() {
  const email = document.getElementById('forgotPasswordEmail').value.trim();
  const errorDiv = document.getElementById('forgotPasswordError');
  const successDiv = document.getElementById('forgotPasswordSuccess');
  const button = event.target;
  
  // Validate email
  if (!email) {
    errorDiv.textContent = '❌ Please enter your email address';
    errorDiv.style.display = 'block';
    successDiv.style.display = 'none';
    return;
  }
  
  if (!email.includes('@')) {
    errorDiv.textContent = '❌ Please enter a valid email address';
    errorDiv.style.display = 'block';
    successDiv.style.display = 'none';
    return;
  }
  
  // Show loading state
  button.disabled = true;
  button.textContent = '⏳ Sending...';
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  try {
    const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      successDiv.innerHTML = `✅ ${data.message || 'Reset link sent to your email!'}`;
      successDiv.style.display = 'block';
      errorDiv.style.display = 'none';
      document.getElementById('forgotPasswordEmail').value = '';
      
      // Close modal after 2 seconds
      setTimeout(() => {
        closeForgotPasswordModal();
        button.disabled = false;
        button.textContent = 'Send Reset Link';
      }, 2000);
    } else {
      errorDiv.textContent = `❌ ${data.error || 'Failed to send reset email'}`;
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
      button.disabled = false;
      button.textContent = 'Send Reset Link';
    }
  } catch (error) {
    errorDiv.textContent = `❌ Error: ${error.message}`;
    errorDiv.style.display = 'block';
    successDiv.style.display = 'none';
    button.disabled = false;
    button.textContent = 'Send Reset Link';
  }
}

// ─────────────────────────────────────────────────────────────
// Reset Password Page
// ─────────────────────────────────────────────────────────────

function renderResetPasswordPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (!token) {
    return `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 40px;
          max-width: 450px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        ">
          <h1 style="font-size: 24px; margin: 0 0 10px 0; color: #333;">⚠️ Invalid Link</h1>
          <p style="color: #999; margin-bottom: 20px;">The password reset link is missing or invalid.</p>
          <a href="/login" style="
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          ">← Back to Login</a>
        </div>
      </div>
    `;
  }
  
  return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 20px;
    ">
      <div style="
        background: white;
        border-radius: 12px;
        padding: 40px;
        max-width: 450px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      ">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 28px; margin: 0 0 10px 0; color: #333;">🔐 Set New Password</h1>
          <p style="color: #999; margin: 0;">Enter your new password below</p>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #333;">New Password</label>
          <input 
            id="resetPassword" 
            type="password" 
            placeholder="Enter new password (min 6 characters)"
            style="
              width: 100%;
              padding: 12px 15px;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              font-size: 14px;
              box-sizing: border-box;
            "
          />
          <div id="passwordStrength" style="
            margin-top: 8px;
            font-size: 12px;
            color: #999;
          "></div>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #333;">Confirm Password</label>
          <input 
            id="resetPasswordConfirm" 
            type="password" 
            placeholder="Confirm new password"
            style="
              width: 100%;
              padding: 12px 15px;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              font-size: 14px;
              box-sizing: border-box;
            "
          />
        </div>
        
        <div id="resetError" style="
          display: none;
          background: #fee;
          color: #c33;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 14px;
        "></div>
        
        <button 
          onclick="submitPasswordReset('${token}')"
          style="
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          "
          onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102,126,234,0.6)'"
          onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(102,126,234,0.4)'"
        >
          Update Password
        </button>
      </div>
    </div>
  `;
}

async function submitPasswordReset(token) {
  const password = document.getElementById('resetPassword').value;
  const confirmPassword = document.getElementById('resetPasswordConfirm').value;
  const errorDiv = document.getElementById('resetError');
  const button = event.target;
  
  // Validate
  if (!password || !confirmPassword) {
    errorDiv.textContent = '❌ Please fill in all fields';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (password.length < 6) {
    errorDiv.textContent = '❌ Password must be at least 6 characters';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (password !== confirmPassword) {
    errorDiv.textContent = '❌ Passwords do not match';
    errorDiv.style.display = 'block';
    return;
  }
  
  // Submit
  button.disabled = true;
  button.textContent = '⏳ Resetting...';
  
  try {
    const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        new_password: password
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Success - redirect to login
      const successDiv = document.createElement('div');
      successDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      `;
      successDiv.innerHTML = `
        <div style="
          background: white;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 400px;
        ">
          <h1 style="font-size: 32px; margin-bottom: 10px;">✅</h1>
          <p style="font-size: 18px; font-weight: 600; margin-bottom: 5px; color: #333;">Password Updated!</p>
          <p style="color: #999; margin-bottom: 20px;">You can now log in with your new password.</p>
          <p style="color: #999; font-size: 12px;">Redirecting to login...</p>
        </div>
      `;
      document.body.appendChild(successDiv);
      
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else {
      errorDiv.textContent = `❌ ${data.error || 'Failed to reset password'}`;
      errorDiv.style.display = 'block';
      button.disabled = false;
      button.textContent = 'Update Password';
    }
  } catch (error) {
    errorDiv.textContent = `❌ Error: ${error.message}`;
    errorDiv.style.display = 'block';
    button.disabled = false;
    button.textContent = 'Update Password';
  }
}

// Show password strength indicator
document.addEventListener('DOMContentLoaded', () => {
  const passwordInput = document.getElementById('resetPassword');
  if (passwordInput) {
    passwordInput.addEventListener('input', (e) => {
      const pwd = e.target.value;
      const strengthDiv = document.getElementById('passwordStrength');
      
      if (pwd.length < 6) {
        strengthDiv.textContent = '⚠️ Too short (min 6 characters)';
        strengthDiv.style.color = '#f59e0b';
      } else if (pwd.length < 8) {
        strengthDiv.textContent = '📊 Fair strength';
        strengthDiv.style.color = '#f59e0b';
      } else if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[!@#$%^&*]/.test(pwd)) {
        strengthDiv.textContent = '✅ Strong password!';
        strengthDiv.style.color = '#10b981';
      } else if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) {
        strengthDiv.textContent = '✅ Good strength';
        strengthDiv.style.color = '#10b981';
      } else {
        strengthDiv.textContent = '📊 Fair strength';
        strengthDiv.style.color = '#f59e0b';
      }
    });
  }
});
