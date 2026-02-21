import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type RequestBody = {
  action?: 'change_password' | 'delete_user';
  profile_id?: string;
  new_password?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Server configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user: callerUser },
      error: callerError
    } = await callerClient.auth.getUser();

    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('auth_user_id', callerUser.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ ok: false, error: 'Admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = (await req.json()) as RequestBody;

    if (body.action !== 'change_password' && body.action !== 'delete_user') {
      return new Response(JSON.stringify({ ok: false, error: 'Unsupported action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!body.profile_id) {
      return new Response(JSON.stringify({ ok: false, error: 'profile_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── DELETE USER ──────────────────────────────────────────────────────────
    if (body.action === 'delete_user') {
      // Prevent admin from deleting themselves
      if (callerProfile.id === body.profile_id) {
        return new Response(JSON.stringify({ ok: false, error: 'You cannot delete your own account' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: targetProfile, error: targetError } = await adminClient
        .from('profiles')
        .select('id, auth_user_id, username')
        .eq('id', body.profile_id)
        .maybeSingle();

      if (targetError || !targetProfile) {
        return new Response(JSON.stringify({ ok: false, error: 'Target user not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 1. Purge all profile data (stats, seats, sessions, chat, etc.)
      const { error: rpcError } = await adminClient.rpc('admin_delete_player', {
        p_profile_id: body.profile_id
      });

      if (rpcError) {
        return new Response(JSON.stringify({ ok: false, error: rpcError.message || 'Failed to delete player data' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Remove the auth user (triggers cascade deletion of profile if still present)
      if (targetProfile.auth_user_id) {
        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(
          targetProfile.auth_user_id
        );

        if (authDeleteError) {
          return new Response(JSON.stringify({ ok: false, error: authDeleteError.message || 'Failed to delete auth user' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response(
        JSON.stringify({ ok: true, deleted: targetProfile.username }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── CHANGE PASSWORD ──────────────────────────────────────────────────────

    if (!body.new_password) {
      return new Response(JSON.stringify({ ok: false, error: 'new_password is required for change_password action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (body.new_password.length < 6) {
      return new Response(JSON.stringify({ ok: false, error: 'Password must be at least 6 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('id, auth_user_id, username')
      .eq('id', body.profile_id)
      .maybeSingle();

    if (targetError || !targetProfile?.auth_user_id) {
      return new Response(JSON.stringify({ ok: false, error: 'Target user not found or not linked to auth' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const updateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetProfile.auth_user_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify({ password: body.new_password })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      return new Response(JSON.stringify({ ok: false, error: `Auth admin update failed: ${errorText}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({ ok: true, profile_id: targetProfile.id, username: targetProfile.username }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
