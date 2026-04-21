import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "your-service-role-key")

# Use service role key — bypasses RLS for bulk ops
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
