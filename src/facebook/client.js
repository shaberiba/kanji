import { config } from '../config.js';
import { logger } from '../logger.js';
import { getFacebookToken, markTokenStatus } from '../db/tokenStore.js';
import { parseGraphError } from './errors.js';

const GRAPH_BASE = 'https://graph.facebook.com';
const FALLBACK_GRAPH_VERSION = 'v18.0';

async function graphRequest(version, path, { method = 'GET', params = {} } = {}) {
  const url = new URL(`${GRAPH_BASE}/${version}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, { method });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw parseGraphError(response.status, body);
  }
  return body;
}

/**
 * Step 2 of the manual token setup flow: exchange a short-lived user token
 * (obtained via Graph API Explorer) for a long-lived one (~60 days).
 */
export async function exchangeLongLivedUserToken(shortLivedToken) {
  const body = await graphRequest(config.facebook.graphApiVersion, '/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.facebook.appId,
      client_secret: config.facebook.appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  return body.access_token;
}

/**
 * Step 3: derive a (effectively non-expiring) Page Access Token from a
 * long-lived user token.
 */
export async function fetchPageToken(longLivedUserToken, pageId) {
  const body = await graphRequest(config.facebook.graphApiVersion, `/${pageId}`, {
    params: {
      fields: 'id,name,access_token',
      access_token: longLivedUserToken,
    },
  });
  return { id: body.id, name: body.name, accessToken: body.access_token };
}

/**
 * Read-only health check: confirms the stored page token is still valid.
 */
export async function verifyPageToken() {
  const record = getFacebookToken(config.facebook.pageId);
  if (!record) {
    return { ok: false, reason: 'No Facebook token stored yet. Run the setup script.' };
  }

  try {
    const body = await graphRequest(config.facebook.graphApiVersion, `/${config.facebook.pageId}`, {
      params: { fields: 'id,name', access_token: record.page_access_token },
    });
    markTokenStatus(config.facebook.pageId, 'valid');
    return { ok: true, pageId: body.id, pageName: body.name, record };
  } catch (error) {
    if (error.isAuthError) {
      markTokenStatus(config.facebook.pageId, 'invalid');
    }
    return { ok: false, reason: error.message, error, record };
  }
}

/**
 * Publishes a plain Page post (message + optional link). Uses pages_manage_posts,
 * which - unlike the events edge - is still current and confirmed working.
 */
export async function createPost({ message, link }) {
  const record = getFacebookToken(config.facebook.pageId);
  if (!record) {
    throw new Error('No Facebook token stored. An admin needs to run the token setup script.');
  }

  const params = { message, access_token: record.page_access_token };
  if (link) params.link = link;

  try {
    const post = await graphRequest(config.facebook.graphApiVersion, `/${config.facebook.pageId}/feed`, {
      method: 'POST',
      params,
    });
    return { postId: post.id, postUrl: `https://www.facebook.com/${post.id}` };
  } catch (error) {
    if (error.isAuthError) {
      markTokenStatus(config.facebook.pageId, 'invalid');
    }
    throw error;
  }
}

const MAX_FUTURE_OCCURRENCES_PER_SERIES = 5;

/**
 * A recurring Facebook event comes back as one parent object plus an
 * `event_times` array - one entry per occurrence, each with its own id/
 * start_time/end_time. Expand each occurrence into a standalone event
 * (inheriting the parent's name/description/place/cover) so every future
 * occurrence gets synced individually instead of only ever the parent's
 * own start_time. Same approach as denver-shaberiba's calendar feed.
 *
 * Capped to the next MAX_FUTURE_OCCURRENCES_PER_SERIES occurrences (a
 * biweekly series can have a year+ of dates queued up on Facebook) so a
 * single series doesn't flood the server's Events tab with dozens of
 * entries - past occurrences are dropped entirely rather than synced and
 * skipped, since there's no reason to keep tracking them.
 */
function expandRecurringEvents(events) {
  const now = new Date();
  const expanded = [];
  for (const event of events) {
    if (event.event_times?.length) {
      const upcoming = event.event_times
        .filter((occurrence) => new Date(occurrence.start_time) > now)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .slice(0, MAX_FUTURE_OCCURRENCES_PER_SERIES);

      for (const occurrence of upcoming) {
        expanded.push({
          ...event,
          id: occurrence.id,
          start_time: occurrence.start_time,
          end_time: occurrence.end_time,
          event_times: undefined,
        });
      }
    } else {
      expanded.push(event);
    }
  }
  return expanded;
}

/**
 * Reads events already on the Page (created manually via the Facebook web UI,
 * since this app can't create them via API - see createEvent()). Read access
 * has historically been less restricted than write access, but has not been
 * confirmed to work for this app; callers should handle failures gracefully.
 */
