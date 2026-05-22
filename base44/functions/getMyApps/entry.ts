import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { anonymous_id } = body;

    // Try to get logged-in user
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}

    let apps = [];

    if (user) {
      // Logged-in user: fetch by created_by
      apps = await base44.asServiceRole.entities.HypApp.filter(
        { created_by: user.email },
        '-updated_date',
        100
      );
    } else if (anonymous_id) {
      // Anonymous user: fetch by anonymous_id
      apps = await base44.asServiceRole.entities.HypApp.filter(
        { anonymous_id: anonymous_id },
        '-updated_date',
        100
      );
    }

    return Response.json({ apps });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});