"""
Password Reset Email Template Generator
Creates beautiful HTML email for password reset token links
"""

def get_password_reset_email_html(reset_url: str, user_name: str = "User", app_name: str = "SMART AMS") -> str:
    """
    Generate a beautiful HTML email template for password reset
    
    Args:
        reset_url: The password reset link (e.g., https://app.com/reset?token=xyz)
        user_name: User's name to personalize the email
        app_name: Application name (default: SMART AMS)
    
    Returns:
        HTML string for the email body
    """
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - {app_name}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            color: #333;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }}
        .header h1 {{
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
        }}
        .header p {{
            font-size: 14px;
            opacity: 0.9;
        }}
        .content {{
            padding: 40px 30px;
        }}
        .greeting {{
            font-size: 16px;
            margin-bottom: 20px;
            color: #555;
        }}
        .greeting strong {{
            color: #333;
        }}
        .message {{
            font-size: 14px;
            line-height: 1.6;
            color: #666;
            margin-bottom: 30px;
        }}
        .reset-button {{
            display: inline-block;
            padding: 14px 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            cursor: pointer;
        }}
        .reset-button:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }}
        .button-container {{
            text-align: center;
            margin: 30px 0;
        }}
        .link-section {{
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-top: 30px;
            text-align: center;
        }}
        .link-section p {{
            font-size: 12px;
            color: #999;
            margin-bottom: 10px;
        }}
        .link-section a {{
            font-size: 13px;
            color: #667eea;
            text-decoration: none;
            word-break: break-all;
        }}
        .warning {{
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            border-radius: 4px;
            margin-top: 30px;
            font-size: 13px;
            color: #856404;
            line-height: 1.5;
        }}
        .footer {{
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }}
        .footer p {{
            font-size: 12px;
            color: #999;
            margin-bottom: 10px;
        }}
        .divider {{
            margin: 20px 0;
            border: 0;
            border-top: 1px solid #e9ecef;
        }}
        .social-links {{
            margin-top: 15px;
        }}
        .social-links a {{
            display: inline-block;
            width: 40px;
            height: 40px;
            line-height: 40px;
            text-align: center;
            background: #e9ecef;
            border-radius: 50%;
            color: #667eea;
            text-decoration: none;
            margin: 0 5px;
            font-size: 18px;
            transition: all 0.2s;
        }}
        .social-links a:hover {{
            background: #667eea;
            color: white;
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>🔐 Password Reset</h1>
            <p>{app_name}</p>
        </div>

        <!-- Content -->
        <div class="content">
            <div class="greeting">
                Hi <strong>{user_name}</strong>,
            </div>

            <div class="message">
                <p>We received a request to reset the password for your {app_name} account. Click the button below to set a new password:</p>
            </div>

            <!-- Reset Button -->
            <div class="button-container">
                <a href="{reset_url}" class="reset-button">Reset Password</a>
            </div>

            <!-- Alternative Link -->
            <div class="link-section">
                <p>Or copy and paste this link in your browser:</p>
                <a href="{reset_url}">{reset_url}</a>
            </div>

            <!-- Warning -->
            <div class="warning">
                <strong>⚠️ Security Notice:</strong> This password reset link will expire in 24 hours. If you didn't request this reset, please <a href="mailto:support@smartams.com" style="color: #856404;">contact our support team</a> immediately.
            </div>

            <!-- Additional Info -->
            <p style="margin-top: 30px; font-size: 13px; color: #999; line-height: 1.6;">
                <strong>Why did you receive this email?</strong><br>
                This email was sent because someone (hopefully you) requested a password reset for this account. If this wasn't you, please ignore this email or contact support.
            </p>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p><strong>{app_name}</strong></p>
            <p>Smart Attendance Management System</p>
            <hr class="divider">
            <p>© 2026 SMART AMS. All rights reserved.</p>
            <p>Questions? <a href="mailto:support@smartams.com" style="color: #667eea; text-decoration: none;">Contact our support team</a></p>
            
            <div class="social-links">
                <a href="#" title="Facebook">f</a>
                <a href="#" title="Twitter">≣</a>
                <a href="#" title="LinkedIn">in</a>
            </div>
        </div>
    </div>
</body>
</html>"""


def get_password_reset_email_text(reset_url: str, user_name: str = "User", app_name: str = "SMART AMS") -> str:
    """
    Generate a plain text version of the password reset email
    
    Args:
        reset_url: The password reset link
        user_name: User's name
        app_name: Application name
    
    Returns:
        Plain text string for the email body
    """
    return f"""Password Reset Request - {app_name}

Hi {user_name},

We received a request to reset the password for your {app_name} account. 

Click the link below to set a new password:
{reset_url}

This link will expire in 24 hours.

SECURITY NOTICE:
If you didn't request this password reset, please ignore this email or contact our support team immediately.

Why did you receive this email?
This email was sent because someone requested a password reset for this account. If this wasn't you, please ignore this email.

---
© 2026 SMART AMS
Smart Attendance Management System
support@smartams.com
"""


if __name__ == "__main__":
    # Example usage
    example_url = "https://smart-ams-project-faa5f.web.app/reset?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    
    print("HTML Email Template:")
    print("=" * 50)
    html_email = get_password_reset_email_html(example_url, "John Doe")
    print(html_email[:200], "...")
    
    print("\n\nPlain Text Email Template:")
    print("=" * 50)
    text_email = get_password_reset_email_text(example_url, "John Doe")
    print(text_email)