export async function listPageEvents() {
  const record = getFacebookToken(config.facebook.pageId);
  if (!record) {
    throw new Error('No Facebook token stored. An admin needs to run the token setup script.');
  }

  const body = await graphRequest(config.facebook.graphApiVersion, `/${config.facebook.pageId}/events`, {
    params: {
      fields: 'id,name,description,start_time,end_time,place,cover,event_times',
      access_token: record.page_access_token,
    },
  });
  return expandRecurringEvents(body.data ?? []);
}

/**
 * Deletes a Facebook Page event. Requires the Page token to have been
 * granted event-management permission - previously blocked by the app's
 * permission grant on the Page, same restriction class as createEvent().
 */
export async function deleteEvent(eventId) {
  const record = getFacebookToken(config.facebook.pageId);
  if (!record) {
    throw new Error('No Facebook token stored. An admin needs to run the token setup script.');
  }

  try {
    await graphRequest(config.facebook.graphApiVersion, `/${eventId}`, {
      method: 'DELETE',
      params: { access_token: record.page_access_token },
    });
  } catch (error) {
    if (error.isAuthError) {
      markTokenStatus(config.facebook.pageId, 'invalid');
    }
    throw error;
  }
}

function buildManualCreateInstructions({ name, startTimeIso, endTimeIso, description, location }) {
  const lines = [
    `Name: ${name}`,
    `Start: ${startTimeIso}`,
    endTimeIso ? `End: ${endTimeIso}` : null,
    description ? `Description: ${description}` : null,
    location ? `Location: ${location}` : null,
  ].filter(Boolean);

  return {
    pageEventsUrl: `https://www.facebook.com/${config.facebook.pageId}/events`,
    details: lines.join('\n'),
  };
}

async function createEventAtVersion(version, pageAccessToken, { name, startTimeIso, endTimeIso, description, location }) {
  return graphRequest(version, `/${config.facebook.pageId}/events`, {
    method: 'POST',
    params: {
      name,
      start_time: startTimeIso,
      end_time: endTimeIso,
      description,
      location,
      access_token: pageAccessToken,
    },
  });
}

/**
 * Creates a Facebook Page event. Isolated single point of change: if the
 * `/events` edge stops working for this app, only this function's fallback
 * chain needs to change, not the Discord command layer.
 *
 * Returns one of:
 *  - { status: 'created', eventId, eventUrl }
 *  - { status: 'manual_fallback', pageEventsUrl, details }
 *  - { status: 'posted_fallback', postId }
 * Throws FacebookApiError for auth errors (caller should tell the user to re-auth).
 */
export async function createEvent(eventInput) {
  const record = getFacebookToken(config.facebook.pageId);
  if (!record) {
    throw new Error('No Facebook token stored. An admin needs to run the token setup script.');
  }
  const pageAccessToken = record.page_access_token;

  try {
    const result = await createEventAtVersion(config.facebook.graphApiVersion, pageAccessToken, eventInput);
    return { status: 'created', eventId: result.id, eventUrl: `https://www.facebook.com/events/${result.id}` };
  } catch (primaryError) {
    if (primaryError.isAuthError) {
      markTokenStatus(config.facebook.pageId, 'invalid');
      throw primaryError;
    }

    logger.warn({ err: primaryError }, 'Primary Graph API version rejected event creation, retrying on fallback version');

    try {
      const result = await createEventAtVersion(FALLBACK_GRAPH_VERSION, pageAccessToken, eventInput);
      return { status: 'created', eventId: result.id, eventUrl: `https://www.facebook.com/events/${result.id}` };
    } catch (versionRetryError) {
      if (versionRetryError.isAuthError) {
        markTokenStatus(config.facebook.pageId, 'invalid');
        throw versionRetryError;
      }
      if (versionRetryError.isRateLimited) {
        throw versionRetryError;
      }

      // Note: Meta overloads code 100 ("invalid parameter") for both genuine
      // bad input and "this edge doesn't exist/isn't available to your app"
      // (e.g. error_subcode 33). Since start_time/end_time are already
      // validated client-side before this is ever called, treat any
      // non-auth/non-rate-limit error here as "the events edge is dead for
      // this app" and fall through to the Page-post fallback rather than
      // surfacing what looks like a validation error to the user.
      logger.warn({ err: versionRetryError }, 'Events edge unavailable for this app, falling back to a Page post');

      try {
        const message = [
          `New event: ${eventInput.name}`,
          `When: ${eventInput.startTimeIso}${eventInput.endTimeIso ? ` - ${eventInput.endTimeIso}` : ''}`,
          eventInput.location ? `Where: ${eventInput.location}` : null,
          eventInput.description || null,
        ].filter(Boolean).join('\n');

        const post = await createPost({ message });
        return { status: 'posted_fallback', postId: post.postId };
      } catch (postError) {
        logger.warn({ err: postError }, 'Page post fallback also failed, falling back to manual instructions');
        return { status: 'manual_fallback', ...buildManualCreateInstructions(eventInput) };
      }
    }
  }
}
