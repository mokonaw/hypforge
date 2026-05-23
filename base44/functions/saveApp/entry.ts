import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { app_id, payload, anonymous_id } = body;

    // Try to get logged-in user
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}

    // Build the data to save
    const data = { ...payload };
    if (!user && anonymous_id) {
      data.anonymous_id = anonymous_id;
    }

    let result;
    if (app_id) {
      // Update existing — verify ownership first
      const existing = await base44.asServiceRole.entities.HypApp.get(app_id);
      if (!existing) {
        return Response.json({ error: 'App introuvable.' }, { status: 404 });
      }
      const ownerEmail = user?.email;
      const ownerAnon = anonymous_id;
      const isOwner =
        (ownerEmail && existing.created_by === ownerEmail) ||
        (ownerAnon && existing.anonymous_id === ownerAnon);
      if (!isOwner) {
        return Response.json({ error: 'Non autorisé.' }, { status: 403 });
      }
      result = await base44.asServiceRole.entities.HypApp.update(app_id, data);
    } else {
      // Create new
      result = await base44.asServiceRole.entities.HypApp.create(data);
    }

    return Response.json({ app: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});