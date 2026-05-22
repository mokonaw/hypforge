import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { anonymous_id } = body;

    // Validate UUID format to prevent abuse
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Try to get logged-in user
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}

    let apps = [];

    if (user) {
      // Logged-in user: fetch by created_by (trusted server-side value)
      apps = await base44.asServiceRole.entities.HypApp.filter(
        { created_by: user.email },
        '-updated_date',
        100
      );
    } else if (anonymous_id && UUID_REGEX.test(anonymous_id)) {
      // Anonymous user: fetch by anonymous_id (validated UUID format)
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